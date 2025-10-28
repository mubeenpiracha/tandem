// Jest setup file for global test configuration
beforeAll(async () => {
  // Global test setup
});

afterAll(async () => {
  // Global test cleanup
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/tandem_test';
process.env.REDIS_URL = 'redis://localhost:6381';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-long-enough-for-validation-requirements';
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-that-is-long-enough-for-validation-requirements';
process.env.OPENAI_API_KEY = 'test-openai-api-key';
process.env.SLACK_CLIENT_ID = 'test-client-id';
process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.CORS_ORIGIN = 'http://localhost:3001';