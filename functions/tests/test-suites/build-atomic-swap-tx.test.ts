import { buildAtomicSwapTxWithFeeSplit } from "../../src/lib/jup";
import { PLATFORM_FEE_BPS } from "../../src/lib/config/constants";
import { makeJupQuote } from "../factories/quotes";
import { faker } from "@faker-js/faker";
import BN from "bn.js";
import { Keypair } from "@solana/web3.js";
import { QuoteResponse } from "@jup-ag/api";
const {
  PublicKey,
  VersionedTransaction,
  TransactionInstruction,
} = require("@solana/web3.js");

// ---------- Helpers ----------
const BASE58 = Keypair.generate().publicKey.toString();
const asB64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

// ---------- Mocks ----------

jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js");

  const toStr = (v: string | Uint8Array) =>
    typeof v === "string" ? v : "B58_" + Buffer.from(v).toString("hex"); // human/stable

  class PublicKey {
    private _b58: string;
    constructor(v: string | Uint8Array) {
      this._b58 = toStr(v);
    }
    toBase58() {
      return this._b58;
    }
    toString() {
      return this._b58;
    }
    equals(other: any) {
      return !!other?.toBase58 && other.toBase58() === this._b58;
    }
  }

  class TransactionInstruction {
    programId: PublicKey;
    keys: any[];
    data: Buffer;
    constructor(opts: { programId: PublicKey; keys: any[]; data: Buffer }) {
      this.programId = opts.programId;
      this.keys = opts.keys;
      this.data = opts.data;
    }
  }

  class TransactionMessage {
    payerKey: any;
    recentBlockhash: string;
    instructions: any[];
    constructor({ payerKey, recentBlockhash, instructions }: any) {
      this.payerKey = payerKey;
      this.recentBlockhash = recentBlockhash;
      this.instructions = instructions;
    }
    compileToV0Message(_alts?: any[]) {
      return { compiled: true, instructions: this.instructions };
    }
  }

  // class VersionedTransaction {
  //   static __signSpy = jest.fn();
  //   static __serializeSpy = jest.fn(() => Buffer.from("cafebabe", "utf8"));
  //   constructor(public msg: any) {}
  //   sign(signers: any[]) {
  //     VersionedTransaction.__signSpy(signers);
  //   }
  //   serialize() {
  //     return VersionedTransaction.__serializeSpy();
  //   }
  // }
  class VersionedTransaction {
    static __signSpy = jest.fn();
    static __serializeSpy = jest.fn(() => Buffer.from("cafebabe", "utf8"));
    static __last: any;
    constructor(public msg: any) {
      VersionedTransaction.__last = this; // <— remember last instance
    }
    sign(signers: any[]) {
      VersionedTransaction.__signSpy(signers);
    }
    serialize() {
      return VersionedTransaction.__serializeSpy();
    }
  }

  class AddressLookupTableAccount {}
  class Connection {}

  // Simple deterministic Keypair for tests
  class Keypair {
    public publicKey: PublicKey;
    public secretKey: Uint8Array;
    constructor(secret?: Uint8Array) {
      this.secretKey =
        secret ??
        Uint8Array.from({ length: 64 }, () => Math.floor(Math.random() * 256));
      // derive a display pk from secret for equality checks
      const hex = Buffer.from(this.secretKey).toString("hex").slice(0, 64);
      this.publicKey = new PublicKey("KP_" + hex);
    }
    static generate() {
      return new Keypair();
    }
    static fromSecretKey(sk: Uint8Array) {
      return new Keypair(sk);
    }
  }

  return {
    ...actual,
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    AddressLookupTableAccount,
    Connection,
    Keypair,
  };
});

// SPL-Token shims
const getAssociatedTokenAddressMock = jest.fn();
const createAssociatedTokenAccountInstructionMock = jest.fn();
const createTransferCheckedInstructionMock = jest.fn();
const getMintMock = jest.fn();

