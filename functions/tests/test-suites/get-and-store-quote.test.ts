import { DEFAULT_TOTAL_FEE_BPS } from "../../src/lib/constants";
import { NotFoundError } from "../../src/lib/errors";
import { getAndStoreQuote, GetAndStoreQuotePayload } from "../../src/services/swap/get-and-store-quote";

// --- Mocks ---
jest.mock("../../src/lib/jup/client", () => ({
  getJupiterClient: jest.fn(),
}));
jest.mock("../../src/lib/db/referrals", () => ({
  getReferralBySlug: jest.fn(),
}));
jest.mock("../../src/lib/db/quotes", () => ({
  createQuote: jest.fn(),
}));

import { getJupiterClient } from "../../src/lib/jup/client";
import { getReferralBySlug, ReferralDB } from "../../src/lib/db/referrals";
import { createQuote, QuoteDB } from "../../src/lib/db/quotes";
import { faker } from "@faker-js/faker";
import { makeGetAndStoreQuotePayload, makeQuote } from "../factories/quotes";
import { makeReferral } from "../factories/referrals";

describe("getAndStoreQuote", () => {
  const quoteGetMock = jest.fn();
  const jupClient = { quoteGet: quoteGetMock };
  let basePayload: GetAndStoreQuotePayload;
  let quote: QuoteDB;
  let referral: ReferralDB;

  beforeEach(() => {
    jest.clearAllMocks();
    basePayload = makeGetAndStoreQuotePayload();
    quote = makeQuote({
        userPublicKey: basePayload.userPublicKey,
        inputMint: basePayload.inputMint,
        outputMint: basePayload.outputMint,
        amount: String(basePayload.amount),
        slippageBps: basePayload.slippageBps,
        dynamicSlippage: basePayload.dynamicSlippage,
    });
    referral = makeReferral();
    (getJupiterClient as jest.Mock).mockReturnValue(jupClient);
    quoteGetMock.mockResolvedValue(quote.quote);
    (createQuote as jest.Mock).mockResolvedValue(quote);
  });

  it("without referral: uses DEFAULT_TOTAL_FEE_BPS and stores quote with null referral fields", async () => {
    basePayload.referralSlug = undefined;
    const res = await getAndStoreQuote(basePayload);

    // Jupiter called with expected params
    expect(quoteGetMock).toHaveBeenCalledTimes(1);
    expect(quoteGetMock).toHaveBeenCalledWith({
      inputMint: basePayload.inputMint,
      outputMint: basePayload.outputMint,
      amount: basePayload.amount,
      slippageBps: basePayload.slippageBps,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      swapMode: "ExactIn",
      dynamicSlippage: basePayload.dynamicSlippage,
    });

    // createQuote called with correct mapping (+ amount coerced to string)
    expect(createQuote).toHaveBeenCalledTimes(1);
    expect(createQuote).toHaveBeenCalledWith({
      userPublicKey: basePayload.userPublicKey,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      referralId: undefined,
      referralSlug: undefined,
      referralUserId: undefined,
      swapMode: "ExactIn",
      dynamicSlippage: basePayload.dynamicSlippage,
      inputMint: basePayload.inputMint,
      outputMint: basePayload.outputMint,
      amount: String(basePayload.amount),
      slippageBps: basePayload.slippageBps,
      quote: quote.quote,
    });

    // returns what createQuote returns
    expect(res).toEqual({ quote });
  });

  it("with referral: uses referral.feeBps and passes referral metadata into createQuote", async () => {
    (getReferralBySlug as jest.Mock).mockResolvedValue(referral);
    
    basePayload.referralSlug = referral.slug;
    const res = await getAndStoreQuote(basePayload);

    expect(getReferralBySlug).toHaveBeenCalledWith(referral.slug);
    expect(quoteGetMock).toHaveBeenCalledWith({
      inputMint: basePayload.inputMint,
      outputMint: basePayload.outputMint,
      amount: basePayload.amount,
      slippageBps: basePayload.slippageBps,
      platformFeeBps: referral.feeBps,
      swapMode: "ExactIn",
      dynamicSlippage: basePayload.dynamicSlippage,
    });

    expect(createQuote).toHaveBeenCalledWith({
      userPublicKey: basePayload.userPublicKey,
      platformFeeBps: referral.feeBps,
      referralId: referral.id,
      referralSlug: referral.slug,
      referralUserId: referral.userID,
      swapMode: "ExactIn",
      dynamicSlippage: basePayload.dynamicSlippage,
      inputMint: basePayload.inputMint,
      outputMint: basePayload.outputMint,
      amount: String(basePayload.amount),
      slippageBps: basePayload.slippageBps,
      quote: quote.quote,
    });

    expect(res).toEqual({ quote });
  });

  it("throws NotFoundError when referral slug does not exist", async () => {
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    basePayload.referralSlug = "missing-one";

    await expect(
      getAndStoreQuote(basePayload)
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(quoteGetMock).not.toHaveBeenCalled();
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("forwards dynamicSlippage=false and different slippageBps", async () => {
    basePayload.referralSlug = undefined;
    basePayload.slippageBps = faker.datatype.number({ min: 1, max: 500 });
    basePayload.dynamicSlippage = faker.datatype.boolean();

    await getAndStoreQuote(basePayload);

    expect(quoteGetMock).toHaveBeenCalledWith({
      inputMint: basePayload.inputMint,
      outputMint: basePayload.outputMint,
      amount: basePayload.amount,
      slippageBps: basePayload.slippageBps,
      platformFeeBps: DEFAULT_TOTAL_FEE_BPS,
      swapMode: "ExactIn",
      dynamicSlippage: basePayload.dynamicSlippage,
    });
  });

  it("bubbles Jupiter quoteGet errors", async () => {
    basePayload.referralSlug = undefined;
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    quoteGetMock.mockClear();
    quoteGetMock.mockRejectedValue(new Error("JUP_DOWN"));

    await expect(getAndStoreQuote(basePayload)).rejects.toThrow("JUP_DOWN");

    expect(createQuote).not.toHaveBeenCalled();
  });

  it("bubbles createQuote errors", async () => {
    basePayload.referralSlug = undefined;
    (createQuote as jest.Mock).mockClear();
    (createQuote as jest.Mock).mockRejectedValue(new Error("DB_FAIL"));

    await expect(getAndStoreQuote({ ...basePayload })).rejects.toThrow("DB_FAIL");
  });

  it("coerces amount to string when storing", async () => {
    basePayload.referralSlug = undefined;
    const amount = faker.datatype.number({ min: 1_000, max: 1_000_000 });
    await getAndStoreQuote({ ...basePayload, amount });

    const args = (createQuote as jest.Mock).mock.calls[0][0];
    expect(typeof args.amount).toBe("string");
    expect(args.amount).toBe(String(amount));
  });

  it("always forces swapMode='ExactIn' regardless of caller input (defense-in-depth)", async () => {
    basePayload.referralSlug = undefined;

    // Even if someone tries to smuggle a different mode into payload (not in type),
    // we assert we *still* pass ExactIn to Jupiter & createQuote.
    // @ts-expect-error – intentional: simulate rogue caller
    await getAndStoreQuote({ ...basePayload, swapMode: "ExactOut" });

    const jupArgs = quoteGetMock.mock.calls[0][0];
    expect(jupArgs.swapMode).toBe("ExactIn");

    const storeArgs = (createQuote as jest.Mock).mock.calls[0][0];
    expect(storeArgs.swapMode).toBe("ExactIn");
  });
});
