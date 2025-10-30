/**
 * Protected Route Component
 * 
 * This component protects routes that require authentication and workspace context.
 */

import React, { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useWorkspace } from './WorkspaceContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireWorkspace?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requireWorkspace = true 
}: ProtectedRouteProps) {
  const { state: authState } = useAuth();
  const { state: workspaceState } = useWorkspace();
  const location = useLocation();

  // Show loading spinner while checking auth
  if (authState.isLoading || (requireWorkspace && workspaceState.isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        <div className="ml-4">
          <p className="text-lg font-medium">Loading...</p>
          <p className="text-sm text-gray-600">
            {authState.isLoading ? 'Checking authentication' : 'Loading workspace'}
          </p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!authState.isAuthenticated) {
    return (
      <Navigate 
        to="/auth" 
        state={{ from: location }} 
        replace 
      />
    );
  }

  // Check workspace requirements
  if (requireWorkspace && !workspaceState.currentWorkspace) {
    // If workspace is required but not available, show workspace selection
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-center mb-4">
            Workspace Required
          </h2>
          <p className="text-gray-600 text-center mb-6">
            You need to be connected to a workspace to access this page.
          </p>
          
          {workspaceState.error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
              <p className="text-red-600 text-sm">{workspaceState.error}</p>
            </div>
          )}
          
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/auth'}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Connect to Workspace
            </button>
            
            <button
              onClick={() => window.location.href = '/'}
              className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-md hover:bg-gray-300 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Check for auth errors
  if (authState.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-center mb-4 text-red-600">
            Authentication Error
          </h2>
          <p className="text-gray-600 text-center mb-6">
            {authState.error}
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/auth'}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Re-authenticate
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render protected content
  return <>{children}</>;
}