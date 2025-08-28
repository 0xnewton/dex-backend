import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
      diagnostics: { warnOnly: true },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // ESM path fix
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  globalSetup: "./tests/setup/setup-db.ts",
  globalTeardown: "./tests/setup/teardown.ts",
  setupFilesAfterEnv: ['./tests/setup/jest-setup.ts'],
};

export default config;
