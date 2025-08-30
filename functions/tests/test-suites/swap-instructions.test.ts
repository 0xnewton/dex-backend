import { swapInstructions, SwapInstructionsPayload } from "../../src/services/swap/swap-instructions";
import {
  NotFoundError,
  ResourceExpiredError,
} from "../../src/lib/backend-framework";
import { QuoteDB } from "../../src/lib/db/quotes";
import { makeQuote } from "../factories/quotes";
import { faker } from "@faker-js/faker";
import { makeReferral } from "../factories/referrals";
import { makeUser } from "../factories/users";

const getQuoteById = jest.fn();
const isQuoteWithReferral = jest.fn();
jest.mock("../../src/lib/db/quotes", () => ({
  getQuoteById: (...args: any[]) => getQuoteById(...args),
  isQuoteWithReferral: (...args: any[]) => isQuoteWithReferral(...args),
}));

// Users / Referrals lookups
const getUserByID = jest.fn();
const getReferralBySlug = jest.fn();
jest.mock("../../src/lib/db/users", () => ({
  getUserByID: (...args: any[]) => getUserByID(...args),
}));
jest.mock("../../src/lib/db/referrals", () => ({
  getReferralBySlug: (...args: any[]) => getReferralBySlug(...args),
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

// later
import { Connection } from "@solana/web3.js";

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

const ts = (ms: number) => ({ toMillis: () => ms }) as any;

describe("swapInstructions", () => {
  let quote: QuoteDB
  let args: SwapInstructionsPayload
  let userPublicKey: string
  let mockInstructions: any

  beforeEach(() => {
    jest.clearAllMocks();
    userPublicKey = faker.finance.ethereumAddress()
    quote = makeQuote({ userPublicKey })
    args = { quoteId: quote.id, userPublicKey }
    mockInstructions = { txBase64: "FAKE_B64", meta: { ok: true } }
  });

  it("throws NotFoundError when the quote does not exist", async () => {
    getQuoteById.mockResolvedValue(null);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getQuoteById).toHaveBeenCalledWith(quote.id);
    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("throws ResourceExpiredError when the quote is expired", async () => {
    quote.expiresAt = ts(Date.now() - 1)
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(false);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      ResourceExpiredError
    );

    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("errors if quote has referral but the referral doc is missing", async () => {
    quote.referralSlug = faker.helpers.slugify(faker.lorem.word())
    quote.referralUserId = faker.datatype.uuid()
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(true);
    const user = makeUser({
      id: quote.referralUserId,
    })

    getReferralBySlug.mockResolvedValue(null);
    getUserByID.mockResolvedValue(user);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getReferralBySlug).toHaveBeenCalledWith(quote.referralSlug);
    expect(getUserByID).toHaveBeenCalledWith(quote.referralUserId);
    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("errors if quote has referral but the referrer user is missing", async () => {
    quote.referralSlug = faker.helpers.slugify(faker.lorem.word())
    quote.referralUserId = faker.datatype.uuid()
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(true);
    const referral = makeReferral({
      slug: quote.referralSlug,
      userID: quote.referralUserId,
    })
    getReferralBySlug.mockResolvedValue(referral);
    getUserByID.mockResolvedValue(null);

    await expect(swapInstructions(args)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getReferralBySlug).toHaveBeenCalledWith(quote.referralSlug);
    expect(getUserByID).toHaveBeenCalledWith(quote.referralUserId);
    expect(buildAtomicSwapTxWithFeeSplit).not.toHaveBeenCalled();
  });

  it("builds instructions without referrer when quote has no referral", async () => {
 quote.referralSlug = null
    quote.referralUserId = null
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(false);
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
        userPublicKey: quote.userPublicKey,
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

  it("builds instructions with referrer when quote has a referral", async () => {
    quote.referralSlug = faker.helpers.slugify(faker.lorem.word())
    quote.referralUserId = faker.datatype.uuid()
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(true);
    const referral = makeReferral({
      slug: quote.referralSlug,
      userID: quote.referralUserId,
    })
    getReferralBySlug.mockResolvedValue(referral);
    const user = makeUser({
      id: quote.referralUserId,
    })
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

  it("it ignores the user public key in the quote and uses the one passed in", async () => {
    quote.userPublicKey = faker.finance.ethereumAddress() + 'yoooo'
    getQuoteById.mockResolvedValue(quote);
    isQuoteWithReferral.mockReturnValue(false);
    getReferralBySlug.mockResolvedValue(null);
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

    expect(arg.userPublicKey).toBe(userPublicKey)
  });
});