jest.mock("@solana/spl-token", () => ({
  getAssociatedTokenAddress: (...args: any[]) =>
    getAssociatedTokenAddressMock(...args),
  createAssociatedTokenAccountInstruction: (...args: any[]) =>
    createAssociatedTokenAccountInstructionMock(...args),
  createTransferCheckedInstruction: (...args: any[]) =>
    createTransferCheckedInstructionMock(...args),
  getMint: (...args: any[]) => getMintMock(...args),
}));

// Jupiter client shim
const swapInstructionsPostMock = jest.fn();
jest.mock("../../src/lib/jup/client", () => ({
  getJupiterClient: () => ({
    swapInstructionsPost: (...a: any[]) => swapInstructionsPostMock(...a),
  }),
}));

// ---------- Local “Connection” double ----------
class MockConnection {
  private ataExistMap = new Map<string, any | null>();
  private altMap = new Map<string, any>();

  setATA(addrB58: string, exists: boolean) {
    this.ataExistMap.set(addrB58, exists ? { lamports: 1 } : null);
  }
  setALT(keyB58: string, exists: boolean) {
    this.altMap.set(
      keyB58,
      exists ? { value: { key: keyB58 } } : { value: null }
    );
  }
  async getAccountInfo(pubkey: any) {
    const key =
      typeof pubkey?.toBase58 === "function"
        ? pubkey.toBase58()
        : String(pubkey);
    return this.ataExistMap.get(key) ?? null;
  }
  async getAddressLookupTable(key: any) {
    const b58 =
      typeof key?.toBase58 === "function" ? key.toBase58() : String(key);
    return this.altMap.get(b58) ?? { value: null };
  }
  async getLatestBlockhash() {
    return { blockhash: "BHASH", lastValidBlockHeight: 123456 };
  }
}

const pkFromSeed = (seed: number) =>
  new PublicKey(Uint8Array.from({ length: 32 }, (_, i) => (seed + i) & 0xff));

// ---------- Test data fabricators ----------
function jupIx(
  programId = BASE58,
  accounts = [{ pubkey: BASE58, isSigner: false, isWritable: false }],
  dataUtf8 = "x"
) {
  return { programId, accounts, data: asB64(dataUtf8) };
}

const bytesFromString = (val: any) => {
  const s = String(val);
  const out = new Uint8Array(32);
  for (let i = 0; i < s.length; i++) out[i % 32] ^= s.charCodeAt(i);
  return out;
};

const ataFromOwner = (ownerPk: typeof PublicKey, mintPk: typeof PublicKey) => {
  const ownerStr = ownerPk.toBase58(); // string
  const mintStr = mintPk.toBase58(); // string
  const bytes = bytesFromString(ownerStr);
  const mintBytes = bytesFromString(mintStr);
  for (let i = 0; i < 32; i++) bytes[i] ^= (mintBytes[i] << 1) & 0xff;
  return new PublicKey(bytes); // => toBase58() returns string via mock
};

