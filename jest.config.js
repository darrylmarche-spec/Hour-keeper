// Unit tests for plain TypeScript logic (sync engine, calculations).
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: { rootDir: '.', strict: true, esModuleInterop: true, isolatedModules: true } }] },
};
