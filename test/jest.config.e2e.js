const baseConfig = require('../package.json').jest;

module.exports = {
  ...baseConfig,
  rootDir: '../',
  testRegex: 'test/.*\\.e2e\\.spec\\.ts$',
  testPathIgnorePatterns: ['node_modules'],
  maxWorkers: 1, // Run tests serially to avoid database state conflicts
};
