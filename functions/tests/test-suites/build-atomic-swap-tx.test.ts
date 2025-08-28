import { buildAtomicSwapTxWithFeeSplit } from "../../src/lib/jup/build-atomic-swap-tx";
import { DEFAULT_TOTAL_FEE_BPS } from "../../src/lib/constants";
import { makeJupQuote } from "../factories/quotes";
import { faker } from "@faker-js/faker";
import BN from "bn.js";
const {
  PublicKey,
  VersionedTransaction,
  TransactionInstruction,
} = require("@solana/web3.js");

// ---------- Helpers ----------
const BASE58 = "11111111111111111111111111111111";
const asB64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

// ---------- Mocks ----------

jest.mock("@solana/web3.js", () => {
  const toStr = (v: string | Uint8Array) =>
    typeof v === "string" ? v : "B58_" + Buffer.from(v).toString("hex"); // stable string

  class PublicKey {
    private _b58: string;
    constructor(v: string | Uint8Array) {
      this._b58 = toStr(v);
    }
    toBase58() {
      return this._b58; // ALWAYS string
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
  class VersionedTransaction {
    static __signSpy = jest.fn();
    static __serializeSpy = jest.fn(() => Buffer.from("cafebabe", "utf8"));
    constructor(public msg: any) {}
    sign(signers: any[]) {
      VersionedTransaction.__signSpy(signers);
    }
    serialize() {
      return VersionedTransaction.__serializeSpy();
    }
  }
  class AddressLookupTableAccount {}
  class Connection {}

  return {
    PublicKey,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    AddressLookupTableAccount,
    Connection,
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

  beforeEach(() => {
    jest.clearAllMocks();
    inAmount = faker.datatype.number({ min: 1_000, max: 1_000_000 }).toString();
    USER = pkFromSeed(1).toBase58();
    FEE_OWNER = pkFromSeed(2).toBase58();
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
  });

  it("throws on inputMint mismatch", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: "OtherMint" });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      })
    ).rejects.toThrow("inputMint mismatch");
  });

  it("throws on inAmount mismatch", async () => {
    const quote = makeJupQuote({
      inAmount,

      inputMint: MINT,
    });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: faker.random.numeric(3), // mismatch
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      })
    ).rejects.toThrow("inAmount mismatch");
  });

  it("throws if platformFeeBps !== DEFAULT_TOTAL_FEE_BPS", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    const diffMultiplier = faker.datatype.boolean() ? 1 : -1;
    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps:
          DEFAULT_TOTAL_FEE_BPS +
          diffMultiplier * faker.datatype.number({ min: 1, max: 10 }),
      })
    ).rejects.toThrow(/Unexpected platformFeeBps/);
  });

  it("throws on referrerShareBpsOfFee out of range (negative)", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
        referrerShareBpsOfFee:
          -1 * faker.datatype.number({ min: 1, max: 10000 }),
      })
    ).rejects.toThrow("referrerShareBpsOfFee must be between 0 and 10,000");
  });

  it("throws on referrerShareBpsOfFee out of range (positive)", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
        referrerShareBpsOfFee:
          10000 + faker.datatype.number({ min: 1, max: 10000 }),
      })
    ).rejects.toThrow("referrerShareBpsOfFee must be between 0 and 10,000");
  });

  it("throws if swapMode !== ExactIn", async () => {
    const quote = makeJupQuote({
      inAmount,
      inputMint: MINT,
      swapMode: "ExactOut",
    });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      })
    ).rejects.toThrow("Only ExactIn supported for deterministic fee math");
  });

  it("throws if computed fee is zero", async () => {
    // Choose amount/bps such that floor(amount * bps / 10000) === 0
    const tinyAmount = "1";
    const quote = makeJupQuote({ inAmount: tinyAmount, inputMint: MINT });

    await expect(
      buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: tinyAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      })
    ).rejects.toThrow("Fee is zero for given amount/bps.");
  });

  it("happy path: creates missing ATAs, calls Jupiter, splits fee correctly, signs, returns base64", async () => {
    // ALT exists
    connection.setALT("ALT1111111111111111111111111111111111111", true);

    // Quote and args
    const refShareBpsOfFee = 5000; // 50% of fee to referrer
    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    const secret = new Uint8Array(64).fill(7);

    const { txBase64, lastValidBlockHeight, swapIns } =
      await buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: inAmount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: secret,
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
        referrerShareBpsOfFee: refShareBpsOfFee,
        dynamicSlippage: true,
        dynamicComputeUnitLimit: true,
      });

    // Last valid block height is bubbled through
    expect(lastValidBlockHeight).toBe(123456);
    // Jupiter was called with feeAccount = fee-owner ATA
    expect(swapInstructionsPostMock).toHaveBeenCalledTimes(1);
    const arg = swapInstructionsPostMock.mock.calls[0][0];
    expect(arg.swapRequest.feeAccount).toBe(feeATA);

    // Transfer amounts: fee = floor(in * bps / 10000)
    const fee = new BN(inAmount)
      .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
      .div(new BN(10_000));
    const ref = fee.mul(new BN(refShareBpsOfFee)).div(new BN(10_000));
    const cold = fee.sub(ref);

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
    const quote = makeJupQuote({ inAmount, inputMint: MINT });

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: 0,
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
      .div(new BN(10_000));

    expect(fromPk.toBase58()).toBe(feeATA); // from intermediate fee ATA
    expect(toPk.toBase58()).toBe(coldATA); // to cold
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(amount).toBe(BigInt(fee.toString())); // whole fee
    expect(decimals).toBe(6); // from getMintMock default
  });

  it("100% ref share → only ref transfer, no cold ATA", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: 10_000,
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
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

  it("default referrerShareBpsOfFee (omitted) → only cold transfer", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      // no referrerShareBpsOfFee
    });

    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    const fee = new BN(inAmount)
      .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
      .div(new BN(10_000));

    expect(fromPk.toBase58()).toBe(feeATA);
    expect(toPk.toBase58()).toBe(coldATA);
    expect(authPk.toBase58()).toBe(FEE_OWNER);
    expect(mintPk.toBase58()).toBe(MINT);
    expect(amount).toBe(BigInt(fee.toString()));
    expect(decimals).toBe(6);
  });

  it("uses getMint decimals in transfers", async () => {
    getMintMock.mockResolvedValueOnce({ decimals: 9 }); // override

    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: 5000,
    });

    // both transfers should have decimals: 9 in the encoded JSON
    const payloads = createTransferCheckedInstructionMock.mock.results.map(
      (r) => JSON.parse((r.value as any).data.toString())
    );
    expect(payloads.every((p) => p.decimals === 9)).toBe(true);
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

    const quote = makeJupQuote({ inAmount, inputMint: MINT });
    const res = await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: 5000,
    });

    expect(res.txBase64).toBe(
      Buffer.from("cafebabe", "utf8").toString("base64")
    );
  });

  it("forwards userPublicKey and dynamic flags to Jupiter", async () => {
    const quote = makeJupQuote({ inAmount, inputMint: MINT });

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: inAmount,
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: 1234,
      dynamicSlippage: false,
      dynamicComputeUnitLimit: false,
    });

    const call = swapInstructionsPostMock.mock.calls[0][0];
    expect(call.swapRequest.userPublicKey).toBe(USER);
    expect(call.swapRequest.dynamicSlippage).toBe(false);
    expect(call.swapRequest.dynamicComputeUnitLimit).toBe(false);
  });

  it("rounding: ref share rounds to 0 → no ref transfer", async () => {
    const quote = makeJupQuote({ inAmount: "1000", inputMint: MINT }); // fee = floor(1000*BPS/10000)
    // choose BPS so fee small; e.g., DEFAULT_TOTAL_FEE_BPS=20 → fee=2
    // make ref share tiny so floor(2 * share/10000) = 0
    const tinyShare = 1; // 0.01% of fee → 0 atoms

    await buildAtomicSwapTxWithFeeSplit({
      connection: connection as any,
      quoteResponse: quote,
      inputMint: MINT,
      inputAmountAtoms: "1000",
      userPublicKey: USER,
      intermediateFeeOwner: FEE_OWNER,
      intermediateFeeOwnerSecretKey: new Uint8Array(64),
      referrerOwner: REF_OWNER,
      coldTreasuryOwner: COLD_OWNER,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: tinyShare,
    });

    // exactly one transfer was issued
    expect(createTransferCheckedInstructionMock).toHaveBeenCalledTimes(1);

    // inspect the call args to confirm it’s the COLD transfer and not REF
    const [fromPk, mintPk, toPk, authPk, amount, decimals] =
      createTransferCheckedInstructionMock.mock.calls[0];

    expect(fromPk.toBase58()).toBe(feeATA); // from = intermediate fee ATA
    expect(toPk.toBase58()).toBe(coldATA); // to   = cold treasury ATA
    expect(authPk.toBase58()).toBe(FEE_OWNER); // authority = fee owner
    expect(mintPk.toBase58()).toBe(MINT); // correct mint
    expect(decimals).toBe(6); // from getMintMock

    // amount should equal the whole fee (since ref rounded to 0)
    const fee = new BN(1000)
      .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
      .div(new BN(10_000));
    expect(amount).toBe(BigInt(fee.toString()));

    // sanity: ensure we did NOT transfer to the referrer ATA anywhere
    const tos = createTransferCheckedInstructionMock.mock.calls.map((c) =>
      c[2].toBase58()
    );
    expect(tos).not.toContain(refATA);
  });

  it("fuzz fee math: sums and routing are correct across random inputs", async () => {
    faker.seed(1337);
    getMintMock.mockResolvedValue({ decimals: 6 });

    for (let i = 0; i < 50; i++) {
      jest.clearAllMocks();

      const amount = faker.datatype
        .bigInt({ min: 1, max: 10n ** 18n })
        .toString();
      const refShare = faker.datatype.number({ min: 0, max: 10_000 });

      const quote = makeJupQuote({ inAmount: amount, inputMint: MINT });
      await buildAtomicSwapTxWithFeeSplit({
        connection: connection as any,
        quoteResponse: quote,
        inputMint: MINT,
        inputAmountAtoms: amount,
        userPublicKey: USER,
        intermediateFeeOwner: FEE_OWNER,
        intermediateFeeOwnerSecretKey: new Uint8Array(64),
        referrerOwner: REF_OWNER,
        coldTreasuryOwner: COLD_OWNER,
        platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
        referrerShareBpsOfFee: refShare,
      });

      // Expected math
      const fee = new BN(amount)
        .mul(new BN(DEFAULT_TOTAL_FEE_BPS))
        .div(new BN(10_000));
      const ref = fee.mul(new BN(refShare)).div(new BN(10_000));
      const cold = fee.sub(ref);

      // # of transfers
      const n = createTransferCheckedInstructionMock.mock.calls.length;
      expect(n).toBe(ref.isZero() ? 1 : 2);

      // Amounts & routing
      const calls = createTransferCheckedInstructionMock.mock.calls;
      const toAddrs = calls.map((c) => c[2].toBase58());
      const amounts = calls.map((c) => c[4]);

      // Sum of amounts equals fee
      const sum = amounts.reduce((acc, x) => acc + BigInt(x), 0n);
      expect(sum).toBe(BigInt(fee.toString()));

      // If ref > 0, ensure one goes to ref, one to cold. If ref == 0, only cold.
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
});
