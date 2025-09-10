import { faker } from "@faker-js/faker";
import type { CreateReferralPayload } from "../../src/lib/db/referrals/create-referral";
import { ReferralDB } from "../../src/lib/db/referrals";
import { makeReferral } from "../factories/referrals";

describe("createReferral", () => {
  let payload: CreateReferralPayload;
  let createMock: jest.Mock;
  let getNewReferralDocMock: jest.Mock;
  let referral: ReferralDB;
  let Errors: typeof import("../../src/lib/backend-framework/errors");

  // function under test will be imported after mocks are set
  let createReferral: (typeof import("../../src/lib/db/referrals/create-referral"))["createReferral"];

  beforeEach(async () => {
    jest.resetModules();

    // Fresh payload per test
    const platformFeeBps = faker.datatype.number({ min: 0, max: 10_000 });
    const referrerFeeBps = faker.datatype.number({ min: 0, max: 10_000 - platformFeeBps });
    payload = {
      userID: faker.datatype.uuid() as any,
      slug: faker.helpers.slugify(faker.lorem.word()),
      description: faker.datatype.boolean()
        ? faker.lorem.sentence()
        : undefined,
      isActive: faker.datatype.boolean(),
      platformFeeBps,
      referrerFeeBps,
    };

    referral = makeReferral({
      userID: payload.userID,
      slug: payload.slug,
      platformFeeBps: payload.platformFeeBps,
      referrerFeeBps: payload.referrerFeeBps,
      isActive: payload.isActive,
      description: payload.description ?? null,
      deletedAt: null,
    });

    // Mocks
    createMock = jest.fn().mockResolvedValue(referral);
    getNewReferralDocMock = jest.fn().mockReturnValue({
      id: referral.id,
      create: createMock,
    });

    // Mock only getNewReferralDoc; keep real assertIntBps (so we test it)
    jest.doMock("../../src/lib/db/generic", () => {
      const actual = jest.requireActual("../../src/lib/db/generic");
      return {
        ...actual,
        getNewReferralDoc: (...args: any[]) => getNewReferralDocMock(...args),
      };
    });

    // Load module under test AFTER mocks, using CommonJS require
    jest.isolateModules(() => {
      Errors = require("../../src/lib/backend-framework/errors");
      ({
        createReferral,
      } = require("../../src/lib/db/referrals/create-referral"));
    });
  });

  it("creates a referral and writes to Firestore (happy path)", async () => {
    // make sure payload values are sane for this test
    payload.description = undefined; // to verify null normalization

    const res = await createReferral(payload);

    // getNewReferralDoc called with userID
    expect(getNewReferralDocMock).toHaveBeenCalledTimes(1);
    expect(getNewReferralDocMock).toHaveBeenCalledWith(payload.userID);

    // Firestore create called with expected shape
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: referral.id,
        userID: payload.userID,
        slug: payload.slug,
        platformFeeBps: payload.platformFeeBps,
        referrerFeeBps: payload.referrerFeeBps,
        isActive: payload.isActive,
        description: null, // undefined -> null
        deletedAt: null,
      })
    );

    // Return value
    expect(res.id).toBe(referral.id);
    expect(res.userID).toBe(payload.userID);
    expect(res.slug).toBe(payload.slug);
    expect(res.platformFeeBps).toBe(payload.platformFeeBps);
    expect(res.referrerFeeBps).toBe(payload.referrerFeeBps);
    expect(res.isActive).toBe(payload.isActive);
    expect(res.description).toBeNull();
    expect(res.deletedAt).toBeNull();
  });

  it("allows zero", async () => {
    await expect(
      createReferral({ ...payload, platformFeeBps: 0, referrerFeeBps: 0 })
    ).resolves.toBeTruthy();

    await expect(
      createReferral({
        ...payload,
        referrerFeeBps: 0,
      })
    ).resolves.toBeTruthy();
  });

  it("throws error if platform fee is zero but referrer fee is non-zero", async () => {
    await expect(
      createReferral({ ...payload, platformFeeBps: 0, referrerFeeBps: faker.datatype.number({ min: 1, max: 10_000 }) })
    ).rejects.toBeInstanceOf(Errors.ValidationError);
  });

  it("rejects non-integer fee bps via real assertIntBps", async () => {
    await expect(
      createReferral({ ...payload, platformFeeBps: faker.datatype.float() })
    ).rejects.toBeInstanceOf(Errors.ValidationError);

    await expect(
      createReferral({
        ...payload,
        referrerFeeBps: faker.datatype.float(),
      })
    ).rejects.toBeInstanceOf(Errors.ValidationError);
  });

  it("rejects out-of-range bps values", async () => {
    await expect(
      createReferral({ ...payload, referrerFeeBps: 0, platformFeeBps: 10000 + faker.datatype.number() })
    ).rejects.toBeInstanceOf(Errors.ValidationError);

    await expect(
      createReferral({ ...payload, platformFeeBps: 0, referrerFeeBps: 1000 + faker.datatype.number() })
    ).rejects.toBeInstanceOf(Errors.ValidationError);

    const highFee = faker.datatype.number({ min: 1, max: 10_000 });
    const tooHighReferrerFee = 10_000 - highFee + 1;
    await expect(
      createReferral({ ...payload, platformFeeBps: highFee, referrerFeeBps: tooHighReferrerFee })
    ).rejects.toBeInstanceOf(Errors.ValidationError);

    await expect(
      createReferral({ ...payload, platformFeeBps: -1 })
    ).rejects.toBeInstanceOf(Errors.ValidationError);

    await expect(
      createReferral({ ...payload, referrerFeeBps: -1 })
    ).rejects.toBeInstanceOf(Errors.ValidationError);
  });

  it("passes through provided description and slug unchanged", async () => {
    const withDesc = {
      ...payload,
      description: faker.lorem.words(),
      slug: faker.helpers.slugify(faker.lorem.words()),
    };
    const res = await createReferral(withDesc);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: withDesc.description,
        slug: withDesc.slug,
      })
    );
    expect(res.description).toBe(withDesc.description);
    expect(res.slug).toBe(withDesc.slug);
  });
});
