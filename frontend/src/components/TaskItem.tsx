/**
 * Task Item Component
 * 
 * Individual task item component with actions and status management.
 */

import React, { useState } from 'react';
import { TaskResponse, apiClient } from '../services/api';

interface TaskItemProps {
  task: TaskResponse;
  onUpdate?: (task: TaskResponse) => void;
  onRemove?: (taskId: string) => void;
  onSelect?: (task: TaskResponse) => void;
}

export default function TaskItem({ task, onUpdate, onRemove, onSelect }: TaskItemProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle task status update
   */
  const handleStatusUpdate = async (newStatus: string) => {
    setLoading(true);
    setError(null);

    try {
      const updatedTask = await apiClient.updateTaskStatus(task.id, newStatus);
      onUpdate?.(updatedTask);
      
      if (newStatus === 'DISMISSED') {
        onRemove?.(task.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle task completion
   */
  const handleComplete = async () => {
    setLoading(true);
    setError(null);

    try {
      const updatedTask = await apiClient.completeTask(task.id);
      onUpdate?.(updatedTask);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete task');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle task scheduling
   */
  const handleSchedule = async () => {
    setLoading(true);
    setError(null);

    try {
      const updatedTask = await apiClient.scheduleTask(task.id);
      onUpdate?.(updatedTask);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule task');
    } finally {
      setLoading(false);
    }
  };

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

    return `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
      styles[status as keyof typeof styles] || styles.PENDING
    }`;
  };

  /**
   * Get importance/urgency styling
   */
  const getPriorityColor = (level: string) => {
    const colors = {
      LOW: 'text-green-600',
      MEDIUM: 'text-yellow-600',
      HIGH: 'text-red-600',
    };
    return colors[level as keyof typeof colors] || colors.MEDIUM;
  };

  /**
   * Format duration
   */
  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  /**
   * Format date
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;
    if (diffDays < 0 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div 
      className={`bg-white rounded-lg border ${
        task.status === 'COMPLETED' ? 'border-gray-200 opacity-75' : 'border-gray-200'
      } shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div 
            className="flex-1 cursor-pointer"
            onClick={() => onSelect?.(task)}
          >
            <div className="flex items-center space-x-2 mb-2">
              <h3 className={`text-lg font-medium ${
                task.status === 'COMPLETED' ? 'line-through text-gray-500' : 'text-gray-900'
              }`}>
                {task.title}
              </h3>
              <span className={getStatusBadge(task.status)}>
                {task.status.toLowerCase()}
              </span>
            </div>

            {task.description && (
              <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                {task.description}
              </p>
            )}

            {/* Metadata */}
            <div className="flex items-center space-x-4 text-xs text-gray-500">
              <span className={getPriorityColor(task.importance)}>
                {task.importance} importance
              </span>
              <span className={getPriorityColor(task.derivedUrgency)}>
                {task.derivedUrgency} urgency
              </span>
              <span>{formatDuration(task.estimatedDuration)}</span>
              {task.dueDate && (
                <span>Due: {formatDate(task.dueDate)}</span>
              )}
            </div>

            {/* Calendar event info */}
            {task.calendarEvent && task.calendarEvent.isActive && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                <p className="text-green-800">
                  📅 Scheduled: {formatDate(task.calendarEvent.startTime)} - {formatDate(task.calendarEvent.endTime)}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {task.status !== 'COMPLETED' && task.status !== 'DISMISSED' && (
            <div className="flex items-center space-x-2 ml-4">
              {task.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => handleStatusUpdate('CONFIRMED')}
                    disabled={loading}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => handleStatusUpdate('DISMISSED')}
                    disabled={loading}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-xs hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </>
              )}

              {task.status === 'CONFIRMED' && (
                <button
                  onClick={handleSchedule}
                  disabled={loading}
                  className="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Schedule
                </button>
              )}

              {(task.status === 'SCHEDULED' || task.status === 'CONFIRMED') && (
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="bg-gray-800 text-white px-3 py-1 rounded text-xs hover:bg-gray-900 disabled:opacity-50 transition-colors"
                >
                  Complete
                </button>
              )}

              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              )}
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-red-600 text-xs">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 text-xs underline mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Footer metadata */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-400">
          <span>Created: {formatDate(task.createdAt)}</span>
          {task.updatedAt !== task.createdAt && (
            <span>Updated: {formatDate(task.updatedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}