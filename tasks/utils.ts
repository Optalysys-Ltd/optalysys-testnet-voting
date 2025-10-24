import * as fs from "fs"
import { ethers } from 'ethers'
import createPrompt from 'prompt-sync'
import { FhevmInstance, FhevmInstanceConfig, createInstance as createFhevmInstance } from "@zama-fhe/relayer-sdk/node"

type TestnetConfig = {
  jsonRpcUrl: string
  relayerUrl: string
  gatewayChainId: number
  aclContractAddress: string
  fhevmExecutorContractAddress: string
  kmsVerifierContractAddress: string
  decryptionOracleContractAddress: string
  inputVerifierContractAddress: string
  inputVerificationContractAddress: string
  decryptionContractAddress: string
}

export async function loadWallet(keyFile: string): Promise<ethers.Wallet | ethers.HDNodeWallet> {
  let password = process.env.WALLET_PASSWORD
  if (!password) {
    console.log("Set WALLET_PASSWORD env var to skip this prompt")
    password = createPrompt({sigint: true}).hide('Enter password for wallet: ');
  }
  return await ethers.Wallet.fromEncryptedJson(await fs.promises.readFile(keyFile, 'utf8'), password as string)
}

export async function createInstance(
  verifyingContractAddressDecryption: string,
  verifyingContractAddressInputVerification: string,
  inputVerifierContractAddress: string,
  kmsContractAddress: string,
  aclContractAddress: string,
  gatewayChainId: number,
  relayerUrl: string,
  network: string
): Promise<FhevmInstance> {
    const config = {
      verifyingContractAddressDecryption: verifyingContractAddressDecryption,
      verifyingContractAddressInputVerification: verifyingContractAddressInputVerification,
      inputVerifierContractAddress: inputVerifierContractAddress,
      kmsContractAddress: kmsContractAddress,
      aclContractAddress: aclContractAddress,
      gatewayChainId: gatewayChainId,
      relayerUrl: relayerUrl,
      network: network
    }
    timestampLog(config)
    return await createFhevmInstance(config)
  }

export function timestampLog(...args: any[]) {
  console.log.apply(console.log,[(new Date()).toISOString() + ' ::'].concat(args));
}

export async function loadTestnetConfig(configFile: string): Promise<TestnetConfig> {
  const testnetConfigRaw = JSON.parse(await fs.promises.readFile(configFile, 'utf8'))
  return {
    jsonRpcUrl: testnetConfigRaw.json_rpc_url,
    relayerUrl: testnetConfigRaw.relayer_url,
    gatewayChainId: testnetConfigRaw.gateway_chain_id,
    aclContractAddress: testnetConfigRaw.acl_contract_address,
    fhevmExecutorContractAddress: testnetConfigRaw.fhevm_executor_contract_address,
    kmsVerifierContractAddress: testnetConfigRaw.kms_verifier_contract_address,
    decryptionOracleContractAddress: testnetConfigRaw.decryption_oracle_contract_address,
    inputVerifierContractAddress: testnetConfigRaw.input_verifier_contract_address,
    inputVerificationContractAddress: testnetConfigRaw.input_verification_contract_address,
    decryptionContractAddress: testnetConfigRaw.decryption_contract_address
  }
}
