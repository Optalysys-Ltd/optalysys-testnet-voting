// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
// https://github.com/FhenixProtocol/confidential-voting/blob/main/contracts/Voting.sol
import {FHE, CoprocessorConfig, euint32, externalEuint8, euint8, euint16, ebool} from "@fhevm/solidity/lib/FHE.sol";

/// @title EncryptedVoting
/// @notice A basic contract demonstrating the setup of encrypted types
/// @dev Uses TFHE library for fully homomorphic encryption operations
/// @custom:experimental This is a minimal example contract intended only for learning purposes
/// @custom:notice This contract has limited real-world utility and serves primarily as a starting point
/// for understanding how to implement basic FHE operations in Solidity
import "hardhat/console.sol";

contract EncryptedVoting {
    address internal ownerAddress;

    // Pre-compute these to prevent unnecessary gas usage for the users
    euint8 internal _zero;
    euint8 internal _one;

    uint16 public totalVotes; // to keep track of the total number of votes

    string public proposal;

    ebool public voteIsValid;
    euint8 internal _winningOption;
    euint16 internal _winningTally;

    euint16 internal _yesCount;
    euint16 internal _noCount;

    constructor(
        address aclAdd,
        address fhevmExecutorAdd,
        address kmsVerifierAdd,
        address decryptionOracleAdd,
        string memory _proposal
    ) {
        FHE.setCoprocessor(
            CoprocessorConfig({
                ACLAddress: aclAdd,
                CoprocessorAddress: fhevmExecutorAdd,
                DecryptionOracleAddress: decryptionOracleAdd,
                KMSVerifierAddress: kmsVerifierAdd
            })
        );
        // Pre-compute these to prevent unnecessary gas usage for the users
        _zero = FHE.asEuint8(0);
        FHE.allowThis(_zero);
        _one = FHE.asEuint8(1);
        FHE.allowThis(_one);

        _yesCount = FHE.asEuint16(0);
        _noCount = FHE.asEuint16(0);

        FHE.allowThis(_yesCount);
        FHE.allowThis(_noCount);

        proposal = _proposal;
        ownerAddress = msg.sender;
    }

    /// @notice Cast a vote
    function castVote(
        externalEuint8 inputEuintVote,
        bytes calldata inputProof
    ) external {
        euint8 eVote = FHE.fromExternal(inputEuintVote, inputProof);

        // Unaware how to validate check encrypted types currently
        // Validate in isValidVote()

        ebool isOne = FHE.eq(eVote, _one);

        _yesCount = FHE.select(
            isOne,
            FHE.add(_yesCount, FHE.asEuint16(1)),
            _yesCount
        );
        _noCount = FHE.select(
            isOne,
            _noCount,
            FHE.add(_noCount, FHE.asEuint16(1))
        );
        totalVotes = totalVotes + 1;

        FHE.allowThis(_yesCount);
        FHE.allow(_yesCount, msg.sender);
        FHE.allowThis(_noCount);
        FHE.allow(_noCount, msg.sender);
    }

    function isValidVote(
        externalEuint8 inputEuintVote,
        bytes calldata inputProof
    ) public {
        euint8 eVote = FHE.fromExternal(inputEuintVote, inputProof);
        // Encrypted comparison
        ebool isOne = FHE.eq(eVote, _one);
        ebool isZero = FHE.eq(eVote, _zero);
        voteIsValid = FHE.or(isOne, isZero);
        // Allow the user to use the encrypted result stored in voteIsValid
        // The user will be able to do a reencrypt on this value if needed
        FHE.allow(voteIsValid, msg.sender);
        // Allow also the contract, otherwise the contract won't be able to use the ciphertext in the future
        FHE.allowThis(voteIsValid);
        // no return as the return value cannot be reencrypted in a transaction call
        // Use the public variable voteIsValid to get the encrypted value
    }

    function finalize() public {
        require(
            msg.sender == ownerAddress,
            "Only the contract owner can finalize!"
        );
        console.log("Finalising votes");
        _winningOption = FHE.select(FHE.ge(_yesCount, _noCount), _one, _zero);
        _winningTally = FHE.select(
            FHE.ge(_yesCount, _noCount),
            _yesCount,
            _noCount
        );
        FHE.makePubliclyDecryptable(_winningOption);
        FHE.allow(_winningOption, msg.sender);
        FHE.allowThis(_winningOption);

        FHE.makePubliclyDecryptable(_winningTally);
        FHE.allow(_winningTally, msg.sender);
        FHE.allowThis(_winningTally);
    }

    function winning() public view returns (euint8, euint16) {
        return (_winningOption, _winningTally);
    }
}
