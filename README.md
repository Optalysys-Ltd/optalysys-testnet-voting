# User Instructions for Optalysys Testnet

## Quickstart

> If you already familiar with interacting with Ethereum blockchains using the JSON RPC API, writing smart contracts in Solidity and writing javascript or typescript you can get started with the below. Otherwise see the [detailed guide](#detailed-guide).

1. Generate an Ethereum compatible private key.
2. Give Optalysys the address derived from your private key and request testnet Eth to be allocated.
3. Request the JSON RPC URL, relayer URL, gateway chain ID, ACL contract address, FHEVM executor contract address, KMS verifier contract address, decryption oracle contract address, input verifier contract address, input verification contract address and decryption contract address from Optalysys. These can be found in the file `testnet_config.json` within this repo.
4. Write an FHE smart contract using [Zama's Solidity docs](https://docs.zama.ai/protocol/solidity-guides/smart-contract/configure) (but with **config explicitly set to use the addresses provided by Optalysys, not Zama's config for Sepolia** - as the addresses are of course different). Use [Zama's Solidity library](https://www.npmjs.com/package/@fhevm/solidity) at version v0.8.0 (other versions may work, but currently the server side of Optalysys' testnet uses versions of Zama's stack known to be compatible with v0.8.0).
4. Deploy your smart contract using your method of choice through the JSON RPC URL provided by Optalysys in step 3 using you private key that was funded in step 2 to sign the transaction. See the [Ethereum documentation on deploying smart contracts](https://ethereum.org/developers/docs/smart-contracts/deploying/) if you don't know how to do this.
5. Interact with your contract using your method of choice and create encrypted inputs to send to it / request decryptions using [Zama's relayer SDK](https://www.npmjs.com/package/@zama-fhe/relayer-sdk) at version v0.2.0 (other versions may work, but the current version of Zama's relayer run on Optalysys' testnet is known to be compatible with v0.2.0) - using the details provided by Optalysys in step 3 to initialise the relayer SDK.

## Detailed Guide

> All commands in this guide assume you are running them from the directory in which this guide exists on your machine.

### Pre-requisites

> This guide uses [pnpm](https://pnpm.io/installation). If you already have this installed on your machine or know how to run a container with them installed you can skip this section.

It is recommended to run this guide in a container, to avoid the [it works on my machine issue](https://expertbeacon.com/the-works-on-my-machine-problem-causes-solutions-and-lessons-from-google/).

> This guide uses Docker, but you can use another container management tool if you wish (e.g. podman).

Follow the instructions for [installing Docker on your machine](https://docs.docker.com/engine/install/). Alternatively, install pnpm directly on your machine.

After you have Docker installed you can start an Ubuntu container with this Docker command.
```bash
docker run --hostname docker-ubuntu -it --rm -v .:/home/ubuntu/guide --workdir /home/ubuntu/guide --user 1000:1000 ubuntu:latest bash
```

> All commands in the rest of this guide will assume they are being run from within this container or another equivalent environment you have setup.

The following commands will be run inside the Docker container. Make sure the shell prompt shows `ubuntu@docker-ubuntu:~/guide#` which means you are running the Docker container's shell.

> If your company uses a proxy, you will need to [add their CA certificates to the container](https://docs.docker.com/engine/network/ca-certs/#add-ca-certificates-to-linux-images-and-containers) to ensure commands like `apt` and `pnpm install` work.

These commands downloads `wget`, downloads the and runs `pnpm` installer, sources the `pnpm` env variables and downloads the NodeJS binary.

```
apt update && apt upgrade -y && apt install -y wget
wget -qO- https://get.pnpm.io/install.sh | ENV="$HOME/.bashrc" SHELL="$(which bash)" bash -
source $HOME/.bashrc
pnpm env use --global lts
```

### Install Dependencies

Install the dependencies for the code used in this guide

```bash
pnpm install
```

### Generate an Ethereum Compatible Private Key

- **Either** [generate a new Ethereum compatible private key](#generate-a-new-ethereum-compatible-private-key)
- **Or** [import an existing Ethereum compatible private key](#import-an-existing-ethereum-compatible-private-key)

#### Generate a new Ethereum compatible private key

> Enter a password when prompted, or set the `WALLET_PASSWORD` env var

```bash
pnpm hardhat task:accountCreate --key-file key.json
```

> You can output the decrypted private key with `pnpm hardhat task:accountPrintPrivateKey --key-file key.json` - beware that printing it to your terminal is not recommended.

#### Import an existing Ethereum compatible private key

Set the environment variable `PRIVATE_KEY` to your private key.

> Enter a password when prompted, or set the `WALLET_PASSWORD` env var

```bash
pnpm hardhat task:accountImport --key-file key.json
```

### Request funds and details on the testnet from Optalysys

Get the address from your private key

```bash
pnpm hardhat task:accountPrintAddress --key-file key.json
```

Send this to Optalysys requesting funds on the testnet.

**You will not be able to interact with contracts on the testnet without funds**

> Once you have the above you can start deploying smart contracts to the testnet that use FHE and interacting with them. The rest of this guide walks through deploying a simple test contract and interacting with it.


### Deploy a Simple Contract

The hardhat tasks (prefixed by `task:`) are defined in the folder `tasks/`. The network config file are the config details to connect to the testnet, so there's no need to pass the `--network` param to hardhat (anyway, hardhat doesn't support custom network names).

This deploys a simple contract to the testnet using the account and config you created in the previous steps. The contract is in the file `contracts/Simple.sol`. It demonstrates encrypting a uint8, and two uint8s, and public decryption. The deployed contract address is written to the file `test_contract.address`.

```bash
pnpm hardhat task:deployTest --config-file testnet_config.json --address-file test_contract.address --key-file key.json
```

### Store an Encrypted Value on the Contract then Request Its Decryption

As a first test we will encrypt an unsigned 8-bit integer, store it on the contract, then request its decryption.

#### Encrypt an Unsigned 8-bit Integer 

This will fetch the URLs of the public keys from the relayer, then fetch the public keys from those URLs, use the public key to encrypt the input and then generate a zero-knowledge proof that we know the plaintext value for this ciphertext. The ciphertext and zkproof will be stored in a file `encrypted_input.json` so we can use them in following steps.

```bash
pnpm hardhat task:encryptUint8 --input 7 --input-file encrypted_input.json --config-file testnet_config.json --address-file test_contract.address --key-file key.json
```

#### Store Encrypted Value on Contract

Now that the coprocessors know about the ciphertext (from the previous action) and have returned an attestation of the zkproof, we can store the ciphertext (actually a "handle" that the coprocessors know references that ciphertext) from `encrypted_input.json` on our contract on the blockchain.

```bash
pnpm hardhat task:storeEncryptedUint8 --input-file encrypted_input.json --config-file testnet_config.json --address-file test_contract.address --key-file key.json
```

#### Request Public Decryption

Now that a reference to the ciphertext is stored on the blockchain, ACLs have been created that control who can interact with that ciphertext. If you [look at the contract code](./contracts/Simple.sol) you will see that we allow public decryption of the ciphertext we just stored. In a real scenario this could be used for revealing the winner of a blind auction (for example). See [Zama's docs](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/decryption/public-decryption) for more details about public decryption. Lets use public decryption to get the plaintext of the value stored on the blockchain.

> The output should match the input provided in the earlier step when encrypting.

```bash
pnpm hardhat task:publicDecryptionOfSimpleUint8 --config-file testnet_config.json --address-file test_contract.address
```

### Perform FHE Compute on the Blockchain and Request Result's Decryption

The previous test confirmed that we can fetch the public keys, use them to encrypt a value, generate a zkproof of plaintext knowledge, get an attestation of our zkproof, store a reference to a ciphertext on a contract on the blockchain and then request it to be decrypted later.

Now we will perform FHE compute on the blockchain.

#### Encrypt 2 Unsigned 8-bit Integers 

The first step is the same as before, but since we will be sending 2 encrypted values (inputs to sum under FHE) we need to encrypt them both. Fortunately generating the zkproof and getting the attestation takes a similar time as they can be submitted in a bundle together. The encrypted inputs are written to the file `encrypted_sum_inputs.json`.

```bash
pnpm hardhat task:encryptSumInputs --input1 3 --input2 5 --input-file encrypted_sum_inputs.json --config-file testnet_config.json --address-file test_contract.address --key-file key.json
```

#### Request Encrypted Sum to be Stored on Contract

Now that the coprocessors know about the ciphertexts (from the previous action) and have returned an attestation of the zkproof, we can send the ciphertexts (actually a "handle" that the coprocessors know references that ciphertext) read from `encrypted_sum_inputs.json` to our contract on the blockchain, calling a method that performs FHE compute to sum the 2 ciphertexts and stores the encrypted sum on the contract.

On-chain the compute is done symbolically, and from the input handles and operations a new handle is deterministically calculated. The core FHE contracts that our contract uses then emit an event for each FHE operation which is seen by the coprocessors. The coprocessors then perform the actual FHE compute, making the result ciphertexts available for further calculation/decryption.

```bash
pnpm hardhat task:requestEncryptedSum --input-file encrypted_sum_inputs.json --config-file testnet_config.json --address-file test_contract.address --key-file key.json
```

#### Request Public Decryption

Now that a reference to the resultant (sum) ciphertext is stored on the blockchain, ACLs have been created that control who can interact with that ciphertext. If you [look at the contract code](./contracts/Simple.sol) you will see that we allow public decryption of the resultant ciphertext. In a real scenario this could be used for revealing the winner of a blind auction (for example). See [Zama's docs](https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/decryption/public-decryption) for more details about public decryption. Lets use public decryption to get the plaintext of the value stored on the blockchain.

> Since the actual FHE compute happens asynchronously the ciphertext may not be available yet. If the ciphertext takes too long to be available then this will time out, but it can just be rerun to re-request the decryption.

> The output should match the sum of the inputs provided in the earlier step when encrypting.

```bash
pnpm hardhat task:publicDecryptionOfSum --config-file testnet_config.json --address-file test_contract.address
```


## Unit tests
To make sure the Simple contract works as expected, the unit tests can be run.

### Optalysys testnet
To test on the Optalysys testnet:

```bash
pnpm run test
> NETWORK=optalysys hardhat test

  Simple
2025-10-13T20:36:02.742Z :: Network name: optalysys
2025-10-13T20:36:02.742Z :: Loading wallet
2025-10-13T20:36:16.420Z :: Loading testnet config
2025-10-13T20:36:16.423Z :: Connecting provider
2025-10-13T20:36:16.425Z :: Connecting wallet
2025-10-13T20:36:16.428Z :: Creating fhevm instance
2025-10-13T20:36:17.609Z :: Deploying contract
2025-10-13T20:36:17.819Z :: Waiting for deployment...
2025-10-13T20:36:22.081Z :: Contract deployed at block: 6521
2025-10-13T20:36:22.082Z :: Contract address: 0x7E36e4B752c1CcE4f4ed9a88dD217D1df5Bf274f
    ✔ encrypted simple value should be uninitialized after deployment (52ms)
    ✔ store value 4 (142138ms)
    ✔ encrypted sum should be uninitialized after deployment (89ms)
    ✔ store sum (119936ms)


  4 passing (5m)
```

This will deploy the test on the testnet and run through the contract methods


### Hardhat local test
To test on Hardhat:

Open a terminal in the background to start the local network on Hardhat:

```bash
pnpm run start-localhost
> hardhat node

Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========

WARNING: These accounts, and their private keys, are publicly known.
Any funds sent to them on Mainnet or any other live network WILL BE LOST.

Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Run the tests on hardhat in another terminal

```bash
pnpm run test-localhost
> hardhat test

  Simple
2025-10-13T20:43:53.853Z :: Network name: hardhat
2025-10-13T20:43:53.853Z :: Running on hardhat, using mocked config
2025-10-13T20:43:53.860Z :: Loading testnet config
2025-10-13T20:43:53.862Z :: Connecting provider
2025-10-13T20:43:53.875Z :: Using mock fhevm
2025-10-13T20:43:53.875Z :: Deploying contract
2025-10-13T20:43:53.896Z :: Waiting for deployment...
2025-10-13T20:43:53.899Z :: Contract deployed at block: 3
2025-10-13T20:43:53.900Z :: Contract address: 0x5FbDB2315678afecb367f032d93F642f64180aa3
    ✔ encrypted simple value should be uninitialized after deployment
    ✔ store value 4 (114ms)
    ✔ encrypted sum should be uninitialized after deployment
    ✔ store sum (81ms)


  4 passing (273ms)
```

This will deploy the test on the hardhat localhost and run through the contract methods


## Using Optalysys testnet config instead of Zama's config

This is where the instructions diverge from [Zama's instructions](https://docs.zama.ai/protocol/solidity-guides/smart-contract/configure).

Instead of inheriting from ZamaConfig, pass Optalysys's config values in the constructor.

Zama instructions:

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MyERC20 is SepoliaConfig {
  constructor() {
    // Additional initialization logic if needed
  }
}
```

Change:

```solidity
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

// REMOVE ZamaConfig
//import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

// REMOVE ZamaConfig
contract MyERC20 { // is SepoliaConfig {
    constructor(
        address aclAdd,
        address fhevmExecutorAdd,
        address kmsVerifierAdd,
        address decryptionOracleAdd
    ) {
        FHE.setCoprocessor(CoprocessorConfig({
            ACLAddress: aclAdd,
            CoprocessorAddress: fhevmExecutorAdd,
            DecryptionOracleAddress: decryptionOracleAdd,
            KMSVerifierAddress: kmsVerifierAdd
        }));

    }
}
```

The Coprocessor config values will need to be set in the deploy constructor e.g.:

```javascript
await contractFactory.deploy(
  ethers.getAddress(testnetConfig.aclContractAddress),
  ethers.getAddress(testnetConfig.fhevmExecutorContractAddress),
  ethers.getAddress(testnetConfig.kmsVerifierContractAddress),
  ethers.getAddress(testnetConfig.decryptionOracleContractAddress),
);
```
