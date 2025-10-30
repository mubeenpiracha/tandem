/**
 * Workspace Switcher Component
 * 
 * This component allows users to switch between available workspaces
 * and provides workspace context information.
 */

import React, { useState, useEffect } from 'react';
import { useWorkspace } from './Auth/WorkspaceContext';
import { useAuth } from './Auth/AuthContext';

interface WorkspaceSwitcherProps {
  className?: string;
  showFullName?: boolean;
}

export default function WorkspaceSwitcher({ 
  className = '', 
  showFullName = false 
}: WorkspaceSwitcherProps) {
  const { state: workspaceState, setCurrentWorkspace } = useWorkspace();
  const { state: authState } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const { currentWorkspace, availableWorkspaces, isLoading, error } = workspaceState;

  /**
   * Handle workspace selection
   */
  const handleWorkspaceSelect = async (workspaceId: string) => {
    if (workspaceId !== currentWorkspace?.id) {
      await setCurrentWorkspace(workspaceId);
    }
    setIsOpen(false);
  };

  /**
   * Toggle dropdown
   */
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  /**
   * Close dropdown when clicking outside
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.workspace-switcher')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  // Don't render if not authenticated or no workspace
  if (!authState.isAuthenticated || !currentWorkspace) {
    return null;
  }

  return (
    <div className={`workspace-switcher relative ${className}`}>
      {/* Current Workspace Display */}
      <button
        onClick={toggleDropdown}
        className="workspace-button flex items-center space-x-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        disabled={isLoading}
      >
        {/* Workspace Icon */}
        <div className="workspace-icon w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
          {currentWorkspace.slackTeamName.charAt(0).toUpperCase()}
        </div>

        {/* Workspace Name */}
        <span className="workspace-name text-sm font-medium text-gray-900 truncate">
          {showFullName 
            ? currentWorkspace.slackTeamName 
            : currentWorkspace.slackTeamName.substring(0, 20)
          }
          {!showFullName && currentWorkspace.slackTeamName.length > 20 && '...'}
        </span>

        {/* Dropdown Arrow */}
        <svg
          className={`dropdown-arrow w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="workspace-dropdown absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          {/* Current Workspace Header */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                {currentWorkspace.slackTeamName.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {currentWorkspace.slackTeamName}
                </div>
                <div className="text-xs text-gray-500">
                  Current workspace
                </div>
              </div>
            </div>
          </div>

          {/* Workspace List */}
          <div className="py-1">
            {availableWorkspaces.length > 0 ? (
              availableWorkspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => handleWorkspaceSelect(workspace.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 flex items-center space-x-3 ${
                    workspace.id === currentWorkspace.id 
                      ? 'bg-blue-50 border-r-2 border-blue-500' 
                      : ''
                  }`}
                >
                  <div className="w-6 h-6 bg-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {workspace.slackTeamName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {workspace.slackTeamName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {workspace.id === currentWorkspace.id ? 'Current' : 'Switch to this workspace'}
                    </div>
                  </div>
                  {workspace.id === currentWorkspace.id && (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-gray-500">
                No other workspaces available
              </div>
            )}
          </div>

          {/* Add Workspace Option */}
          <div className="border-t border-gray-200 py-1">
            <a
              href="/workspace/install"
              className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 flex items-center space-x-3 text-blue-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="text-sm font-medium">Add workspace</span>
            </a>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-red-50 border border-red-200 rounded-md p-3 z-50">
          <div className="text-sm text-red-800">
            Error loading workspace: {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md p-3 z-50">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="text-sm text-gray-600">Loading workspace...</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact Workspace Switcher for headers/navigation
 */
export function CompactWorkspaceSwitcher({ className = '' }: { className?: string }) {
  return (
    <WorkspaceSwitcher 
      className={className}
      showFullName={false}
    />
  );
}

/**
 * Full Workspace Switcher for sidebars/settings
 */
export function FullWorkspaceSwitcher({ className = '' }: { className?: string }) {
  return (
    <WorkspaceSwitcher 
      className={className}
      showFullName={true}
    />
  );
}