import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__", "<rootDir>/mcp-server/src/__tests__"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  testPathPattern: "\\.(test|spec)\\.ts$",
  collectCoverageFrom: [
    "mcp-server/src/**/*.ts",
    "lib/**/*.ts",
    "!**/*.d.ts",
  ],
};

export default config;
