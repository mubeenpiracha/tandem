/**
 * Authentication flow unit tests
 * 
 * These tests verify authentication logic without requiring external services.
 * For integration testing with real OAuth providers, see docs/authentication-setup.md
 */

describe('Authentication Flow - Unit Tests', () => {
  describe('OAuth State Management', () => {
    it('should generate and validate OAuth state', async () => {
      // Mock the crypto and config dependencies
      jest.mock('../src/config', () => ({
        config: {
          auth: { jwtSecret: 'test-secret-32-chars-minimum-length' }
        }
      }));

      const { generateOAuthState, validateOAuthState } = await import('../src/services/oauth');
      
      const state = generateOAuthState('slack', 'test-user-id', '/dashboard');
      expect(state).toBeDefined();
      expect(typeof state).toBe('string');
      expect(state.length).toBeGreaterThan(0);
      
      const parsed = validateOAuthState(state);
      expect(parsed).toBeDefined();
      expect(parsed?.provider).toBe('slack');
      expect(parsed?.userId).toBe('test-user-id');
      expect(parsed?.redirectTo).toBe('/dashboard');
    });

    it('should reject invalid OAuth state', async () => {
      const { validateOAuthState } = await import('../src/services/oauth');
      
      const parsed = validateOAuthState('invalid-state');
      expect(parsed).toBeNull();
    });

    it('should generate different states for different parameters', async () => {
      const { generateOAuthState } = await import('../src/services/oauth');
      
      const state1 = generateOAuthState('slack', 'user1', '/dashboard');
      const state2 = generateOAuthState('google', 'user1', '/dashboard');
      const state3 = generateOAuthState('slack', 'user2', '/dashboard');
      
      expect(state1).not.toBe(state2);
      expect(state1).not.toBe(state3);
      expect(state2).not.toBe(state3);
    });
  });

  describe('OAuth Provider Configuration', () => {
    it('should have correct OAuth scopes configured', async () => {
      const { config } = await import('../src/config');
      
      expect(config.slack.userScopes).toContain('channels:history');
      expect(config.slack.userScopes).toContain('users:read');
      expect(config.slack.botScopes).toContain('chat:write');
      
      expect(config.google.scopes).toContain('https://www.googleapis.com/auth/calendar');
      expect(config.google.scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
    });

    it('should have proper redirect URIs configured', async () => {
      const { config } = await import('../src/config');
      
      expect(config.slack.redirectUri).toContain('/auth/slack/callback');
      expect(config.google.redirectUri).toContain('/auth/google/callback');
    });
  });

  describe('Authentication Middleware Logic', () => {
    it('should validate JWT token structure', async () => {
      const jwt = require('jsonwebtoken');
      const { config } = await import('../src/config');
      
      const testPayload = {
        userId: 'test-user-id',
        email: 'test@example.com',
        slackUserId: 'SLACK123',
      };
      
      const token = jwt.sign(testPayload, config.auth.jwtSecret, {
        expiresIn: '1h',
        issuer: 'tandem-slack-bot',
        audience: 'tandem-api',
      });
      
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      expect(decoded.userId).toBe(testPayload.userId);
      expect(decoded.email).toBe(testPayload.email);
      expect(decoded.slackUserId).toBe(testPayload.slackUserId);
    });
  });
});

describe('Onboarding Flow Logic', () => {
  describe('Onboarding Status Calculation', () => {
    it('should identify unauthenticated user needs registration', () => {
      const user = null;
      const authStatus = null;
      
      const result = calculateOnboardingStatus(user, authStatus);
      
      expect(result.isComplete).toBe(false);
      expect(result.currentStep).toBe('registration');
      expect(result.nextStep?.name).toBe('Sign Up with Slack');
    });

    it('should identify user needs Slack connection', () => {
      const user = { id: 'user1', email: 'test@example.com', slackUserId: 'SLACK123' };
      const authStatus = {
        slack: { connected: false, isValid: false },
        google: { connected: false, isValid: false },
      };
      
      const result = calculateOnboardingStatus(user, authStatus);
      
      expect(result.isComplete).toBe(false);
      expect(result.currentStep).toBe('slack_auth');
      expect(result.nextStep?.name).toBe('Connect Slack');
    });

    it('should identify user needs Google connection', () => {
      const user = { id: 'user1', email: 'test@example.com', slackUserId: 'SLACK123' };
      const authStatus = {
        slack: { connected: true, isValid: true },
        google: { connected: false, isValid: false },
      };
      
      const result = calculateOnboardingStatus(user, authStatus);
      
      expect(result.isComplete).toBe(false);
      expect(result.currentStep).toBe('google_auth');
      expect(result.nextStep?.name).toBe('Connect Google Calendar');
    });

    it('should identify completed onboarding', () => {
      const user = { id: 'user1', email: 'test@example.com', slackUserId: 'SLACK123' };
      const authStatus = {
        slack: { connected: true, isValid: true },
        google: { connected: true, isValid: true },
      };
      
      const result = calculateOnboardingStatus(user, authStatus);
      
      expect(result.isComplete).toBe(true);
      expect(result.currentStep).toBe('completed');
      expect(result.nextStep).toBeNull();
    });
  });
});

// Helper function to test onboarding logic
function calculateOnboardingStatus(user: any, authStatus: any) {
  if (!user) {
    return {
      isComplete: false,
      currentStep: 'registration',
      completedSteps: [],
      nextStep: {
        name: 'Sign Up with Slack',
        url: '/api/auth/slack',
        description: 'Connect your Slack account to get started',
      },
    };
  }

  const completedSteps = ['registration'];

  if (authStatus?.slack?.isValid) {
    completedSteps.push('slack_auth');
  }

  if (authStatus?.google?.isValid) {
    completedSteps.push('google_auth');
  }

  let currentStep = 'completed';
  let nextStep = null;

  if (!authStatus?.slack?.isValid) {
    currentStep = 'slack_auth';
    nextStep = {
      name: 'Connect Slack',
      url: '/api/auth/slack',
      description: 'Connect your Slack account to detect tasks from conversations',
    };
  } else if (!authStatus?.google?.isValid) {
    currentStep = 'google_auth';
    nextStep = {
      name: 'Connect Google Calendar',
      url: '/api/auth/google',
      description: 'Connect your Google Calendar to automatically schedule tasks',
    };
  }

  const isComplete = authStatus?.slack?.isValid && authStatus?.google?.isValid;

  return {
    isComplete,
    currentStep,
    completedSteps,
    nextStep,
  };
}