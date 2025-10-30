/**
 * Workspace Settings Page
 * 
 * Settings and management for workspace-level configuration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../components/Auth/WorkspaceContext';
import { useAuth } from '../components/Auth/AuthContext';
import { apiClient, WorkspaceResponse } from '../services/api';

export default function WorkspaceSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { refreshWorkspace } = useWorkspace();
  const { state: authState, refreshAuthStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError(null);

    try {
      const workspaceData = await apiClient.getWorkspace(workspaceId);
      setWorkspace(workspaceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workspace settings');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  /**
   * Load workspace details
   */
  useEffect(() => {
    if (workspaceId) {
      loadWorkspace();
    }
  }, [workspaceId, loadWorkspace]);

  /**
   * Handle connection tests
   */
  const handleTestConnections = async () => {
    setSaving(true);
    setError(null);

    try {
      const results = await apiClient.testConnections();
      
      // Show results
      const slackStatus = results.slack ? '✅ Connected' : '❌ Failed';
      const googleStatus = results.google ? '✅ Connected' : '❌ Failed';
      
      alert(`Connection Test Results:\nSlack: ${slackStatus}\nGoogle: ${googleStatus}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Handle token refresh
   */
  const handleRefreshTokens = async (provider: 'slack' | 'google') => {
    setSaving(true);
    setError(null);

    try {
      await apiClient.refreshTokens(provider);
      await refreshAuthStatus();
      alert(`${provider} tokens refreshed successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to refresh ${provider} tokens`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-gray-600">Loading workspace settings...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 rounded-md p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Error</h2>
            <p className="text-red-700">{error}</p>
            <div className="mt-4 space-x-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
              >
                Back to Dashboard
              </button>
              <button
                onClick={loadWorkspace}
                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900">Workspace Settings</h1>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

        <div className="space-y-8">
          {/* Workspace Information */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Workspace Information</h2>
              <p className="text-sm text-gray-600 mt-1">
                Basic information about this workspace.
              </p>
            </div>
            
            <div className="p-6">
              {workspace && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Workspace Name
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md text-sm text-gray-900">
                      {workspace.slackTeamName}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Slack Team ID
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md text-sm text-gray-900 font-mono">
                      {workspace.slackTeamId}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      workspace.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {workspace.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Installed At
                    </label>
                    <div className="bg-gray-50 px-3 py-2 rounded-md text-sm text-gray-900">
                      {new Date(workspace.installedAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Connection Status */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Connection Status</h2>
              <p className="text-sm text-gray-600 mt-1">
                Status of your integrations with external services.
              </p>
            </div>
            
            <div className="p-6">
              {authState.authStatus && (
                <div className="space-y-6">
                  {/* Slack Status */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        authState.authStatus.slack.connected && authState.authStatus.slack.isValid
                          ? 'bg-green-500' 
                          : 'bg-red-500'
                      }`} />
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Slack Integration</h3>
                        <p className="text-xs text-gray-600">
                          {authState.authStatus.slack.connected 
                            ? authState.authStatus.slack.isValid 
                              ? 'Connected and valid'
                              : 'Connected but invalid'
                            : 'Not connected'
                          }
                        </p>
                        {authState.authStatus.slack.lastUpdated && (
                          <p className="text-xs text-gray-500">
                            Last updated: {new Date(authState.authStatus.slack.lastUpdated).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRefreshTokens('slack')}
                        disabled={saving}
                        className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>

                  {/* Google Status */}
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        authState.authStatus.google.connected && 
                        authState.authStatus.google.isValid && 
                        !authState.authStatus.google.isExpired
                          ? 'bg-green-500' 
                          : 'bg-red-500'
                      }`} />
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Google Calendar Integration</h3>
                        <p className="text-xs text-gray-600">
                          {authState.authStatus.google.connected 
                            ? authState.authStatus.google.isExpired
                              ? 'Connected but expired'
                              : authState.authStatus.google.isValid
                                ? 'Connected and valid'
                                : 'Connected but invalid'
                            : 'Not connected'
                          }
                        </p>
                        {authState.authStatus.google.expiresIn && (
                          <p className="text-xs text-gray-500">
                            Expires in: {Math.floor(authState.authStatus.google.expiresIn / 3600)} hours
                          </p>
                        )}
                        {authState.authStatus.google.lastUpdated && (
                          <p className="text-xs text-gray-500">
                            Last updated: {new Date(authState.authStatus.google.lastUpdated).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleRefreshTokens('google')}
                        disabled={saving}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Test Connections */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={handleTestConnections}
                  disabled={saving}
                  className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Testing...' : 'Test All Connections'}
                </button>
                <p className="text-xs text-gray-600 mt-2">
                  This will test connectivity to Slack and Google Calendar APIs.
                </p>
              </div>
            </div>
          </div>

          {/* Workspace Actions */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Workspace Actions</h2>
              <p className="text-sm text-gray-600 mt-1">
                Administrative actions for this workspace.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">Refresh Workspace Data</h3>
                  <p className="text-xs text-gray-600">
                    Reload workspace information and user data from Slack.
                  </p>
                </div>
                <button
                  onClick={refreshWorkspace}
                  disabled={saving}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Refresh
                </button>
              </div>

              <div className="flex items-center justify-between p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">Reconnect Services</h3>
                  <p className="text-xs text-yellow-700">
                    If you're experiencing issues, try reconnecting your accounts.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/auth')}
                  className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
                >
                  Reconnect
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500">
            <p>
              Need help? Contact your workspace administrator or check the documentation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}