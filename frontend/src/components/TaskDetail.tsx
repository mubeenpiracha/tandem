/**
 * Task Detail Component
 * 
 * Detailed view of a task with full information and advanced actions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TaskResponse, apiClient } from '../services/api';

interface TaskDetailProps {
  taskId: string;
  onClose?: () => void;
  onUpdate?: (task: TaskResponse) => void;
  onRemove?: (taskId: string) => void;
}

export default function TaskDetail({ taskId, onClose, onUpdate, onRemove }: TaskDetailProps) {
  const [task, setTask] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadTask = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const taskData = await apiClient.getTask(taskId);
      setTask(taskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  /**
   * Load task details
   */
  useEffect(() => {
    loadTask();
  }, [loadTask]);

  /**
   * Handle task status update
   */
  const handleStatusUpdate = async (newStatus: string) => {
    if (!task) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const updatedTask = await apiClient.updateTaskStatus(task.id, newStatus);
      setTask(updatedTask);
      onUpdate?.(updatedTask);
      
      if (newStatus === 'DISMISSED') {
        onRemove?.(task.id);
        onClose?.();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle task completion
   */
  const handleComplete = async () => {
    if (!task) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const updatedTask = await apiClient.completeTask(task.id);
      setTask(updatedTask);
      onUpdate?.(updatedTask);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle task scheduling
   */
  const handleSchedule = async () => {
    if (!task) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const updatedTask = await apiClient.scheduleTask(task.id);
      setTask(updatedTask);
      onUpdate?.(updatedTask);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to schedule task');
    } finally {
      setActionLoading(false);
    }
  };

  /**
   * Handle task rescheduling (TODO: Add UI for this feature)
   */
  // const handleReschedule = async (startTime: string) => {
  //   if (!task) return;

  //   setActionLoading(true);
  //   setActionError(null);

  //   try {
  //     const updatedTask = await apiClient.rescheduleTask(task.id, startTime);
  //     setTask(updatedTask);
  //     onUpdate?.(updatedTask);
  //   } catch (err) {
  //     setActionError(err instanceof Error ? err.message : 'Failed to reschedule task');
  //   } finally {
  //     setActionLoading(false);
  //   }
  // };

  /**
   * Get status badge styling
   */
  const getStatusBadge = (status: string) => {
    const styles = {
      PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      CONFIRMED: 'bg-blue-100 text-blue-800 border-blue-200',
      SCHEDULED: 'bg-green-100 text-green-800 border-green-200',
      COMPLETED: 'bg-gray-100 text-gray-800 border-gray-200',
      DISMISSED: 'bg-red-100 text-red-800 border-red-200',
    };

    return `inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${
      styles[status as keyof typeof styles] || styles.PENDING
    }`;
  };

  /**
   * Get priority styling
   */
  const getPriorityColor = (level: string) => {
    const colors = {
      LOW: 'text-green-600 bg-green-50',
      MEDIUM: 'text-yellow-600 bg-yellow-50',
      HIGH: 'text-red-600 bg-red-50',
    };
    return colors[level as keyof typeof colors] || colors.MEDIUM;
  };

  /**
   * Format duration
   */
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours} hours ${mins} minutes` : `${hours} hours`;
  };

  /**
   * Format date and time
   */
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading task details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-4">Error</h2>
            <p className="text-gray-600 mb-6">{error || 'Task not found'}</p>
            <button
              onClick={onClose}
              className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 rounded-t-lg">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className={`text-2xl font-bold mb-2 ${
                task.status === 'COMPLETED' ? 'line-through text-gray-500' : 'text-gray-900'
              }`}>
                {task.title}
              </h1>
              <div className="flex items-center space-x-3">
                <span className={getStatusBadge(task.status)}>
                  {task.status.toLowerCase()}
                </span>
                <span className={`px-2 py-1 rounded text-sm ${getPriorityColor(task.importance)}`}>
                  {task.importance} importance
                </span>
                <span className={`px-2 py-1 rounded text-sm ${getPriorityColor(task.derivedUrgency)}`}>
                  {task.derivedUrgency} urgency
                </span>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Description */}
          {task.description && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Task Details */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm font-medium text-gray-600">Estimated Duration</div>
                <div className="text-lg text-gray-900">{formatDuration(task.estimatedDuration)}</div>
              </div>

              {task.dueDate && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="text-sm font-medium text-gray-600">Due Date</div>
                  <div className="text-lg text-gray-900">{formatDateTime(task.dueDate)}</div>
                </div>
              )}

              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm font-medium text-gray-600">Created</div>
                <div className="text-lg text-gray-900">{formatDateTime(task.createdAt)}</div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm font-medium text-gray-600">Last Updated</div>
                <div className="text-lg text-gray-900">{formatDateTime(task.updatedAt)}</div>
              </div>
            </div>
          </div>

          {/* Calendar Event */}
          {task.calendarEvent && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Calendar Event</h3>
              <div className={`p-4 rounded-lg border ${
                task.calendarEvent.isActive 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">📅</span>
                  <span className={`text-sm font-medium ${
                    task.calendarEvent.isActive ? 'text-green-800' : 'text-gray-600'
                  }`}>
                    {task.calendarEvent.isActive ? 'Active Event' : 'Inactive Event'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="font-medium">Start:</span> {formatDateTime(task.calendarEvent.startTime)}
                  </div>
                  <div>
                    <span className="font-medium">End:</span> {formatDateTime(task.calendarEvent.endTime)}
                  </div>
                  <div className="md:col-span-2">
                    <span className="font-medium">Google Event ID:</span> {task.calendarEvent.googleEventId}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Errors */}
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center">
                <div className="text-red-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              </div>
              <button
                onClick={() => setActionError(null)}
                className="mt-2 text-red-600 hover:text-red-800 text-xs underline"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        {task.status !== 'COMPLETED' && task.status !== 'DISMISSED' && (
          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 rounded-b-lg border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {task.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleStatusUpdate('CONFIRMED')}
                      disabled={actionLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      Confirm Task
                    </button>
                    <button
                      onClick={() => handleStatusUpdate('DISMISSED')}
                      disabled={actionLoading}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      Dismiss Task
                    </button>
                  </>
                )}

                {task.status === 'CONFIRMED' && (
                  <button
                    onClick={handleSchedule}
                    disabled={actionLoading}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    Schedule Task
                  </button>
                )}

                {(task.status === 'SCHEDULED' || task.status === 'CONFIRMED') && (
                  <button
                    onClick={handleComplete}
                    disabled={actionLoading}
                    className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-900 disabled:opacity-50 transition-colors"
                  >
                    Mark Complete
                  </button>
                )}

                {actionLoading && (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="text-sm text-gray-600">Processing...</span>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}