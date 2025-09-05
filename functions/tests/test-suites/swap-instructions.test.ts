import { swapInstructions, SwapInstructionsPayload } from "../../src/services/swap/swap-instructions";
import {
  NotFoundError,
} from "../../src/lib/backend-framework";
import { QuoteDB } from "../../src/lib/db/quotes";
import { makeGetAndStoreQuotePayload, makeQuote } from "../factories/quotes";
import { faker } from "@faker-js/faker";
import { makeReferral } from "../factories/referrals";
import { makeUser } from "../factories/users";


// Users / Referrals lookups
const getUserByID = jest.fn();
jest.mock("../../src/lib/db/users", () => ({
  getUserByID: (...args: any[]) => getUserByID(...args),
}));

// Jup builder: we only assert the args we forward and return a canned result
const buildAtomicSwapTxWithFeeSplit = jest.fn();
jest.mock("../../src/lib/jup", () => ({
  buildAtomicSwapTxWithFeeSplit: (...args: any[]) =>
    buildAtomicSwapTxWithFeeSplit(...args),
}));

// Secrets / variables
const solanaRpcUrlValue = jest.fn(() => "https://unit-test.rpc");
const intermediateFeeVaultPrivateKeyValue = jest.fn(
  () => "FAKE_PRIVKEY_BASE58"
);
const intermediateFeeVaultPublicKeyValue = jest.fn(
  () => "FAKE_INTERMEDIATE_PUBKEY"
);
const platformTreasuryPublicKeyValue = jest.fn(() => "FAKE_TREASURY_PUBKEY");
jest.mock("../../src/lib/config/secrets", () => ({
  solanaRpcUrl: { value: () => solanaRpcUrlValue() },
  intermediateFeeVaultPrivateKey: {
    value: () => intermediateFeeVaultPrivateKeyValue(),
  },
}));
jest.mock("../../src/lib/config/variables", () => ({
  intermediateFeeVaultPublicKey: {
    value: () => intermediateFeeVaultPublicKeyValue(),
  },
  platformTreasuryPublicKey: { value: () => platformTreasuryPublicKeyValue() },
}));

// Keypair loader
jest.mock("../../src/lib/crypto/load-keypair", () => ({
  loadKeypair: (_: string) => ({ secretKey: new Uint8Array([1, 2, 3, 4]) }),
}));

jest.mock("@solana/web3.js", () => {
  const ctor = jest.fn(function Connection(this: any, url: string) {
    this.url = url;
    return this;
  });
  return { Connection: ctor };
});
const getAndStoreQuoteMock = jest.fn();
jest.mock("../../src/services/swap/get-and-store-quote", () => ({
  getAndStoreQuote: (...args: any[]) => getAndStoreQuoteMock(...args),
}));

const buildUnsignedSwapTxBase64Mock = jest.fn();
jest.mock("../../src/lib/jup/build-unsigned-swap-tx-b64", () => ({
  buildUnsignedSwapTxBase64: (...args: any[]) =>
    buildUnsignedSwapTxBase64Mock(...args),
}));

// later
import { Connection } from "@solana/web3.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

const ts = (ms: number) => ({ toMillis: () => ms }) as any;

describe("swapInstructions", () => {
  let quote: QuoteDB
  let args: SwapInstructionsPayload
  let mockInstructions: any

  beforeEach(() => {
    jest.clearAllMocks();
    const userPublicKey = faker.finance.ethereumAddress()
    quote = makeQuote({ userPublicKey })
    const baseSwapAndStorePayload = makeGetAndStoreQuotePayload();
    args = { userPublicKey, ...baseSwapAndStorePayload }
    mockInstructions = { txBase64: "FAKE_B64", meta: { ok: true } }
    getAndStoreQuoteMock.mockResolvedValue({ quote, referral: null });
  });

  it("errors if payload has referral but the referral doc is missing", async () => {
    args.referralSlug = faker.helpers.slugify(faker.lorem.word())
    getAndStoreQuoteMock.mockResolvedValue({ quote, referral: null });
    getUserByID.mockResolvedValue(null);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getUserByID).toHaveBeenCalledTimes(0);
    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("errors if payload has a referral but the referrer user is missing", async () => {
    args.referralSlug = faker.helpers.slugify(faker.lorem.word())
    const referral = makeReferral()

    getAndStoreQuoteMock.mockResolvedValue({ quote, referral });
    getUserByID.mockResolvedValue(null);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getUserByID).toHaveBeenCalledWith(referral.userID);
    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("builds instructions without referrer when payload has no referral", async () => {
    args.referralSlug = undefined;
    buildAtomicSwapTxWithFeeSplit.mockResolvedValue(mockInstructions);

    const res = await swapInstructions(args);

    expect(res).toEqual({
      instructions: mockInstructions,
      referral: null,
      referrerUser: null,
      quote
    });

    // Connection instantiated with our RPC URL
    expect((Connection as jest.Mock).mock.calls[0][0]).toBe("https://unit-test.rpc");


    // Args forwarded correctly
    expect(buildAtomicSwapTxWithFeeSplit).toHaveBeenCalledTimes(1);
    const arg = buildAtomicSwapTxWithFeeSplit.mock.calls[0][0];

    expect(arg).toEqual(
      expect.objectContaining({
        inputAmountAtoms: quote.quote.inAmount,
        quoteResponse: quote.quote,
        inputMint: quote.inputMint,
        userPublicKey: args.userPublicKey,
        platformFeeBps: quote.platformFeeBps,
        dynamicSlippage: quote.dynamicSlippage,
        dynamicComputeUnitLimit: true,
        intermediateFeeOwner: "FAKE_INTERMEDIATE_PUBKEY",
        intermediateFeeOwnerSecretKey: new Uint8Array([1, 2, 3, 4]),
        coldTreasuryOwner: "FAKE_TREASURY_PUBKEY",
        referrer: undefined,
      })
    );
  });

  it("builds instructions with referrer when payload has a referral", async () => {
    args.referralSlug = faker.helpers.slugify(faker.lorem.word())
    const referral = makeReferral()
    getAndStoreQuoteMock.mockResolvedValue({ quote, referral });
    const user = makeUser()
    getUserByID.mockResolvedValue(user);
    buildAtomicSwapTxWithFeeSplit.mockResolvedValue(mockInstructions);

    const res = await swapInstructions(args);
    expect(res).toEqual({
      instructions: mockInstructions,
      referral,
      referrerUser: user,
      quote
    });

    expect(buildAtomicSwapTxWithFeeSplit).toHaveBeenCalledTimes(1);
    const arg = buildAtomicSwapTxWithFeeSplit.mock.calls[0][0];

    expect(arg.referrer).toEqual({
      owner: user.walletAddress,
      shareBpsOfFee: referral.referrerShareBpsOfFee,
    });
  });

  it("it uses the user public key passed in", async () => {
    args.referralSlug = undefined;
    const user = makeUser()
    getUserByID.mockResolvedValue(user);

    const cannedResult = { txBase64: "WITH_REF", meta: { ok: true } };
    buildAtomicSwapTxWithFeeSplit.mockResolvedValue(cannedResult);

    const res = await swapInstructions(args);
    expect(res).toEqual({
      instructions: cannedResult,
      referral: null,
      referrerUser: null,
      quote
    });

    expect(buildAtomicSwapTxWithFeeSplit).toHaveBeenCalledTimes(1);
    const arg = buildAtomicSwapTxWithFeeSplit.mock.calls[0][0];

    expect(arg.userPublicKey).toBe(args.userPublicKey)
  });
});
