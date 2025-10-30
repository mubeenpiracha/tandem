/**
 * Authentication Context Provider
 * 
 * This module provides React context for managing user authentication
 * state across the application.
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { apiClient, AuthStatusResponse } from '../../services/api';

// Auth state types
interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    id?: string;
    email?: string;
    workspaceId?: string;
  } | null;
  authStatus: AuthStatusResponse | null;
  error: string | null;
}

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: any; authStatus: AuthStatusResponse } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'UPDATE_AUTH_STATUS'; payload: AuthStatusResponse }
  | { type: 'CLEAR_ERROR' };

// Initial state
const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  authStatus: null,
  error: null,
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case 'AUTH_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        isLoading: false,
        user: action.payload.user,
        authStatus: action.payload.authStatus,
        error: null,
      };

    case 'AUTH_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        isLoading: false,
        user: null,
        authStatus: null,
        error: action.payload,
      };

    case 'AUTH_LOGOUT':
      return {
        ...initialState,
        isLoading: false,
      };

    case 'UPDATE_AUTH_STATUS':
      return {
        ...state,
        authStatus: action.payload,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    default:
      return state;
  }
}

// Auth context
interface AuthContextType {
  state: AuthState;
  login: (token: string) => Promise<void>;
  logout: () => void;
  refreshAuthStatus: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  /**
   * Check authentication status on mount
   */
  useEffect(() => {
    checkAuthStatus();
  }, []);

  /**
   * Check current authentication status
   */
  const checkAuthStatus = async () => {
    dispatch({ type: 'AUTH_START' });

    const token = apiClient.getAuthToken();
    if (!token) {
      dispatch({ type: 'AUTH_FAILURE', payload: 'No authentication token found' });
      return;
    }

    try {
      const authStatus = await apiClient.getAuthStatus();
      
      // Check if user has required connections
      if (!authStatus.slack.connected || !authStatus.google.connected) {
        dispatch({ 
          type: 'AUTH_FAILURE', 
          payload: 'Missing required service connections' 
        });
        return;
      }

      // Mock user data (in real app, get from profile endpoint)
      const user = {
        id: 'current-user',
        email: 'user@example.com',
        workspaceId: apiClient.getWorkspaceId(),
      };

      dispatch({ 
        type: 'AUTH_SUCCESS', 
        payload: { user, authStatus } 
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication check failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
    }
  };

  /**
   * Login with token
   */
  const login = async (token: string) => {
    dispatch({ type: 'AUTH_START' });

    try {
      apiClient.setAuthToken(token);
      await checkAuthStatus();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: errorMessage });
    }
  };

  /**
   * Logout user
   */
  const logout = () => {
    apiClient.setAuthToken(null);
    apiClient.setWorkspaceId(null);
    dispatch({ type: 'AUTH_LOGOUT' });
  };

  /**
   * Refresh authentication status
   */
  const refreshAuthStatus = async () => {
    try {
      const authStatus = await apiClient.getAuthStatus();
      dispatch({ type: 'UPDATE_AUTH_STATUS', payload: authStatus });
    } catch (error) {
      console.error('Failed to refresh auth status:', error);
    }
  };

  /**
   * Clear error state
   */
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const contextValue: AuthContextType = {
    state,
    login,
    logout,
    refreshAuthStatus,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}