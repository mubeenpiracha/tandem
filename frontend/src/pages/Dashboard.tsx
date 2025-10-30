/**
 * Dashboard Page with Workspace Context
 * 
 * Main dashboard for task management with workspace-aware interface.
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '../components/Auth/AuthContext';
import { useWorkspace } from '../components/Auth/WorkspaceContext';
import { useRealTimeUpdates } from '../hooks/useRealTimeUpdates';
import TaskList from '../components/TaskList';
import TaskDetail from '../components/TaskDetail';
import { TaskResponse } from '../services/api';

export default function Dashboard() {
  const { state: authState, refreshAuthStatus } = useAuth();
  const { state: workspaceState, refreshWorkspace } = useWorkspace();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /**
   * Setup real-time updates with task event handlers
   */
  const { isConnected, connectionType, refresh: refreshRealTime } = useRealTimeUpdates({
    enabled: true,
    onTaskUpdated: () => setRefreshTrigger(prev => prev + 1),
    onTaskCreated: () => setRefreshTrigger(prev => prev + 1),
    onTaskDeleted: (taskId) => {
      if (selectedTask === taskId) {
        setSelectedTask(null);
      }
      setRefreshTrigger(prev => prev + 1);
    },
  });

  /**
   * Handle task updates from components
   */
  const handleTaskUpdate = useCallback((task: TaskResponse) => {
    // Trigger refresh of task list
    setRefreshTrigger(prev => prev + 1);
  }, []);

  /**
   * Handle task removal
   */
  const handleTaskRemove = useCallback((taskId: string) => {
    // Close detail view if this task is selected
    if (selectedTask === taskId) {
      setSelectedTask(null);
    }
    // Trigger refresh of task list
    setRefreshTrigger(prev => prev + 1);
  }, [selectedTask]);

  /**
   * Handle task selection
   */
  const handleTaskSelect = useCallback((task: TaskResponse) => {
    setSelectedTask(task.id);
  }, []);

  /**
   * Close task detail
   */
  const handleTaskDetailClose = useCallback(() => {
    setSelectedTask(null);
  }, []);

  /**
   * Handle refresh actions
   */
  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refreshAuthStatus(),
      refreshWorkspace(),
    ]);
    refreshRealTime();
    setRefreshTrigger(prev => prev + 1);
  }, [refreshAuthStatus, refreshWorkspace, refreshRealTime]);

  if (!authState.isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-6">You need to be authenticated to access the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error states */}
        {workspaceState.error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex items-center">
              <div className="text-red-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Workspace Error</h3>
                <p className="text-sm text-red-700 mt-1">{workspaceState.error}</p>
              </div>
              <button
                onClick={handleRefresh}
                className="ml-auto bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {authState.error && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex items-center">
              <div className="text-yellow-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Authentication Warning</h3>
                <p className="text-sm text-yellow-700 mt-1">{authState.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Connection status warnings */}
        {authState.authStatus && (
          <>
            {(!authState.authStatus.slack.connected || !authState.authStatus.slack.isValid) && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="text-blue-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">Connect Slack</h3>
                      <p className="text-sm text-blue-700">Connect your Slack account to receive task notifications.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.location.href = '/auth'}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                  >
                    Connect
                  </button>
                </div>
              </div>
            )}

            {(!authState.authStatus.google.connected || !authState.authStatus.google.isValid || authState.authStatus.google.isExpired) && (
              <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="text-green-600">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">Connect Google Calendar</h3>
                      <p className="text-sm text-green-700">
                        {authState.authStatus.google.isExpired 
                          ? 'Your Google Calendar connection has expired.' 
                          : 'Connect Google Calendar to schedule tasks automatically.'
                        }
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => window.location.href = '/auth'}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                  >
                    {authState.authStatus.google.isExpired ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Real-time connection status */}
        {!isConnected && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="text-yellow-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">Live Updates Disconnected</h3>
                  <p className="text-sm text-yellow-700">Real-time updates are not available. Refresh manually to see latest changes.</p>
                </div>
              </div>
              <button
                onClick={handleRefresh}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        )}

        {/* Dashboard content */}
        <div className="space-y-8">
          {/* Welcome section */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Welcome to Tandem
                </h2>
                <p className="text-gray-600">
                  AI-powered task detection and calendar scheduling for {workspaceState.currentWorkspace?.slackTeamName || 'your workspace'}.
                </p>
              </div>

              {/* Connection status indicator */}
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="text-sm text-gray-600">
                  {isConnected 
                    ? connectionType === 'websocket' ? 'Live updates' : 'Periodic updates'
                    : 'Manual updates'
                  }
                </span>
              </div>
            </div>
            
            {/* Quick stats */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-blue-600 font-semibold text-lg">📋</div>
                <div className="text-sm text-blue-800 font-medium">Task Detection</div>
                <div className="text-xs text-blue-600">AI automatically detects tasks from Slack messages</div>
              </div>
              
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-green-600 font-semibold text-lg">📅</div>
                <div className="text-sm text-green-800 font-medium">Smart Scheduling</div>
                <div className="text-xs text-green-600">Tasks are scheduled in your Google Calendar</div>
              </div>
              
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-purple-600 font-semibold text-lg">🏢</div>
                <div className="text-sm text-purple-800 font-medium">Workspace-Aware</div>
                <div className="text-xs text-purple-600">All data is scoped to your workspace</div>
              </div>
            </div>
          </div>

          {/* Task management */}
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Your Tasks</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage tasks detected from your Slack conversations.
                  </p>
                </div>
                
                <button
                  onClick={handleRefresh}
                  className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-2 rounded-md text-sm hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <TaskList
                onTaskSelect={handleTaskSelect}
                onTaskUpdate={handleTaskUpdate}
                onTaskRemove={handleTaskRemove}
                refreshTrigger={refreshTrigger}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskDetail
          taskId={selectedTask}
          onClose={handleTaskDetailClose}
          onUpdate={handleTaskUpdate}
          onRemove={handleTaskRemove}
        />
      )}
    </div>
  );
}