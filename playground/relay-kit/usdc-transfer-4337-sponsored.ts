import { Safe4337Pack } from '@safe-global/relay-kit'
import { waitForOperationToFinish, generateTransferCallData } from '../utils'

// Safe owner PK
const PRIVATE_KEY = ''

const PIMLICO_API_KEY = ''

// Safe 4337 compatible
const SAFE_ADDRESS = ''

//  PolicyId is an optional parameter, you can create one here: https://dashboard.pimlico.io/sponsorship-policies
const POLICY_ID = ''

// CHAIN
const CHAIN_NAME = 'cardona'
// const CHAIN_NAME = 'gnosis'

// RPC URL
const RPC_URL = 'https://polygonzkevm-cardona.g.alchemy.com' // POLYGON CARDONA
// const RPC_URL = 'https://rpc.gnosischain.com/' // GNOSIS

// Bundler URL
const BUNDLER_URL = `https://api.pimlico.io/v2/${CHAIN_NAME}/rpc?apikey=${PIMLICO_API_KEY}` // PIMLICO

// Paymaster URL
const PAYMASTER_URL = `https://api.pimlico.io/v2/${CHAIN_NAME}/rpc?apikey=${PIMLICO_API_KEY}` // PIMLICO

// PAYMASTER ADDRESS
const paymasterAddress = '0x0000000000325602a77416A16136FDafd04b299f' // POLYGON CARDONA
// const paymasterAddress = '0x000000000034B78bfe02Be30AE4D324c8702803d' // GNOSIS

// USDC CONTRACT ADDRESS IN POLYGON CARDONA
// faucet: https://faucet.circle.com/
const usdcTokenAddress = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' // POLYGON CARDONA
// const usdcTokenAddress = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83' // GNOSIS

async function main() {
  // 1) Initialize pack with the paymaster data
  const safe4337Pack = await Safe4337Pack.init({
    provider: RPC_URL,
    signer: PRIVATE_KEY,
    bundlerUrl: BUNDLER_URL,
    paymasterOptions: {
      isSponsored: true,
      paymasterUrl: PAYMASTER_URL,
      paymasterAddress,
      sponsorshipPolicyId: POLICY_ID
    },
    options: {
      safeAddress: SAFE_ADDRESS
    }
  })

  // Log supported entry points and chain id
  console.log('Supported Entry Points', await safe4337Pack.getSupportedEntryPoints())
  console.log('Chain Id', await safe4337Pack.getChainId())

  // Create transaction batch with two 0.1 USDC transfers
  const senderAddress = (await safe4337Pack.protocolKit.getAddress()) as `0x${string}`

  const usdcAmount = 100_000n // 0.1 USDC

  const transferUSDC = {
    to: usdcTokenAddress,
    data: generateTransferCallData(senderAddress, usdcAmount),
    value: '0'
  }
  const transactions = [transferUSDC, transferUSDC]
  const ethersProvider = safe4337Pack.protocolKit.getSafeProvider().getExternalProvider()
  const timestamp = (await ethersProvider.getBlock('latest'))?.timestamp || 0

  // 2) Create transaction batch
  const safeOperation = await safe4337Pack.createTransaction({
    transactions,
    options: {
      validAfter: timestamp - 60_000,
      validUntil: timestamp + 60_000
    }
  })

  // 3) Sign SafeOperation
  const signedSafeOperation = await safe4337Pack.signSafeOperation(safeOperation)

  console.log('SafeOperation', signedSafeOperation)

  // 4) Execute SafeOperation
  const userOperationHash = await safe4337Pack.executeTransaction({
    executable: signedSafeOperation
  })

  await waitForOperationToFinish(userOperationHash, CHAIN_NAME, safe4337Pack)
}

main()
