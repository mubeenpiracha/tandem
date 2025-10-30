/**
 * Authentication Page
 * 
 * Handles user authentication flows for Slack and Google OAuth.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/Auth/AuthContext';
import { apiClient } from '../services/api';

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state: authState, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get redirect URL from state
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  /**
   * Handle OAuth callback
   */
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const error = searchParams.get('error');

      if (error) {
        setError(`OAuth error: ${error}`);
        return;
      }

      if (code && state) {
        setLoading(true);
        try {
          // This would typically involve exchanging the code for a token
          // For now, we'll simulate a successful OAuth flow
          
          // In a real implementation, you'd:
          // 1. Send the code to your backend
          // 2. Backend exchanges code for tokens
          // 3. Backend returns a JWT or session token
          // 4. Frontend stores the token and redirects
          
          // Simulate token (in real app, get from backend)
          const mockToken = 'mock-jwt-token-' + Date.now();
          await login(mockToken);
          
          navigate(from, { replace: true });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Authentication failed');
        } finally {
          setLoading(false);
        }
      }
    };

    handleOAuthCallback();
  }, [searchParams, login, navigate, from]);

  /**
   * Initiate Slack OAuth
   */
  const handleSlackAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.initiateSlackAuth();
      window.location.href = response.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Slack authentication');
      setLoading(false);
    }
  };

  /**
   * Initiate Google OAuth
   */
  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.initiateGoogleAuth();
      window.location.href = response.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate Google authentication');
      setLoading(false);
    }
  };

  // If already authenticated, redirect
  if (authState.isAuthenticated) {
    navigate(from, { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tandem</h1>
          <p className="text-lg text-gray-600">AI-powered task detection and scheduling</p>
        </div>
        
        <h2 className="mt-8 text-center text-2xl font-semibold text-gray-900">
          Connect your accounts
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Connect Slack and Google Calendar to get started
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Error message */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center">
                <div className="text-red-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="mt-2 text-red-600 hover:text-red-800 text-xs underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="mb-6 text-center">
              <div className="inline-flex items-center space-x-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                <span className="text-sm text-gray-600">Processing...</span>
              </div>
            </div>
          )}

          <div className="space-y-6">
            {/* Workspace setup info */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-start">
                <div className="text-blue-600 mt-0.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Setup Required</h3>
                  <div className="text-sm text-blue-700 mt-1 space-y-1">
                    <p>1. First, your workspace admin needs to install the Tandem Slack app</p>
                    <p>2. Then connect your Slack and Google accounts below</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Slack connection */}
            <div>
              <button
                onClick={handleSlackAuth}
                disabled={loading}
                className="w-full flex justify-center items-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52-2.523A2.528 2.528 0 0 1 5.042 10.1a2.528 2.528 0 0 1 2.52 2.542 2.528 2.528 0 0 1-2.52 2.523zm6.426 4.282a2.528 2.528 0 0 1-2.52-2.523 2.528 2.528 0 0 1 2.52-2.523 2.528 2.528 0 0 1 2.52 2.523 2.528 2.528 0 0 1-2.52 2.523zm6.425-4.282a2.528 2.528 0 0 1-2.52-2.523 2.528 2.528 0 0 1 2.52-2.542 2.528 2.528 0 0 1 2.52 2.542 2.528 2.528 0 0 1-2.52 2.523zm-6.425-4.282a2.528 2.528 0 0 1-2.52-2.523 2.528 2.528 0 0 1 2.52-2.523 2.528 2.528 0 0 1 2.52 2.523 2.528 2.528 0 0 1-2.52 2.523z"/>
                </svg>
                Connect with Slack
              </button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Connect your Slack account to receive task notifications
              </p>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">and</span>
              </div>
            </div>

            {/* Google connection */}
            <div>
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full flex justify-center items-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect with Google Calendar
              </button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Connect Google Calendar to schedule tasks automatically
              </p>
            </div>

            {/* Help text */}
            <div className="bg-gray-50 rounded-md p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">How it works:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Tandem monitors your Slack conversations for actionable tasks</li>
                <li>• AI detects tasks and sends you confirmation messages</li>
                <li>• Confirmed tasks are automatically scheduled in your calendar</li>
                <li>• All data is scoped to your workspace for privacy</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xs text-gray-500">
          By connecting your accounts, you agree to our terms of service and privacy policy.
        </p>
      </div>
    </div>
  );
}