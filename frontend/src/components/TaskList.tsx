/**
 * Task List Component with Workspace Filtering
 * 
 * This component displays a list of tasks scoped to the current workspace
 * with filtering, pagination, and real-time updates.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient, TaskResponse, TaskListResponse } from '../services/api';
import { useWorkspace } from './Auth/WorkspaceContext';
import TaskItem from './TaskItem';

// Filter types
interface TaskFilters {
  status?: 'PENDING' | 'CONFIRMED' | 'SCHEDULED' | 'COMPLETED' | 'DISMISSED' | '';
  importance?: 'LOW' | 'MEDIUM' | 'HIGH' | '';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | '';
  search?: string;
}

interface TaskListProps {
  initialFilters?: TaskFilters;
  showFilters?: boolean;
  showPagination?: boolean;
  onTaskSelect?: (task: TaskResponse) => void;
  onTaskUpdate?: (task: TaskResponse) => void;
  onTaskRemove?: (taskId: string) => void;
  refreshTrigger?: number; // For external refresh triggers
}

export default function TaskList({ 
  initialFilters = {}, 
  showFilters = true,
  showPagination = true,
  onTaskSelect,
  onTaskUpdate,
  onTaskRemove,
  refreshTrigger = 0
}: TaskListProps) {
  const { state: workspaceState } = useWorkspace();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(initialFilters);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasNext: false,
  });

  /**
   * Load tasks from API
   */
  const loadTasks = useCallback(async () => {
    if (!workspaceState.currentWorkspace) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response: TaskListResponse = await apiClient.getTasks({
        status: filters.status || undefined,
        limit: pagination.limit,
        offset: pagination.offset,
      });

      // Apply client-side filtering for fields not supported by API
      let filteredTasks = response.tasks;

      if (filters.importance) {
        filteredTasks = filteredTasks.filter(task => task.importance === filters.importance);
      }

      if (filters.urgency) {
        filteredTasks = filteredTasks.filter(task => task.derivedUrgency === filters.urgency);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredTasks = filteredTasks.filter(task => 
          task.title.toLowerCase().includes(searchLower) ||
          (task.description && task.description.toLowerCase().includes(searchLower))
        );
      }

      setTasks(filteredTasks);
      setPagination(prev => ({
        ...prev,
        total: response.pagination.total,
        hasNext: response.pagination.hasNext,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [workspaceState.currentWorkspace, filters, pagination.limit, pagination.offset]);

  /**
   * Load tasks on mount and when dependencies change
   */
  useEffect(() => {
    loadTasks();
  }, [loadTasks, refreshTrigger]);

  /**
   * Handle filter changes
   */
  const handleFilterChange = (newFilters: Partial<TaskFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, offset: 0 })); // Reset to first page
  };

  /**
   * Handle pagination changes
   */
  const handlePageChange = (newOffset: number) => {
    setPagination(prev => ({ ...prev, offset: newOffset }));
  };

  /**
   * Handle task updates
   */
  const handleTaskUpdate = (updatedTask: TaskResponse) => {
    setTasks(prev => 
      prev.map(task => 
        task.id === updatedTask.id ? updatedTask : task
      )
    );
    onTaskUpdate?.(updatedTask);
  };

  /**
   * Handle task deletion/dismissal
   */
  const handleTaskRemove = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
    onTaskRemove?.(taskId);
  };

  // Show loading state
  if (loading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-gray-600">Loading tasks...</span>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex items-center">
          <div className="text-red-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading tasks</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={loadTasks}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workspace context */}
      {workspaceState.currentWorkspace && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Workspace:</span> {workspaceState.currentWorkspace.slackTeamName}
          </p>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Filters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search
              </label>
              <input
                type="text"
                value={filters.search || ''}
                onChange={(e) => handleFilterChange({ search: e.target.value })}
                placeholder="Search tasks..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Status
              </label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange({ status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="PENDING">Pending</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>

            {/* Importance */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Importance
              </label>
              <select
                value={filters.importance || ''}
                onChange={(e) => handleFilterChange({ importance: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Urgency
              </label>
              <select
                value={filters.urgency || ''}
                onChange={(e) => handleFilterChange({ urgency: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>

          <div className="mt-3 flex justify-between items-center">
            <p className="text-xs text-gray-600">
              Showing {tasks.length} of {pagination.total} tasks
            </p>
            
            <button
              onClick={loadTasks}
              disabled={loading}
              className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-600 mb-1">No tasks found</h3>
            <p className="text-sm text-gray-500">
              {Object.values(filters).some(v => v) 
                ? 'Try adjusting your filters to see more tasks.' 
                : 'Start a conversation in Slack to detect tasks automatically.'
              }
            </p>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onUpdate={handleTaskUpdate}
              onRemove={handleTaskRemove}
              onSelect={onTaskSelect}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {showPagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of{' '}
            {Math.ceil(pagination.total / pagination.limit)}
          </p>
          
          <div className="flex space-x-2">
            <button
              onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Previous
            </button>
            
            <button
              onClick={() => handlePageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.hasNext}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}