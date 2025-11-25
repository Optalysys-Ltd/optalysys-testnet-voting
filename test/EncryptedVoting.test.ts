import { EncryptedVoting, EncryptedVoting__factory } from "../typechain-types";
import { expect } from "chai";
import { ethers, fhevm as mockFhevm } from "hardhat";
import { createInstance, loadTestnetConfig, loadWallet, setupUserDecrypt, timestampLog } from "../tasks/utils";
import { JsonRpcProvider, HDNodeWallet } from "ethers";
import { FhevmInstance } from "@zama-fhe/relayer-sdk/node";
import { HardhatFhevmRuntimeEnvironment, FhevmType } from "@fhevm/hardhat-plugin";


async function deployFixture() {
    const keyFile = "key.json";
    const networkName = process.env.NETWORK || "hardhat";
    let wallet: HDNodeWallet;
    let contractFactory: EncryptedVoting__factory;
    let walletAddress: string;
    let fhevm: FhevmInstance | HardhatFhevmRuntimeEnvironment;
    timestampLog("Network name: " + networkName);
    const configFile = networkName == "optalysys" ? "testnet_config.json" : "mocked_config.json";
    if (networkName == "optalysys") {
        timestampLog("Loading wallet")
        wallet = await loadWallet(keyFile) as HDNodeWallet;
        walletAddress = wallet.address;
    } else {
        timestampLog("Running on hardhat, using mocked config");
        const signers = await ethers.getSigners();
        wallet = signers[0];
        walletAddress = wallet.address;
    }

    timestampLog("Loading testnet config")
    const testnetConfig = await loadTestnetConfig(configFile);
    timestampLog("Connecting provider")

    const provider = ethers.getDefaultProvider(testnetConfig.jsonRpcUrl) as JsonRpcProvider;
    if (networkName == "optalysys") {
        timestampLog("Connecting wallet");
        wallet = wallet.connect(provider);
        contractFactory = new EncryptedVoting__factory(wallet);
        timestampLog("Creating fhevm instance");

        fhevm = await createInstance(
            testnetConfig.decryptionContractAddress,
            testnetConfig.inputVerificationContractAddress,
            testnetConfig.inputVerifierContractAddress,
            testnetConfig.kmsVerifierContractAddress,
            testnetConfig.aclContractAddress,
            testnetConfig.gatewayChainId,
            testnetConfig.relayerUrl,
            testnetConfig.jsonRpcUrl,
        )
    } else {
        contractFactory = await ethers.getContractFactory("EncryptedVoting") as unknown as EncryptedVoting__factory;
        timestampLog("Using mock fhevm");
        fhevm = mockFhevm;
    }

    timestampLog("Deploying contract")
    const encryptedVotingContract = await contractFactory.deploy(
        ethers.getAddress(testnetConfig.aclContractAddress),
        ethers.getAddress(testnetConfig.fhevmExecutorContractAddress),
        ethers.getAddress(testnetConfig.kmsVerifierContractAddress),
        ethers.getAddress(testnetConfig.decryptionOracleContractAddress),
        "Is writing FHE contracts easy?"
    );
    timestampLog("Waiting for deployment...")
    const receipt = await (await encryptedVotingContract.waitForDeployment()).deploymentTransaction()?.wait()
    timestampLog("Contract deployed at block: " + receipt?.blockNumber);
    const encryptedVotingContractAddress = receipt?.contractAddress as string;
    timestampLog("Contract address: " + encryptedVotingContractAddress)


    return { encryptedVotingContract, encryptedVotingContractAddress, wallet, walletAddress, fhevm };
}

describe("EncryptedVoting", function () {
    let encryptedVotingContract: EncryptedVoting;
    let encryptedVotingContractAddress: string;
    let wallet: HDNodeWallet;
    let fhevm: FhevmInstance | HardhatFhevmRuntimeEnvironment;
    let walletAddress: string;

    before(async () => {
        ({ encryptedVotingContract, encryptedVotingContractAddress, wallet, walletAddress, fhevm } = await deployFixture());
    });


    it("validate vote", async function () {
        type VoteValid = {
            vote: number;
            valid: boolean,
        }
        const voteValuesValid: VoteValid[] = [{ vote: 1, valid: true }, { vote: 0, valid: true }, { vote: 100, valid: false }, { vote: 2, valid: false }, { vote: 10, valid: false },];

        for (const voteValueValid of voteValuesValid) {
            // Encrypt constant clearVote as a euint8
            const clearVote = voteValueValid.vote;
            const expectedValid = voteValueValid.valid;
            const encryptedFour = await fhevm
                .createEncryptedInput(encryptedVotingContractAddress, walletAddress)
                .add8(clearVote)
                .encrypt();

            const tx = await encryptedVotingContract
                .connect(wallet)
                .isValidVote(encryptedFour.handles[0], encryptedFour.inputProof);
            await tx.wait();

            const eVoteIsValid = await encryptedVotingContract.voteIsValid();
            if (fhevm.isMock) {
                const clearVoteIsValid = await fhevm.userDecryptEbool(
                    eVoteIsValid,
                    encryptedVotingContractAddress,
                    wallet,
                );
                expect(clearVoteIsValid).to.eq(expectedValid);
            }
        }


    }).timeout(4 * 60 * 1000);

    it("voting flow valid vote", async function () {
        type VoteValid = {
            vote: number;
            valid: boolean,
        }
        const voteValuesValid: VoteValid[] = [{ vote: 1, valid: true }, { vote: 1, valid: true }, { vote: 0, valid: true }, { vote: 100, valid: false }, { vote: 2, valid: false }, { vote: 10, valid: false }, { vote: 1, valid: true }, { vote: 0, valid: true }];

        for (const voteValueValid of voteValuesValid) {
            // Encrypt constant clearVote as a euint8
            const clearVote = voteValueValid.vote;
            const expectedValid = voteValueValid.valid;
            const encryptedFour = await fhevm
                .createEncryptedInput(encryptedVotingContractAddress, walletAddress)
                .add8(clearVote)
                .encrypt();

            const tx = await encryptedVotingContract
                .connect(wallet)
                .isValidVote(encryptedFour.handles[0], encryptedFour.inputProof);
            await tx.wait();

            const eVoteIsValid = await encryptedVotingContract.voteIsValid();
            if (fhevm.isMock) {
                const clearVoteIsValid = await fhevm.userDecryptEbool(
                    eVoteIsValid,
                    encryptedVotingContractAddress,
                    wallet,
                );
                expect(clearVoteIsValid).to.eq(expectedValid);

                if (clearVoteIsValid) {
                    // proceed with voting
                    const tx = await encryptedVotingContract
                        .connect(wallet)
                        .castVote(encryptedFour.handles[0], encryptedFour.inputProof);
                    await tx.wait();
                    console.log("casted vote");
                }
            }
        }

        const totalVotes = await encryptedVotingContract.totalVotes();
        expect(totalVotes).to.equal(5);

        await encryptedVotingContract.connect(wallet).finalize();
        const [eWinningOption, eWinningTally] = await encryptedVotingContract.connect(wallet).winning();
        if (fhevm.isMock) {
            const clearWinningOption = await fhevm.publicDecryptEuint(
                FhevmType.euint8,
                eWinningOption
            );
            expect(clearWinningOption).to.eq(1);

            const clearWinningTally = await fhevm.publicDecryptEuint(
                FhevmType.euint16,
                eWinningTally
            );
            expect(clearWinningTally).to.eq(3);


        }


    }).timeout(4 * 60 * 1000);

});