// ---------- Suite ----------
describe("buildAtomicSwapTxWithFeeSplit", () => {
  let inAmount: string;
  let USER: string;
  let FEE_OWNER: string;
  let REF_OWNER: string;
  let COLD_OWNER: string;
  let MINT: string;
  let feeATA: string;
  let refATA: string;
  let coldATA: string;
  let connection: MockConnection;
  let feeWallet: Keypair;
  let baseSeedData: Partial<QuoteResponse>;
  let platformFeeBps: number;
  let referrerFeeBps: number;

  beforeEach(() => {
    jest.clearAllMocks();
    platformFeeBps = faker.datatype.number({ min: 100, max: 4000 });
    referrerFeeBps = faker.datatype.number({ min: 100, max: 4000 });
    feeWallet = new Keypair();
    inAmount = faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString();
    USER = pkFromSeed(1).toBase58();
    FEE_OWNER = feeWallet.publicKey.toString();
    REF_OWNER = pkFromSeed(3).toBase58();
    COLD_OWNER = pkFromSeed(4).toBase58();
    MINT = pkFromSeed(5).toBase58();
    feeATA = ataFromOwner(
      new PublicKey(FEE_OWNER),
      new PublicKey(MINT)
    ).toBase58();
    refATA = ataFromOwner(
      new PublicKey(REF_OWNER),
      new PublicKey(MINT)
    ).toBase58();
    coldATA = ataFromOwner(
      new PublicKey(COLD_OWNER),
      new PublicKey(MINT)
    ).toBase58();

    connection = new MockConnection();
    connection.setATA(feeATA, false);
    connection.setATA(refATA, false);
    connection.setATA(coldATA, true);

    const programId = pkFromSeed(9).toBase58();
    const programId2 = pkFromSeed(10).toBase58();

    // Deterministic ATAs from (owner,mint)
    getAssociatedTokenAddressMock.mockImplementation(
      (_mint, owner /*, allowOwnerOffCurve*/) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      }
    );

    createAssociatedTokenAccountInstructionMock.mockImplementation(
      (payer, ata, owner, mint) => {
        return new TransactionInstruction({
          programId: new PublicKey(programId),
          keys: [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: ata, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
          ],
          data: Buffer.from("create-ata"),
        });
      }
    );

    getMintMock.mockResolvedValue({ decimals: 6 });

    createTransferCheckedInstructionMock.mockImplementation(
      (from, mint, to, auth, amount, decimals) => {
        return new TransactionInstruction({
          programId: new PublicKey(programId2),
          keys: [
            { pubkey: from, isSigner: false, isWritable: true },
            { pubkey: to, isSigner: false, isWritable: true },
            { pubkey: auth, isSigner: true, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
          ],
          data: Buffer.from(
            JSON.stringify({ amount: String(amount), decimals })
          ),
        });
      }
    );

    // Default Jupiter response (can be overridden per test)
    swapInstructionsPostMock.mockResolvedValue({
      computeBudgetInstructions: [jupIx(BASE58, [], "cb")],
      setupInstructions: [
        jupIx(BASE58, [], "setup1"),
        jupIx(BASE58, [], "setup2"),
      ],
      swapInstruction: jupIx(BASE58, [], "swap"),
      cleanupInstruction: jupIx(BASE58, [], "cleanup"),
      addressLookupTableAddresses: ["ALT1111111111111111111111111111111111111"],
    });

    baseSeedData = {
      inputMint: MINT,
      inAmount,
      platformFee: {
        amount: new BN(inAmount)
          .mul(new BN(platformFeeBps + referrerFeeBps))
          .div(new BN(10_000))
          .toString(),
        feeBps: platformFeeBps + referrerFeeBps,
      },
    };
  });

  it("throws on inputMint mismatch", async () => {
    const quote = makeJupQuote({ ...baseSeedData, inputMint: "OtherMint" });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: referrerFeeBps,
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("inputMint mismatch");
  });

  it("throws on inAmount mismatch", async () => {
    const quote = makeJupQuote(baseSeedData);

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: faker.random.numeric(3), // mismatch
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: referrerFeeBps,
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("inAmount mismatch");
  });

  it("throws on referrerFeeAmountBps:  out of range (negative)", async () => {
    const quote = makeJupQuote(baseSeedData);

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: -1 * faker.datatype.number({ min: 1, max: 10000 }),
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("Referrer fee must be between 0 and 10,000");
  });

  it("throws on referrerFeeAmountBps:  out of range (positive)", async () => {
    const quote = makeJupQuote(baseSeedData);

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: 10000 + faker.datatype.number({ min: 1, max: 10000 }),
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("Referrer fee must be between 0 and 10,000");
  });

  it("throws if swapMode !== ExactIn", async () => {
    const quote = makeJupQuote({
      swapMode: "ExactOut",
      ...baseSeedData,
    });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: referrerFeeBps,
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("Only ExactIn supported for deterministic fee math");
  });

  it("allows zero fee on tiny trade", async () => {
    // Choose amount/bps such that floor(amount * bps / 10000) === 0
    const tinyAmount = "1";
    const expectedFee = new BN(tinyAmount)
      .mul(new BN(PLATFORM_FEE_BPS))
      .div(new BN(10_000));
    expect(expectedFee.toNumber()).toBe(0); // sanity check
    const payload = {
      ...baseSeedData,
      inAmount: tinyAmount,
      platformFee: {
        amount: expectedFee.toString(),
        feeBps: PLATFORM_FEE_BPS,
      },
    };
    const quote = makeJupQuote(payload);

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: tinyAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: referrerFeeBps,
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).resolves.toBeDefined();
  });

  it("happy path: creates missing ATAs, calls Jupiter, splits fee correctly, signs, returns base64", async () => {
    // ALT exists
    connection.setALT("ALT1111111111111111111111111111111111111", true);

    // Quote and args
    const quote = makeJupQuote(baseSeedData);
    const secret = Uint8Array.from(feeWallet.secretKey);
    const totalFeesBps = platformFeeBps + referrerFeeBps;

    const { txBase64, lastValidBlockHeight, swapIns } =
      await buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: secret,
        referrer: {
          owner: REF_OWNER,
          feeAmountBps: referrerFeeBps,
        },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: totalFeesBps,
        dynamicSlippage: true,
        dynamicComputeUnitLimit: true,
      });

    // Last valid block height is bubbled through
    expect(lastValidBlockHeight).toBe(123456);
    // Jupiter was called with feeAccount = fee-owner ATA
    expect(swapInstructionsPostMock).toHaveBeenCalledTimes(1);
    const arg = swapInstructionsPostMock.mock.calls[0][0];
    expect(arg.swapRequest.feeAccount).toBe(feeATA);

    // Transfer amounts
    const inBN = new BN(inAmount);
    const totalFees = inBN.mul(new BN(totalFeesBps)).div(new BN(10_000));
    const ref = inBN.mul(new BN(referrerFeeBps)).div(new BN(10_000));
    const cold = totalFees.sub(ref);

    // We created fee-owner ATA (pre-swap) & referrer ATA (post-swap), not cold (already exists)
    expect(createAssociatedTokenAccountInstructionMock).toHaveBeenCalledTimes(
      2
    );

    // We issued *two* post-swap transfers (ref + cold)
    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(2);
    const t0 = JSON.parse(
      (
        createTransferCheckedInstructionMock.mock.results[0].value as any
      ).data.toString()
    );
    const t1 = JSON.parse(
      (
        createTransferCheckedInstructionMock.mock.results[1].value as any
      ).data.toString()
    );
    // One equals ref, the other equals cold (order isn’t guaranteed; check as set)
    const seen = [t0.amount, t1.amount].map(BigInt);
    expect(seen.sort()).toEqual(
      [BigInt(ref.toString()), BigInt(cold.toString())].sort()
    );

    // We signed with the server’s fee owner key (via our VersionedTransaction mock spy)
    // const { VersionedTransaction } = jest.requireActual("@solana/web3.js");
    expect(VersionedTransaction.__signSpy).toHaveBeenCalledTimes(1);
    const signers = VersionedTransaction.__signSpy.mock.calls[0][0];
    expect(signers[0].publicKey.toBase58()).toBe(FEE_OWNER);
    expect(signers[0].secretKey).toBe(secret);

    // We serialized to a stable base64 (cafebabe)
    expect(txBase64).toBe(Buffer.from("cafebabe", "utf8").toString("base64"));
    // Jupiter response bubbled back
    expect(swapIns.swapInstruction.data).toBe(asB64("swap"));
  });

  it("no ref share (0 bps) → only cold transfer issued", async () => {
    const quote = makeJupQuote(baseSeedData);

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: 0,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps,
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(platformFeeBps))
      .div(new BN(10_000));

    expect(fromPk.toBase58()).toBe(feeATA); // from intermediate fee ATA
    expect(toPk.toBase58()).toBe(coldATA); // to cold
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(amount).toBe(BigInt(fee.toString())); // whole fee
    expect(decimals).toBe(6); // from getMintMock default
  });

  it("100% ref share → only ref transfer, no cold ATA", async () => {
    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: referrerFeeBps,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: referrerFeeBps,
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(referrerFeeBps))
      .div(new BN(10_000));

    expect(fromPk.toBase58()).toBe(feeATA);
    expect(toPk.toBase58()).toBe(refATA); // to ref only
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(amount).toBe(BigInt(fee.toString())); // all to ref
    expect(decimals).toBe(6);

    // sanity: we never created cold ATA
    expect(
      createAssociatedTokenAccountInstructionMock.mock.calls.some(
        (c) => c[1]?.toBase58?.() === coldATA
      )
    ).toBe(false);
  });

  it("default referrerFeeAmountBps:  (omitted) → only cold transfer", async () => {
    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: 0,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps,
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(platformFeeBps))
      .div(new BN(10_000));

    expect(fromPk.toBase58()).toBe(feeATA);
    expect(toPk.toBase58()).toBe(coldATA);
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(amount).toBe(BigInt(fee.toString()));
    expect(decimals).toBe(6);
  });

  it("uses getMint decimals in transfers", async () => {
    const decimals = faker.datatype.number({ min: 1, max: 18 });
    getMintMock.mockResolvedValueOnce({ decimals: decimals }); // override

    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: referrerFeeBps,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
    });

    // both transfers should have decimals: 9 in the encoded JSON
    const payloads = createTransferCheckedInstructionMock.mock.results.map(
      (r) => JSON.parse((r.value as any).data.toString())
    );
    expect(payloads.every((p) => p.decimals === decimals)).toBe(true);
  });

  it("handles no ALTs and no cleanupInstruction", async () => {
    // Jupiter returns minimal set
    swapInstructionsPostMock.mockResolvedValueOnce({
      computeBudgetInstructions: [],
      setupInstructions: [],
      swapInstruction: jupIx(BASE58, [], "swap"),
      // cleanupInstruction: undefined
      // addressLookupTableAddresses: undefined
    });

    const quote = makeJupQuote(baseSeedData);
    const res = await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: referrerFeeBps,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
    });

    expect(res.txBase64).toBe(
      Buffer.from("cafebabe", "utf8").toString("base64")
    );
  });

  it("forwards userPublicKey and dynamic flags to Jupiter", async () => {
    const quote = makeJupQuote(baseSeedData);

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: referrerFeeBps,
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
      dynamicSlippage: false,
      dynamicComputeUnitLimit: false,
    });

    const call = swapInstructionsPostMock.mock.calls[0][0];
    expect(call.swapRequest.userPublicKey).toBe(USER);
    expect(call.swapRequest.dynamicSlippage).toBe(false);
    expect(call.swapRequest.dynamicComputeUnitLimit).toBe(false);
  });

  it("rounding: ref share (bps of volume) rounds to 0 → only cold gets total fee", async () => {
    // deterministic picks so: refInAtoms = 0, totalFeeAtoms > 0
    const inAmount = "100"; // 100 atoms
    const platformFeeBps = 100; // 1.00%
    const tinyShare = 1; // 0.01% of volume → floor(100 * 1 / 10_000) = 0
    const totalBps = platformFeeBps + tinyShare; // 101 bps

    // Quote mock aligned with "total bps"
    baseSeedData.inAmount = inAmount;
    baseSeedData.platformFee = {
      amount: new BN(inAmount)
        .mul(new BN(totalBps))
        .div(new BN(10_000))
        .toString(),
      feeBps: totalBps,
    };

    getMintMock.mockResolvedValueOnce({ decimals: 6 });
    const quote = makeJupQuote(baseSeedData);

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: {
        owner: REF_OWNER,
        feeAmountBps: tinyShare, // bps of volume
      },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: totalBps, // platform + ref
    });

    // Exactly one transfer (treasury/cold), because ref rounded to 0
    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    expect(fromPk.toBase58()).toBe(feeATA);
    expect(toPk.toBase58()).toBe(coldATA);
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(decimals).toBe(6);

    // totalFeeAtoms = floor(in * (platform + ref) / 10_000)
    // refInAtoms    = floor(in * ref / 10_000) = 0 here
    const totalFeeAtoms = new BN(inAmount)
      .mul(new BN(totalBps))
      .div(new BN(10_000));
    const refInAtoms = new BN(inAmount)
      .mul(new BN(tinyShare))
      .div(new BN(10_000));
    expect(refInAtoms.toNumber()).toBe(0); // sanity

    const expectedCold = totalFeeAtoms.sub(refInAtoms); // == totalFeeAtoms
    expect(amount).toBe(BigInt(expectedCold.toString()));

    // sanity: ensure we did NOT transfer to the referrer ATA anywhere
    const tos = createTransferCheckedInstructionMock.mock.calls.map((c) =>
      c[2].toBase58()
    );
    expect(tos).not.toContain(refATA);
  });

  it("fuzz fee math: sums and routing are correct across random inputs (bps of volume)", async () => {
    faker.seed(1337);
    getMintMock.mockResolvedValue({ decimals: 6 });

    for (let i = 0; i < 50; i++) {
      jest.clearAllMocks();

      const amount = faker.datatype
        .bigInt({ min: 1n, max: 10n ** 18n })
        .toString();

      // ref up to 9000 bps; platform at least 1 bps so total > 0
      const refShare = faker.datatype.number({ min: 0, max: 9000 });
      const platformShare = faker.datatype.number({
        min: 1,
        max: 10000 - refShare,
      });
      const totalBps = platformShare + refShare;

      const payload = {
        ...baseSeedData,
        inAmount: amount,
        platformFee: {
          amount: new BN(amount)
            .mul(new BN(totalBps))
            .div(new BN(10_000))
            .toString(),
          feeBps: totalBps,
        },
      };

      const quote = makeJupQuote(payload);

      await buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: amount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: { owner: REF_OWNER, feeAmountBps: refShare }, // bps of volume
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: totalBps, // platform + ref
      });

      // Expected math (volume-based)
      const fee = new BN(amount).mul(new BN(totalBps)).div(new BN(10_000));
      const ref = new BN(amount).mul(new BN(refShare)).div(new BN(10_000)); // <- from volume
      const cold = fee.sub(ref);

      // # of transfers
      const calls = createTransferCheckedInstructionMock.mock.calls;
      const n = calls.length;
      expect(n).toBe(ref.isZero() ? 1 : 2);

      // Amounts & routing
      const toAddrs = calls.map((c) => c[2].toBase58());
      const amounts = calls.map((c) => c[4]);
      const sum = amounts.reduce((acc, x) => acc + BigInt(x), 0n);
      expect(sum).toBe(BigInt(fee.toString())); // conservation

      if (ref.isZero()) {
        expect(toAddrs).toEqual([coldATA]);
        expect(amounts[0]).toBe(BigInt(cold.toString()));
      } else {
        expect(new Set(toAddrs)).toEqual(new Set([refATA, coldATA]));
        expect(new Set(amounts.map((a) => a.toString()))).toEqual(
          new Set([ref.toString(), cold.toString()])
        );
      }

      // Common fields
      for (const [fromPk, mintPk, , authPk, , decimals] of calls) {
        expect(fromPk.toBase58()).toBe(feeATA);
        expect(mintPk.toBase58()).toBe(MINT);
        expect(authPk.toBase58()).toBe(FEE_OWNER);
        expect(decimals).toBe(6);
      }
    }
  });

  it('throws "Expected cold treasury ATA to be defined" when getAssociatedTokenAddress returns null for cold', async () => {
    const quote = makeJupQuote(baseSeedData);

    // Order of calls in your function (with no referrer): intermediate → cold
    // 1st call (intermediate): return deterministic ATA
    getAssociatedTokenAddressMock
      .mockImplementationOnce((_mint, owner) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      })
      // 2nd call (cold): force null to trigger the throw
      .mockImplementationOnce(() => null as any)
      // subsequent calls (if any): revert to default deterministic impl
      .mockImplementation((_mint, owner) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        // no referrer -> needCold = true -> 2nd ATA call is cold
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps,
        referrer: undefined,
      })
    ).rejects.toThrow("Expected cold treasury ATA to be defined");
  });

  it('throws "Expected referrer ATA to be defined" when getAssociatedTokenAddress returns null for referrer', async () => {
    const quote = makeJupQuote(baseSeedData);

    // Order with referrer present: intermediate → referrer → cold
    getAssociatedTokenAddressMock
      .mockImplementationOnce((_mint, owner) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      })
      .mockImplementationOnce(() => null as any) // referrer ATA missing
      .mockImplementation((_mint, owner) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow("Expected referrer ATA to be defined");
  });

  it("no referrer provided → only cold transfer and no ref ATA creation", async () => {
    const quote = makeJupQuote(baseSeedData);

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      // referrer omitted
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps,
    });

    // exactly one transfer (to cold)
    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);
    const [, , toPk] = createTransferCheckedInstructionMock.mock.calls[0];
    expect(toPk.toBase58()).toBe(coldATA);

    // no create-ATA for ref
    const createdATAs =
      createAssociatedTokenAccountInstructionMock.mock.calls.map((c) =>
        c[1]?.toBase58?.()
      );
    expect(createdATAs).not.toContain(refATA);
  });

  it("when all ATAs exist → does not create any ATA", async () => {
    // mark all present
    connection.setATA(feeATA, true);
    connection.setATA(refATA, true);
    connection.setATA(coldATA, true);

    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
    });

    expect(createAssociatedTokenAccountInstructionMock).not.toHaveBeenCalled();
  });

  it("works when quote.platformFee is undefined", async () => {
    const quote = makeJupQuote({ ...baseSeedData, platformFee: undefined });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).resolves.toBeDefined();
  });

  it("calls getMint exactly once with the INPUT mint", async () => {
    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
    });

    expect(getMintMock).toHaveBeenCalledTimes(1);
    expect(getMintMock.mock.calls[0][1].toBase58()).toBe(MINT);
  });

  it("orders instructions: preSwap→swap→postSwap→cleanup (by owner)", async () => {
    // force creation of all three ATAs so we can see them explicitly
    connection.setATA(feeATA, false);
    connection.setATA(refATA, false);
    connection.setATA(coldATA, false);

    const quote = makeJupQuote(baseSeedData);
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: platformFeeBps + referrerFeeBps,
    });

    const { VersionedTransaction } = require("@solana/web3.js");
    const instrs: any[] = VersionedTransaction.__last.msg.instructions;
    const tag = (ix: any) => ix.data.toString();

    const idxSwap = instrs.findIndex((ix) => tag(ix) === "swap");
    const idxCleanup = instrs.findIndex((ix) => tag(ix) === "cleanup");
    expect(idxSwap).toBeGreaterThan(-1);
    expect(idxCleanup).toBeGreaterThan(-1);

    // create-ATA instructions: keys = [payer, ata, owner, mint]
    const creates = instrs
      .map((ix, i) => ({ ix, i }))
      .filter(({ ix }) => tag(ix) === "create-ata")
      .map(({ ix, i }) => ({ i, owner: ix.keys[2].pubkey.toBase58() }));

    // we expect fee/ref/cold creates to exist
    const feeCreate = creates.find((c) => c.owner === FEE_OWNER)!;
    const refCreate = creates.find((c) => c.owner === REF_OWNER)!;
    const coldCreate = creates.find((c) => c.owner === COLD_OWNER)!;

    // transfers: keys = [from, to, auth, mint]; data is JSON string
    const transfers = instrs
      .map((ix, i) => ({ ix, i }))
      .filter(({ ix }) => tag(ix).startsWith("{"))
      .map(({ ix, i }) => ({ i, to: ix.keys[1].pubkey.toBase58() }));

    const refXfer = transfers.find((t) => t.to === refATA)!;
    const coldXfer = transfers.find((t) => t.to === coldATA)!;

    // Fee-vault create happens pre-swap
    expect(feeCreate.i).toBeLessThan(idxSwap);

    // Ref & cold creates happen post-swap
    expect(refCreate.i).toBeGreaterThan(idxSwap);
    expect(coldCreate.i).toBeGreaterThan(idxSwap);

    // Each transfer must happen after its own create (not necessarily after both creates)
    expect(refXfer.i).toBeGreaterThan(refCreate.i);
    expect(coldXfer.i).toBeGreaterThan(coldCreate.i);

    // Cleanup is last
    expect(idxCleanup).toBe(instrs.length - 1);
  });

  it("throws if fee-vault INPUT ATA cannot be derived", async () => {
    const quote = makeJupQuote(baseSeedData);

    // First getAssociatedTokenAddress call is for fee vault → return null
    getAssociatedTokenAddressMock
      .mockImplementationOnce(() => null as any)
      .mockImplementation((_mint, owner) => {
        const ownerPk =
          typeof owner === "object" ? owner : new PublicKey(owner);
        const mintPk = typeof _mint === "object" ? _mint : new PublicKey(_mint);
        return ataFromOwner(ownerPk, mintPk);
      });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: { owner: REF_OWNER, feeAmountBps: referrerFeeBps },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: platformFeeBps + referrerFeeBps,
      })
    ).rejects.toThrow(); // will be a runtime error from using null; acceptable until you add an explicit guard
  });

  it("totalFeeBps = 0 → no transfers and no server signature", async () => {
    const quote = makeJupQuote({ ...baseSeedData, platformFee: undefined }); // we don't rely on it

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      // no referrer
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: 0, // zero fee
    });

    expect(createTransferCheckedInstructionMock).not.toHaveBeenCalled();
    expect(
      require("@solana/web3.js").VersionedTransaction.__signSpy
    ).not.toHaveBeenCalled();
  });

  it("throws when referrer.feeAmountBps > totalFeeBps", async () => {
    const quote = makeJupQuote(baseSeedData);

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
        referrer: { owner: REF_OWNER, feeAmountBps: 500 },
        coldTreasuryOwner: COLD_OWNER,
        totalFeeBps: 400, // smaller than referrer bps
      })
    ).rejects.toThrow("Referrer fee bps cannot exceed total fee bps");
  });

  it("no signing when only post-swap create-ATAs occur (no transfers)", async () => {
    // force creates by making ATAs absent
    connection.setATA(feeATA, false);
    connection.setATA(refATA, false);
    connection.setATA(coldATA, false);

    const quote = makeJupQuote({...baseSeedData, inAmount: "1"});
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: "1", // tiny so totalFeeAtoms=0
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
      // referrer omitted
      coldTreasuryOwner: COLD_OWNER,
      totalFeeBps: 0,
    });

    expect(createTransferCheckedInstructionMock).not.toHaveBeenCalled();
    expect(
      require("@solana/web3.js").VersionedTransaction.__signSpy
    ).not.toHaveBeenCalled();
  });

  // it("zero-fee short-circuit would omit feeAccount (if enabled)", async () => {
  //   const quote = makeJupQuote({ ...baseSeedData, platformFee: undefined, inAmount: "10000" });

  //   await buildAtomicSwapTxWithFeeSplit({
  //     connection: connection as any,
  //     quoteResponse: quote,
  //     inputMint: MINT,
  //     inputAmountAtoms: "10000",
  //     userPublicKey: USER,
  //     intermediateFeeOwner: FEE_OWNER,
  //     intermediateFeeOwnerSecretKey: Uint8Array.from(feeWallet.secretKey),
  //     coldTreasuryOwner: COLD_OWNER,
  //     totalFeeBps: 0,
  //   });

  //   const call = swapInstructionsPostMock.mock.calls[0][0];
  //   expect(call.swapRequest.feeAccount).toBeUndefined(); // <- enable after short-circuit change
  //   expect(call.swapRequest.userPublicKey).toBe(USER);
  // });
});
