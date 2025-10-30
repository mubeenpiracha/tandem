/**
 * Real-time Updates Hook
 * 
 * Provides real-time task status updates with workspace isolation.
 * Uses WebSocket connections when available, falls back to polling.
 */

import React, { useState, useEffect, useCallback, useRef, createContext, useContext, ReactNode } from 'react';
import { useWorkspace } from '../components/Auth/WorkspaceContext';
import { useAuth } from '../components/Auth/AuthContext';
import { TaskResponse, apiClient } from '../services/api';

interface RealTimeUpdate {
  type: 'task_updated' | 'task_created' | 'task_deleted' | 'calendar_updated';
  workspaceId: string;
  userId?: string;
  taskId?: string;
  data: any;
  timestamp: string;
}

interface UseRealTimeUpdatesOptions {
  enabled?: boolean;
  pollingInterval?: number; // milliseconds
  onTaskUpdated?: (task: TaskResponse) => void;
  onTaskCreated?: (task: TaskResponse) => void;
  onTaskDeleted?: (taskId: string) => void;
}

interface RealTimeState {
  isConnected: boolean;
  lastUpdate: Date | null;
  errorCount: number;
  connectionType: 'websocket' | 'polling' | 'none';
}

interface RealTimeContextType {
  isConnected: boolean;
  lastUpdate: Date | null;
  connectionType: 'websocket' | 'polling' | 'none';
  errorCount: number;
  refresh: () => void;
}

interface RealTimeProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

const RealTimeContext = createContext<RealTimeContextType | undefined>(undefined);

export function useRealTimeUpdates(options: UseRealTimeUpdatesOptions = {}) {
  const {
    enabled = true,
    pollingInterval = 30000, // 30 seconds default
    onTaskUpdated,
    onTaskCreated,
    onTaskDeleted,
  } = options;

  const { state: authState } = useAuth();
  const { state: workspaceState } = useWorkspace();
  
  const [state, setState] = useState<RealTimeState>({
    isConnected: false,
    lastUpdate: null,
    errorCount: 0,
    connectionType: 'none',
  });

  const websocketRef = useRef<WebSocket | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTaskHashRef = useRef<string>('');

  /**
   * Process incoming real-time updates
   */
  const processUpdate = useCallback((update: RealTimeUpdate) => {
    // Ensure update is for current workspace
    if (update.workspaceId !== workspaceState.currentWorkspace?.id) {
      return;
    }

    setState(prev => ({ ...prev, lastUpdate: new Date() }));

    switch (update.type) {
      case 'task_updated':
        if (onTaskUpdated && update.data) {
          onTaskUpdated(update.data);
        }
        break;
      
      case 'task_created':
        if (onTaskCreated && update.data) {
          onTaskCreated(update.data);
        }
        break;
      
      case 'task_deleted':
        if (onTaskDeleted && update.taskId) {
          onTaskDeleted(update.taskId);
        }
        break;
      
      default:
        console.log('Unknown update type:', update.type);
    }
  }, [workspaceState.currentWorkspace?.id, onTaskUpdated, onTaskCreated, onTaskDeleted]);

  /**
   * Setup polling fallback
   */
  const setupPolling = useCallback(() => {
    if (!authState.isAuthenticated || !workspaceState.currentWorkspace || !enabled) {
      return;
    }

    console.log('Setting up polling updates');
    
    const poll = async () => {
      try {
        // Get recent tasks and check for changes
        const response = await apiClient.getTasks({ limit: 50 });
        const currentHash = JSON.stringify(response.tasks.map(t => ({ id: t.id, updatedAt: t.updatedAt })));
        
        if (lastTaskHashRef.current && lastTaskHashRef.current !== currentHash) {
          // Tasks have changed, trigger updates
          setState(prev => ({ ...prev, lastUpdate: new Date() }));
        }
        
        lastTaskHashRef.current = currentHash;
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionType: 'polling',
          errorCount: 0,
        }));
        
      } catch (error) {
        console.error('Polling error:', error);
        setState(prev => ({
          ...prev,
          errorCount: prev.errorCount + 1,
          isConnected: false,
        }));
      }
    };

    // Initial poll
    poll();
    
    // Setup interval
    pollingIntervalRef.current = setInterval(poll, pollingInterval);
    
  }, [authState.isAuthenticated, workspaceState.currentWorkspace, enabled, pollingInterval]);

  /**
   * Setup WebSocket connection
   */
  const setupWebSocket = useCallback(() => {
    if (!authState.isAuthenticated || !workspaceState.currentWorkspace) {
      return;
    }

    try {
      const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3000/ws';
      const token = apiClient.getAuthToken();
      const workspaceId = workspaceState.currentWorkspace.id;
      
      const ws = new WebSocket(`${wsUrl}?token=${token}&workspace=${workspaceId}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setState(prev => ({
          ...prev,
          isConnected: true,
          connectionType: 'websocket',
          errorCount: 0,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const update: RealTimeUpdate = JSON.parse(event.data);
          processUpdate(update);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setState(prev => ({
          ...prev,
          isConnected: false,
          connectionType: 'none',
        }));
        
        // Attempt reconnection after a delay
        setTimeout(() => {
          if (enabled) {
            setupWebSocket();
          }
        }, 5000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          errorCount: prev.errorCount + 1,
        }));
        
        // Fall back to polling after 3 failed attempts
        if (state.errorCount >= 2) {
          ws.close();
          setupPolling();
        }
      };

      websocketRef.current = ws;
      
    } catch (error) {
      console.error('Failed to setup WebSocket:', error);
      setupPolling();
    }
  }, [authState.isAuthenticated, workspaceState.currentWorkspace, enabled, processUpdate, state.errorCount, setupPolling]);

  /**
   * Cleanup connections
   */
  const cleanup = useCallback(() => {
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    setState({
      isConnected: false,
      lastUpdate: null,
      errorCount: 0,
      connectionType: 'none',
    });
  }, []);

  /**
   * Force refresh data
   */
  const refresh = useCallback(() => {
    setState(prev => ({ ...prev, lastUpdate: new Date() }));
  }, []);

  /**
   * Setup connections when dependencies change
   */
  useEffect(() => {
    if (!enabled || !authState.isAuthenticated || !workspaceState.currentWorkspace) {
      cleanup();
      return;
    }

    // Try WebSocket first, fall back to polling
    setupWebSocket();

    return cleanup;
  }, [enabled, authState.isAuthenticated, workspaceState.currentWorkspace, cleanup, setupWebSocket]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    isConnected: state.isConnected,
    lastUpdate: state.lastUpdate,
    connectionType: state.connectionType,
    errorCount: state.errorCount,
    refresh,
  };
}

/**
 * Real-time updates context provider component
 */
export function RealTimeProvider({ children, enabled = true }: RealTimeProviderProps) {
  const realTimeState = useRealTimeUpdates({ enabled });

  return (
    <RealTimeContext.Provider value={realTimeState}>
      {children}
    </RealTimeContext.Provider>
  );
}

export function useRealTime(): RealTimeContextType {
  const context = useContext(RealTimeContext);
  if (context === undefined) {
    throw new Error('useRealTime must be used within a RealTimeProvider');
  }
  return context;
}