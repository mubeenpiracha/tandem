/**
 * Home Page Component
 * 
 * This component handles the root route and redirects users based on their
 * authentication status.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './Auth/AuthContext';

export default function HomePage() {
  const { state: authState } = useAuth();

  // Show loading spinner while checking auth
  if (authState.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        <div className="ml-4">
          <p className="text-lg font-medium">Loading...</p>
          <p className="text-sm text-gray-600">Checking authentication status</p>
        </div>
      </div>
    );
  }

  // If authenticated, redirect to dashboard
  if (authState.isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // If not authenticated, redirect to auth page
  return <Navigate to="/auth" replace />;
}