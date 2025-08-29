import {
  createReferral,
  CreateReferralServiceRequest,
} from "../../src/services/referrals/create-referral";
import { AlreadyExistsError, NotFoundError } from "../../src/lib/backend-framework";
import {
  DEFAULT_REFERRER_SHARE_BPS_OF_FEE,
  DEFAULT_TOTAL_FEE_BPS,
} from "../../src/lib/config/constants";
import type { UserDB } from "../../src/lib/db/users/types";
import type { ReferralDB } from "../../src/lib/db/referrals/types";

// --- Mocks ---
jest.mock("../../src/lib/db/users", () => ({
  getUserByID: jest.fn(),
}));
jest.mock("../../src/lib/db/referrals", () => ({
  getReferralBySlug: jest.fn(),
  getReferralCountForUser: jest.fn(),
  createReferral: jest.fn(),
}));
jest.mock("../../src/lib/slugs", () => ({
  makeSlug: jest.fn(),
}));

import { getUserByID } from "../../src/lib/db/users";
import {
  getReferralBySlug,
  getReferralCountForUser,
  createReferral as createReferralInDB,
} from "../../src/lib/db/referrals";
import { makeSlug } from "../../src/lib/slugs";
import { makeUser } from "../factories/users";
import { makeReferral } from "../factories/referrals";
import { faker } from "@faker-js/faker";

describe("createReferral service", () => {
  let user: UserDB;
  let referral: ReferralDB;
  let referralPayload: CreateReferralServiceRequest;

  beforeEach(() => {
    jest.resetAllMocks();
    user = makeUser();
    referral = makeReferral({
      userID: user.id,
    });
    referralPayload = {
      userID: user.id,
      slug: faker.datatype.boolean()
        ? faker.helpers.slugify(faker.lorem.word())
        : undefined,
      description: faker.datatype.boolean()
        ? faker.lorem.sentence()
        : undefined,
      isActive: faker.datatype.boolean() ? faker.datatype.boolean() : undefined,
    };
  });

  it("creates a referral with a provided slug (happy path)", async () => {
    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    (createReferralInDB as jest.Mock).mockResolvedValue(referral);

    const result = await createReferral(referralPayload);

    expect(getUserByID).toHaveBeenCalledWith(user.id);
    expect(getReferralBySlug).toHaveBeenCalledWith(referralPayload.slug);
    expect(createReferralInDB).toHaveBeenCalledWith({
      userID: user.id,
      slug: referralPayload.slug,
      description: referralPayload.description,
      isActive: referralPayload.isActive ?? true, // defaults to true
      feeBps: DEFAULT_TOTAL_FEE_BPS,
      referrerShareBpsOfFee: DEFAULT_REFERRER_SHARE_BPS_OF_FEE,
    });
    expect(result.isActive).toBe(referral.isActive);
    expect(result.feeBps).toBe(referral.feeBps);
    expect(result.referrerShareBpsOfFee).toEqual(
      referral.referrerShareBpsOfFee
    );
  });

  it("throws NotFoundError when userID does not exist", async () => {
    (getUserByID as jest.Mock).mockResolvedValue(null);
    
    await expect(createReferral(referralPayload)).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(getUserByID).toHaveBeenCalledWith(user.id);
    expect(getReferralBySlug).not.toHaveBeenCalled();
    expect(createReferralInDB).not.toHaveBeenCalled();
  });

  it("throws AlreadyExistsError when slug already exists", async () => {
    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralBySlug as jest.Mock).mockResolvedValue(referral);

    await expect(createReferral(referralPayload)).rejects.toBeInstanceOf(
      AlreadyExistsError
    );

    expect(getUserByID).toHaveBeenCalledWith(user.id);
    expect(getReferralBySlug).toHaveBeenCalledWith(referralPayload.slug);
    expect(createReferralInDB).not.toHaveBeenCalled();
  });

  it("auto-generates slug from displayName when slug not provided", async () => {
    const expectedReferralSlug = faker.helpers.slugify(faker.lorem.word());
    referral.slug = expectedReferralSlug;
    referralPayload.slug = undefined;

    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralCountForUser as jest.Mock).mockResolvedValue(0);
    (makeSlug as jest.Mock).mockReturnValue(expectedReferralSlug);
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    (createReferralInDB as jest.Mock).mockResolvedValue(referral);
    delete referralPayload.slug;
    const result = await createReferral(referralPayload);

    expect(getReferralCountForUser).toHaveBeenCalledWith(user.id);
    expect(makeSlug).toHaveBeenCalledWith(user.displayName ?? user.id);
    expect(getReferralBySlug).toHaveBeenCalledWith(expectedReferralSlug);
    expect(createReferralInDB).toHaveBeenCalledWith(
      expect.objectContaining({ slug: expectedReferralSlug })
    );
    expect(result.slug).toBe(expectedReferralSlug);
  });

  it("uses user.id when no displayName is set", async () => {
    user.displayName = null;
    const expectedReferralSlug = faker.helpers.slugify(faker.lorem.word());
    referral.slug = expectedReferralSlug;
    referralPayload.slug = undefined;

    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralCountForUser as jest.Mock).mockResolvedValue(0);
    (makeSlug as jest.Mock).mockReturnValue(expectedReferralSlug);
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    (createReferralInDB as jest.Mock).mockResolvedValue(referral);

    const result = await createReferral(referralPayload);

    expect(makeSlug).toHaveBeenCalledWith(user.id);
    expect(getReferralBySlug).toHaveBeenCalledWith(expectedReferralSlug);
    expect(result.slug).toBe(expectedReferralSlug);
  });

  it("appends -N when the user already has referrals", async () => {
    const nReferrals = faker.datatype.number({ min: 1, max: 10 });
    const displayName = faker.lorem.text();
    user.displayName = displayName;
    const expectedSlug = `${displayName}-${nReferrals + 1}`;
    referral.slug = expectedSlug;
    referralPayload.slug = undefined;
    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralCountForUser as jest.Mock).mockResolvedValue(nReferrals);
    (makeSlug as jest.Mock).mockReturnValue(displayName);
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    (createReferralInDB as jest.Mock).mockResolvedValue(referral);

    const result = await createReferral(referralPayload);

    expect(makeSlug).toHaveBeenCalledWith(displayName);
    expect(getReferralBySlug).toHaveBeenCalledWith(expectedSlug);
    expect(createReferralInDB).toHaveBeenCalledWith(
      expect.objectContaining({ slug: expectedSlug })
    );
    expect(result.slug).toBe(expectedSlug);
  });

  it("passes default fee values to DB", async () => {
    (getUserByID as jest.Mock).mockResolvedValue(user);
    (getReferralBySlug as jest.Mock).mockResolvedValue(null);
    (createReferralInDB as jest.Mock).mockResolvedValue(referral);

    await createReferral(referralPayload);

    expect(createReferralInDB).toHaveBeenCalledWith(
      expect.objectContaining({
        feeBps: DEFAULT_TOTAL_FEE_BPS,
        referrerShareBpsOfFee: DEFAULT_REFERRER_SHARE_BPS_OF_FEE,
      })
    );
  });
});
