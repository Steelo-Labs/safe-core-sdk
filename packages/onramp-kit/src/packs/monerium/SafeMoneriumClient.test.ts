import { Contract, hashMessage } from 'ethers'
import { PaymentStandard } from '@monerium/sdk'
import Safe, * as protocolKitPackage from '@safe-global/protocol-kit'
import {
  OperationType,
  signMessageLib_1_4_1_ContractArtifacts
} from '@safe-global/safe-core-sdk-types'
import SafeApiKit from '@safe-global/api-kit'

import { SafeMoneriumClient } from './SafeMoneriumClient'
import { MAGIC_VALUE } from './signatures'

const newOrder = {
  amount: '100',
  counterpart: {
    identifier: {
      standard: 'iban' as PaymentStandard.iban,
      iban: 'iban'
    },
    details: {
      firstName: 'firstName',
      lastName: 'lastName'
    }
  },
  memo: 'memo'
}

jest.mock('@monerium/sdk', () => {
  const actualSdk = jest.requireActual('@monerium/sdk')
  return {
    ...(jest.genMockFromModule('@monerium/sdk') as any),
    getChain: actualSdk.getChain,
    getNetwork: actualSdk.getNetwork,
    placeOrderMessage: actualSdk.placeOrderMessage
  }
})
jest.mock('@safe-global/protocol-kit')
jest.mock('@safe-global/api-kit')

