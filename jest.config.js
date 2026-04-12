/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/http/create-app.js'],
  coverageDirectory: 'coverage',
  verbose: true,
};
