/**
 * Preferences Management Page
 * 
 * Page for managing user work preferences with workspace context.
 */

import React from 'react';
import { useAuth } from '../components/Auth/AuthContext';
import { useWorkspace } from '../components/Auth/WorkspaceContext';
import WorkPreferencesForm from '../components/Preferences/WorkPreferencesForm';

export default function Preferences() {
  const { state: authState } = useAuth();
  const { state: workspaceState } = useWorkspace();

  // Show loading state while auth/workspace is loading
  if (authState.isLoading || workspaceState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading preferences...</p>
        </div>
      </div>
    );
  }

  // Show error if not authenticated
  if (!authState.isAuthenticated || !authState.user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-6">You must be logged in to manage preferences.</p>
          <a
            href="/auth"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  // Show error if workspace not found
  if (!workspaceState.currentWorkspace && !workspaceState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Workspace Required</h1>
          <p className="text-gray-600 mb-6">
            You must be part of a workspace to manage preferences.
          </p>
          <a
            href="/workspace/install"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Join Workspace
          </a>
        </div>
      </div>
    );
  }

  // Show workspace/auth errors
  if (authState.error || workspaceState.error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">
            {authState.error || workspaceState.error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Preferences</h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage your work hours and scheduling preferences
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{authState.user?.email}</p>
                <p className="text-xs text-gray-500">
                  {workspaceState.currentWorkspace?.slackTeamName}
                </p>
              </div>
              <a
                href="/dashboard"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Back to Dashboard
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-10">
        <div className="max-w-3xl mx-auto sm:px-6 lg:px-8">
          <WorkPreferencesForm />
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-500">
            <p>
              Your preferences help Tandem schedule tasks during your most productive hours.
            </p>
            <p className="mt-1">
              Changes will apply to future task scheduling.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}