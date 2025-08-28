import { faker } from "@faker-js/faker";
import { UserDB } from "../../src/lib/db/users/types";
import { Timestamp } from "firebase-admin/firestore";

export const makeUser = (overrides?: Partial<UserDB>): UserDB => {
  const username = faker.internet.userName();
  const user: UserDB = {
    id: faker.datatype.uuid(),
    slug: faker.helpers.slugify(username).toLowerCase(),
    displayName: faker.datatype.boolean() ? username : null,
    avatarUrl: faker.image.avatar(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    walletAddress: faker.finance.ethereumAddress(),
    privateKeyPath: `/keys/${faker.datatype.uuid()}.key`,
    deletedAt: null,
  };
  return { ...user, ...overrides };
};
