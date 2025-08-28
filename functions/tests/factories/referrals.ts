import { faker } from "@faker-js/faker";
import { ReferralDB } from "../../src/lib/db/referrals/types";
import { Timestamp } from "firebase-admin/firestore";

export const makeReferral = (
  overrides?: Partial<ReferralDB>
): ReferralDB => {
  const referral: ReferralDB = {
    id: faker.datatype.uuid(),
    userID: faker.datatype.uuid(),
    slug: faker.helpers.slugify(faker.lorem.word()),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    feeBps: faker.datatype.number({ min: 0, max: 10000 }),
    referrerShareBpsOfFee: faker.datatype.number({ min: 0, max: 10000 }),
    isActive: faker.datatype.boolean(),
    description: faker.lorem.sentence(),
    deletedAt: null,
  };

  return {
    ...referral,
    ...overrides,
  };
};
