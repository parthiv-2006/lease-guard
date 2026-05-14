import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.spec.ts"],
  collectCoverageFrom: [
    "mcp-server/src/**/*.ts",
    "lib/**/*.ts",
    "!**/*.d.ts",
  ],
};

export default config;
