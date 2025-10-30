/**
 * Workspace Context Provider
 * 
 * This module provides React context for managing workspace state
 * and workspace-scoped operations.
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { apiClient, WorkspaceResponse } from '../../services/api';
import { useAuth } from './AuthContext';

// Workspace state types
interface WorkspaceState {
  currentWorkspace: WorkspaceResponse | null;
  availableWorkspaces: WorkspaceResponse[];
  isLoading: boolean;
  error: string | null;
}

// Workspace actions
type WorkspaceAction =
  | { type: 'WORKSPACE_LOADING' }
  | { type: 'WORKSPACE_SET'; payload: WorkspaceResponse }
  | { type: 'WORKSPACES_SET'; payload: WorkspaceResponse[] }
  | { type: 'WORKSPACE_ERROR'; payload: string }
  | { type: 'WORKSPACE_CLEAR' }
  | { type: 'CLEAR_ERROR' };

// Initial state
const initialState: WorkspaceState = {
  currentWorkspace: null,
  availableWorkspaces: [],
  isLoading: true,
  error: null,
};

// Workspace reducer
function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'WORKSPACE_LOADING':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'WORKSPACE_SET':
      return {
        ...state,
        currentWorkspace: action.payload,
        isLoading: false,
        error: null,
      };

    case 'WORKSPACES_SET':
      return {
        ...state,
        availableWorkspaces: action.payload,
        isLoading: false,
        error: null,
      };

    case 'WORKSPACE_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };

    case 'WORKSPACE_CLEAR':
      return initialState;

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
}

// Workspace context type
interface WorkspaceContextType {
  state: WorkspaceState;
  setCurrentWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  clearError: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// Workspace provider component
interface WorkspaceProviderProps {
  children: ReactNode;
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps) {
  const [state, dispatch] = useReducer(workspaceReducer, initialState);
  const { state: authState } = useAuth();

  /**
   * Initialize workspace on auth change
   */
  useEffect(() => {
    if (authState.isAuthenticated && authState.user?.workspaceId) {
      setCurrentWorkspace(authState.user.workspaceId);
    } else if (!authState.isAuthenticated) {
      dispatch({ type: 'WORKSPACE_CLEAR' });
    }
  }, [authState.isAuthenticated, authState.user?.workspaceId]);

  /**
   * Set current workspace
   */
  const setCurrentWorkspace = async (workspaceId: string) => {
    dispatch({ type: 'WORKSPACE_LOADING' });

    try {
      // Set workspace in API client
      apiClient.setWorkspaceId(workspaceId);

      // Get workspace details
      const workspace = await apiClient.getWorkspace(workspaceId);
      
      dispatch({ type: 'WORKSPACE_SET', payload: workspace });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load workspace';
      dispatch({ type: 'WORKSPACE_ERROR', payload: errorMessage });
    }
  };

  /**
   * Refresh current workspace
   */
  const refreshWorkspace = async () => {
    const workspaceId = apiClient.getWorkspaceId();
    if (workspaceId) {
      await setCurrentWorkspace(workspaceId);
    }
  };

  /**
   * Clear error state
   */
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const contextValue: WorkspaceContextType = {
    state,
    setCurrentWorkspace,
    refreshWorkspace,
    clearError,
  };

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// Hook to use workspace context
export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}