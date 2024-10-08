import { PasskeyArgType } from '../../types/passkeys'
import { getDefaultFCLP256VerifierAddress } from './extractPasskeyData'
import { SafeWebAuthnSharedSignerContractImplementationType } from '../../types/contracts'

/**
 * Returns true if the passkey signer is a shared signer
 * @returns {Promise<string>} A promise that resolves to the signer's address.
 */
async function isSharedSigner(
  passkey: PasskeyArgType,
  safeWebAuthnSharedSignerContract: SafeWebAuthnSharedSignerContractImplementationType,
  safeAddress: string,
  owners: string[],
  chainId: string
): Promise<boolean> {
  const sharedSignerContractAddress = await safeWebAuthnSharedSignerContract.getAddress()

  // is a shared signer if the shared signer contract address is present in the owners and its configured in the Safe slot
  if (safeAddress && owners.includes(sharedSignerContractAddress)) {
    const [sharedSignerSlot] = await safeWebAuthnSharedSignerContract.getConfiguration([
      safeAddress
    ])

    const { x, y, verifiers } = sharedSignerSlot

    const passkeyVerifierAddress =
      passkey.customVerifierAddress || getDefaultFCLP256VerifierAddress(chainId.toString())

    const isSharedSigner =
      BigInt(passkey.coordinates.x) === x &&
      BigInt(passkey.coordinates.y) === y &&
      BigInt(passkeyVerifierAddress) === verifiers

    return isSharedSigner
  }

  return false
}

export default isSharedSigner
