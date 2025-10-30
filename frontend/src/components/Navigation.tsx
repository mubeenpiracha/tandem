/**
 * Navigation Component
 * 
 * Main navigation bar with workspace context and user management.
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './Auth/AuthContext';
import { useWorkspace } from './Auth/WorkspaceContext';
import { CompactWorkspaceSwitcher } from './WorkspaceSwitcher';
import { useRealTime } from '../hooks/useRealTimeUpdates';

interface NavigationProps {
  className?: string;
}

export default function Navigation({ className = '' }: NavigationProps) {
  const { state: authState, logout } = useAuth();
  const { state: workspaceState } = useWorkspace();
  const { isConnected, connectionType } = useRealTime();
  const location = useLocation();
  const navigate = useNavigate();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  /**
   * Check if a route is active
   */
  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  /**
   * Handle logout
   */
  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  /**
   * Get connection status indicator
   */
  const getConnectionIndicator = () => {
    if (!isConnected) {
      return { color: 'bg-red-500', text: 'Disconnected' };
    }
    
    switch (connectionType) {
      case 'websocket':
        return { color: 'bg-green-500', text: 'Live updates' };
      case 'polling':
        return { color: 'bg-yellow-500', text: 'Periodic updates' };
      default:
        return { color: 'bg-gray-500', text: 'No updates' };
    }
  };

  const connectionStatus = getConnectionIndicator();

  if (!authState.isAuthenticated) {
    return null;
  }

  return (
    <nav className={`bg-white shadow-sm border-b border-gray-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and workspace switcher */}
          <div className="flex items-center space-x-6">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">T</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Tandem</h1>
            </Link>

            {/* Workspace switcher */}
            <CompactWorkspaceSwitcher />
          </div>

          {/* Navigation links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              to="/dashboard"
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                isActiveRoute('/dashboard')
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dashboard
            </Link>

            <Link
              to="/preferences"
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                isActiveRoute('/preferences')
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Preferences
            </Link>

            {workspaceState.currentWorkspace && (
              <Link
                to={`/workspace/${workspaceState.currentWorkspace.id}/settings`}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  isActiveRoute('/workspace')
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Workspace
              </Link>
            )}
          </div>

          {/* Status and user menu */}
          <div className="flex items-center space-x-4">
            {/* Connection status */}
            <div className="hidden sm:flex items-center space-x-2" title={connectionStatus.text}>
              <div className={`w-2 h-2 rounded-full ${connectionStatus.color}`} />
              <span className="text-xs text-gray-600">{connectionStatus.text}</span>
            </div>

            {/* Service status indicators */}
            <div className="hidden lg:flex items-center space-x-3">
              {authState.authStatus && (
                <>
                  <div className="flex items-center space-x-1" title="Slack connection">
                    <div className={`w-2 h-2 rounded-full ${
                      authState.authStatus.slack.connected && authState.authStatus.slack.isValid
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-gray-600">Slack</span>
                  </div>
                  
                  <div className="flex items-center space-x-1" title="Google Calendar connection">
                    <div className={`w-2 h-2 rounded-full ${
                      authState.authStatus.google.connected && 
                      authState.authStatus.google.isValid && 
                      !authState.authStatus.google.isExpired
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-gray-600">Google</span>
                  </div>
                </>
              )}
            </div>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center space-x-2 text-gray-700 hover:text-gray-900 transition-colors"
              >
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-600 font-medium text-sm">
                    {authState.user?.email?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="hidden sm:block text-sm font-medium">
                  {authState.user?.email}
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-gray-200">
                  <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-100">
                    <div className="font-medium">{authState.user?.email}</div>
                    {workspaceState.currentWorkspace && (
                      <div className="text-xs text-gray-500 mt-1">
                        {workspaceState.currentWorkspace.slackTeamName}
                      </div>
                    )}
                  </div>

                  <Link
                    to="/preferences"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    Preferences
                  </Link>

                  {workspaceState.currentWorkspace && (
                    <Link
                      to={`/workspace/${workspaceState.currentWorkspace.id}/settings`}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Workspace Settings
                    </Link>
                  )}

                  <Link
                    to="/auth"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    Account Settings
                  </Link>

                  <div className="border-t border-gray-100 mt-1">
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        handleLogout();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="md:hidden border-t border-gray-200">
        <div className="px-4 py-2 space-y-1">
          <Link
            to="/dashboard"
            className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActiveRoute('/dashboard')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Dashboard
          </Link>

          <Link
            to="/preferences"
            className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActiveRoute('/preferences')
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            Preferences
          </Link>

          {workspaceState.currentWorkspace && (
            <Link
              to={`/workspace/${workspaceState.currentWorkspace.id}/settings`}
              className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                isActiveRoute('/workspace')
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Workspace Settings
            </Link>
          )}
        </div>
      </div>

      {/* Close user menu when clicking outside */}
      {isUserMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsUserMenuOpen(false)}
        />
      )}
    </nav>
  );
}