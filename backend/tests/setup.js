"use strict";
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
process.env.JWT_SECRET = 'test-secret';
process.env.OPENAI_API_KEY = 'test-key';
process.env.SLACK_CLIENT_ID = 'test-client-id';
process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
//# sourceMappingURL=setup.js.map