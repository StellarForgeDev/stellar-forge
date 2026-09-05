import type { TransactionNetwork } from "./networks.ts";

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
export const DEPLOYMENTS: ContractDeployment[] = [
  {
    network: "testnet",
    componentSlug: "token",
    address: "CA4F2JDF3DFAFLIZP2BKSHAPWS6ZRTZE7NISHCYU62KOOQFQCOOBGECS",
  },
  {
    network: "testnet",
    componentSlug: "payment",
    address: "CDHHS2W3TYYHQ3RJSZKB4HLUGMQ4TX6KPBBUUH7B57CVYSNXO646DABR",
  },
  {
    network: "testnet",
    componentSlug: "access-control",
    address: "CB5LA255QBGZH4UURMOGL6SJIVQE5PFQXZZ5JSF7UD5SIYQSGVAM3HQY",
  },
  {
    network: "testnet",
    componentSlug: "multi-signature",
    address: "CDDEDAVZZGKCWAJAGW5O4HPMMZB567MEBWXQZL7WOCPCBAPZ6IIIV5Q6",
  },
  {
    network: "testnet",
    componentSlug: "escrow",
    address: "CAIQCE5T6E75W4Y73ZETK4VP4GACIXZ2EU7HRQSKLNPVK6WBAMYFUYHH",
  },
  {
    network: "testnet",
    componentSlug: "oracle",
    address: "CAFLTWXJL667NIEORFFOYGWKE27UZVPS3QSTY5P2GXEB7J2V4DI64PSR",
  },
  {
    network: "testnet",
    componentSlug: "subscription",
    address: "CDNIQAKTBIGDXKEO7D473GDKBKHCKF2WKORPTB7GO53MBPLJRCIHFVAY",
  },
  {
    network: "testnet",
    componentSlug: "vesting",
    address: "CCKMY7NC4PZJ4772HFGFSQOM5OVLFVVFXBVAE2VLBP74EMLO6QRJWTPY",
  },
  {
    network: "testnet",
    componentSlug: "staking",
    address: "CCBNO5JQWKTIYU3EVCZOJXKBAJ5LBYXQCPXIYAV4SHQ43AL22JZOUHHG",
  },
  {
    network: "testnet",
    componentSlug: "atomic-swap",
    address: "CATGWSXC7LJ4QONVEFQIZD6IHA4XHLK3HLR4LERSDLJ2DVVC4TWQDE4K",
  },
  {
    network: "testnet",
    componentSlug: "timelock",
    address: "CA7PII42RSAZVYAG6NXQFT5ZY7ME3NMNK2PKQU2CG2GJ5M4XYSCCMA4C",
  },
  {
    network: "testnet",
    componentSlug: "merkle-airdrop",
    address: "CDJ7QXPQNI6VVZQ24G3T3D4B7MTV45COGERRZBN2XHB7QHRAUCSGUKO7",
  },
  {
    network: "testnet",
    componentSlug: "crowdfund",
    address: "CAHZASCRPTE3GNKC26I3UALHEUBZDSNOIAQOPVWSTT3EBIFS7SQR6YJC",
  },
  {
    network: "testnet",
    componentSlug: "allowance",
    address: "CBLYFW2TV6MPGPBKBU6P6HUMANYEQLR4XXBXVQBG5M5BX75WSKQMWOKN",
  },
  {
    network: "testnet",
    componentSlug: "claimable-balance",
    address: "CCNGYMU2DLXIL4TJGS4KUXNQTWY7XZMEQ5JLNIAIL4BSTZB3KODKK5LP",
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
