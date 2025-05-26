module.exports = {
  // Global test timeout
  testTimeout: 15000,
  
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  
  // The environment that will be used for testing
  testEnvironment: 'node',
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // A list of paths to modules that run some code to configure or set up the testing environment
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  
  // Mock all external service calls
  moduleNameMapper: {
    '@aws-sdk/client-s3': '<rootDir>/src/tests/__mocks__/aws-sdk-mock.js',
    'amqplib': '<rootDir>/src/tests/__mocks__/amqplib-mock.js'
  },
  
  // Ignore node_modules and coverage directory
  testPathIgnorePatterns: ['/node_modules/', '/coverage/'],
  
  // Collect coverage from these directories
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/tests/**',
    '!**/node_modules/**',
    '!src/config/**'
  ],
  
  // Set coverage thresholds
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30
    }
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'lcov',
    'json'
  ],
  
  // Test reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: false,
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ]
}; 