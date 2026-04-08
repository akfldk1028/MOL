const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  projects: [
    {
      displayName: 'frontend',
      testEnvironment: 'jest-environment-jsdom',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/src/backend/services/game/', '<rootDir>/tests/engine/'],
      collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/backend/services/game/**'],
    },
    {
      displayName: 'backend-game',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/backend/services/game/__tests__/**/*.test.js'],
    },
    {
      displayName: 'backend-engine',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/engine/**/*.test.js'],
    },
  ],
};

module.exports = createJestConfig(customJestConfig);