describe('SafeMoneriumClient', () => {
  const protocolKit = new Safe()
  let safeMoneriumClient: SafeMoneriumClient

  beforeEach(() => {
    jest.clearAllMocks()
    protocolKit.getChainId = jest.fn().mockResolvedValue(5)
    protocolKit.getSafeProvider = jest.fn().mockReturnValue({
      call: jest.fn().mockImplementation(async () => MAGIC_VALUE),
      getSignerAddress: jest.fn().mockResolvedValue('0xSignerAddress')
    })

    protocolKit.getSafeProvider.call = jest.fn().mockImplementation(async () => MAGIC_VALUE)
    safeMoneriumClient = new SafeMoneriumClient(
      { environment: 'sandbox', clientId: 'mockClientId', redirectUrl: 'http://mockUrl' },
      protocolKit
    )
  })

  it('should create a SafeMoneriumClient instance', () => {
    expect(safeMoneriumClient).toBeInstanceOf(SafeMoneriumClient)
  })

  it('should allow to get the Safe address', async () => {
    protocolKit.getAddress = jest.fn(() => Promise.resolve('0xSafeAddress'))
    expect(await safeMoneriumClient.getSafeAddress()).toBe('0xSafeAddress')
  })

  it('should allow to send tokens from then Safe to any IBAN', async () => {
    protocolKit.getAddress = jest.fn(() => Promise.resolve('0xSafeAddress'))
    const placeOrderSpy = jest.spyOn(safeMoneriumClient, 'placeOrder')
    //@ts-expect-error - Not all values are mocked
    const signMessageSpy = jest.spyOn(safeMoneriumClient, 'signMessage').mockResolvedValueOnce({
      safe: '0xSafeAddress',
      to: '0xAddress',
      value: '0',
      operation: 1
    })

    await safeMoneriumClient.send({ ...newOrder })

    expect(placeOrderSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ...newOrder,
        address: '0xSafeAddress',
        message: expect.stringContaining('Send EUR 100 to iban at'),
        chainId: 5,
        signature: '0x',
        supportingDocumentId: ''
      })
    )

    expect(signMessageSpy).toHaveBeenCalledWith(
      '0xSafeAddress',
      expect.stringContaining('Send EUR 100 to iban at')
    )
  })

  it('should throw if signing message fails', async () => {
    protocolKit.getAddress = jest.fn(() => Promise.resolve('0xSafeAddress'))
    const placeOrderSpy = jest.spyOn(safeMoneriumClient, 'placeOrder')
    const signMessageSpy = jest
      .spyOn(safeMoneriumClient, 'signMessage')
      .mockRejectedValueOnce(new Error('Failed to sign message'))

    await expect(safeMoneriumClient.send({ ...newOrder })).rejects.toThrow('Failed to sign message')

    expect(placeOrderSpy).toHaveBeenCalledTimes(1)
    expect(signMessageSpy).toHaveBeenCalledTimes(1)
  })

  it('should allow to check if a message is signed in the smart contract if the promise is fulfilled', async () => {
    const isMessageSigned = await safeMoneriumClient.isMessageSigned(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isMessageSigned).toBe(true)
  })

  it('should allow to check if a message is NOT signed in the smart contract if the promise is fulfilled', async () => {
    // Promise fulfilled without signature
    protocolKit.getSafeProvider().call = jest.fn().mockImplementation(async () => '0x')

    const isMessageSigned = await safeMoneriumClient.isMessageSigned(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isMessageSigned).toBe(false)
  })

  it('should allow to check if a message is signed in the smart contract and the promise is rejected', async () => {
    class EthersError extends Error {
      data: string
      constructor(message: string, data: string) {
        super(message)
        this.data = data
      }
    }

    // promise is rejected with the signature
    protocolKit.getSafeProvider().call = jest
      .fn()
      .mockImplementation(() =>
        Promise.reject(new EthersError('execution reverted: "Hash not approved"', MAGIC_VALUE))
      )

    const isMessageSigned = await safeMoneriumClient.isMessageSigned(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isMessageSigned).toBe(true)
  })

  it('should allow to check if a message is NOT signed in the smart contract and the promise is rejected', async () => {
    class EthersError extends Error {
      data: string
      constructor(message: string, data: string) {
        super(message)
        this.data = data
      }
    }

    // promise is rejected without a signature
    protocolKit.getSafeProvider().call = jest
      .fn()
      .mockImplementation(() =>
        Promise.reject(new EthersError('execution reverted: "Hash not approved"', '0x'))
      )

    const isMessageSigned = await safeMoneriumClient.isMessageSigned(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isMessageSigned).toBe(false)
  })

  it('should allow to check if a message is pending in the safe transaction queue', async () => {
    jest.spyOn(SafeApiKit.prototype, 'getPendingTransactions').mockResolvedValueOnce({
      count: 0,
      results: []
    })

    const isSignMessagePending = await safeMoneriumClient.isSignMessagePending(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isSignMessagePending).toBe(false)

    jest.spyOn(SafeApiKit.prototype, 'getPendingTransactions').mockResolvedValueOnce({
      count: 0,
      results: [
        {
          // @ts-expect-error - dataDecoded should have the method property
          dataDecoded: {
            method: 'signMessage',
            parameters: [{ value: hashMessage('message to sign') }]
          }
        }
      ]
    })

    const isSignMessagePending2 = await safeMoneriumClient.isSignMessagePending(
      '0xSafeAddress',
      'message to sign'
    )

    expect(isSignMessagePending2).toBe(true)
  })

  it('should allow to sign a message', async () => {
    const txData = {
      operation: OperationType.DelegateCall,
      baseGas: 0,
      safeTxGas: 1000000,
      gasPrice: 0,
      gasToken: '0x000',
      refundReceiver: '0x00000000',
      nonce: 0
    }

    jest.spyOn(protocolKitPackage, 'getSignMessageLibContract').mockResolvedValueOnce({
      safeVersion: '1.3.0',
      contractName: 'signMessageLibVersion',
      contract: new Contract('0x0000000000000000000000000000000000000001', []),
      safeProvider: protocolKit.getSafeProvider() as protocolKitPackage.SafeProvider,
      encode: jest.fn(),
      contractAbi: signMessageLib_1_4_1_ContractArtifacts.abi,
      contractAddress: '',
      getAddress: jest.fn(),
      getMessageHash: jest.fn(),
      signMessage: jest.fn(),
      estimateGas: jest.fn(),
      init: jest.fn()
    })

    protocolKit.createTransaction = jest.fn().mockResolvedValueOnce({
      data: txData
    })

    protocolKit.getTransactionHash = jest.fn().mockResolvedValueOnce('0xTransactionHash')
    protocolKit.signHash = jest.fn().mockResolvedValueOnce('0xTransactionSignature')

    jest.spyOn(SafeApiKit.prototype, 'getTransaction').mockResolvedValueOnce({
      confirmationsRequired: 1,
      //@ts-expect-error - Only required properties are mocked
      confirmations: [{ to: '0xSignerAddress' }]
    })

    const proposeTransactionSpy = jest.spyOn(SafeApiKit.prototype, 'proposeTransaction')
    protocolKit.executeTransaction = jest.fn()
    await safeMoneriumClient.signMessage('0xSafeAddress', 'message to sign')

    expect(proposeTransactionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        safeAddress: '0xSafeAddress',
        safeTransactionData: txData,
        safeTxHash: '0xTransactionHash',
        senderAddress: '0xSignerAddress',
        senderSignature: undefined
      })
    )
  })

  it('should map the protocol kit chainId to the Monerium Chain types', async () => {
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(1n)
    expect(await safeMoneriumClient.getChain()).toBe('ethereum')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(11155111n)
    expect(await safeMoneriumClient.getChain()).toBe('ethereum')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(100n)
    expect(await safeMoneriumClient.getChain()).toBe('gnosis')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(10200n)
    expect(await safeMoneriumClient.getChain()).toBe('gnosis')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(137n)
    expect(await safeMoneriumClient.getChain()).toBe('polygon')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(80001n)
    expect(await safeMoneriumClient.getChain()).toBe('polygon')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(300n)
    expect(await safeMoneriumClient.getChain()).toBe('polygon')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(2442n)
    expect(safeMoneriumClient.getChain()).rejects.toThrow('Chain not supported: 300')
  })

  it('should map the protocol kit chainId to the Monerium Network types', async () => {
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(1n)
    expect(await safeMoneriumClient.getNetwork()).toBe('mainnet')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(11155111n)
    expect(await safeMoneriumClient.getNetwork()).toBe('sepolia')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(100n)
    expect(await safeMoneriumClient.getNetwork()).toBe('mainnet')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(2442n)
    expect(await safeMoneriumClient.getNetwork()).toBe('cardona')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(10200n)
    expect(await safeMoneriumClient.getNetwork()).toBe('chiado')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(137n)
    expect(await safeMoneriumClient.getNetwork()).toBe('mainnet')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(80001n)
    expect(await safeMoneriumClient.getNetwork()).toBe('mumbai')
    protocolKit.getChainId = jest.fn().mockResolvedValueOnce(300n)
    expect(safeMoneriumClient.getNetwork()).rejects.toThrow('Network not supported: 300')
  })
})
