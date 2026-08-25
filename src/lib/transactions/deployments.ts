import type { TransactionNetwork } from "@/lib/transactions/networks";

export interface ContractDeployment {
  network: TransactionNetwork;
  componentSlug: string;
  address: string;
}

// Registered Testnet contract deployments, keyed by network + componentSlug.
//
// To make a new component Testnet-usable, deploy its wasm via the contract
// workspace (e.g. `make -C contracts/contracts/<pkg> deploy-testnet`) and add
// an entry here with the printed `C...` address. The registry validates the
// address before it is used, and the generic transaction flow discovers the
// component automatically once its catalog `capabilities.testnet` is true.
//
// Example (once Payment is deployed):
//   { network: "testnet", componentSlug: "payment", address: "C..." }
const DEPLOYMENTS: ContractDeployment[] = [
  {
    network: "testnet",
    componentSlug: "token",
    address: "CA4F2JDF3DFAFLIZP2BKSHAPWS6ZRTZE7NISHCYU62KOOQFQCOOBGECS",
  },
];

export function getDeployment(
  network: TransactionNetwork,
  componentSlug: string,
): string | null {
  const deployment = DEPLOYMENTS.find(
    (candidate) =>
      candidate.network === network && candidate.componentSlug === componentSlug,
  );

  if (!deployment) return null;
  if (!isValidContractAddress(deployment.address)) return null;

  return deployment.address;
}

// StrKey validation without pulling @stellar/stellar-sdk into the client
// bundle. Mirrors StrKey.isValidContract: base32 (RFC 4648 without padding,
// "2-7" and "A-Z"), version byte 0x10 for contract addresses, and a
// CRC-16/XMODEM checksum (little-endian) over the version byte + 32-byte
// contract id.

const CONTRACT_ADDRESS_REGEX = /^C[2-7A-Z]{55}$/;

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function isValidContractAddress(address: string): boolean {
  if (!CONTRACT_ADDRESS_REGEX.test(address)) return false;

  const decoded = base32Decode(address);
  if (decoded.length !== 35) return false;
  if (decoded[0] !== 0x10) return false;

  const computed = crc16XModem(decoded.subarray(0, 33));
  return computed === (decoded[33] | (decoded[34] << 8));
}

function base32Decode(value: string): Uint8Array {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];

  for (const char of value) {
    const digit = BASE32_ALPHABET.indexOf(char);
    if (digit === -1) return new Uint8Array(0);

    accumulator = (accumulator << 5) | digit;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

function crc16XModem(bytes: Uint8Array): number {
  let crc = 0x0000;

  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc;
}