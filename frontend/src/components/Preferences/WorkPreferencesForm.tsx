/**
 * Work Preferences Form Component
 * 
 * Allows users to configure their work hours, break times, and timezone preferences.
 */

import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../Auth/WorkspaceContext';
import { apiClient } from '../../services/api';

// Types for preferences
interface WorkHours {
  start: string;
  end: string;
}

interface WeeklyHours {
  [key: string]: WorkHours | null;
}

interface BreakTimes {
  [key: string]: WorkHours;
}

interface WorkPreferences {
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
  hasCustomPreferences: boolean;
  lastUpdated?: string;
}

interface PreferenceTemplate {
  name: string;
  description: string;
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

export default function WorkPreferencesForm() {
  const { state: workspaceState } = useWorkspace();
  const workspace = workspaceState.currentWorkspace;
  const [preferences, setPreferences] = useState<WorkPreferences | null>(null);
  const [templates, setTemplates] = useState<PreferenceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load preferences and templates on mount
  useEffect(() => {
    loadPreferences();
    loadTemplates();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const preferences = await apiClient.getPreferences();
      setPreferences(preferences);
    } catch (error: any) {
      console.error('Failed to load preferences:', error);
      setError('Failed to load preferences. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const templates = await apiClient.getPreferenceTemplates();
      setTemplates(templates);
    } catch (error: any) {
      console.error('Failed to load templates:', error);
    }
  };

  const updateWorkHours = (day: string, hours: WorkHours | null) => {
    if (!preferences) return;
    
    setPreferences({
      ...preferences,
      weeklyHours: {
        ...preferences.weeklyHours,
        [day]: hours,
      },
    });
  };

  const updateBreakTime = (breakName: string, hours: WorkHours | null) => {
    if (!preferences) return;
    
    const newBreakTimes = { ...preferences.breakTimes };
    if (hours === null) {
      delete newBreakTimes[breakName];
    } else {
      newBreakTimes[breakName] = hours;
    }
    
    setPreferences({
      ...preferences,
      breakTimes: newBreakTimes,
    });
  };

  const addBreakTime = () => {
    const breakName = prompt('Enter break name (e.g., "morning", "lunch", "afternoon"):');
    if (breakName && breakName.trim()) {
      updateBreakTime(breakName.trim().toLowerCase(), { start: '10:00', end: '10:15' });
    }
  };

  const savePreferences = async () => {
    if (!preferences) return;
    
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedPreferences = await apiClient.updatePreferences({
        weeklyHours: preferences.weeklyHours,
        breakTimes: preferences.breakTimes,
        timezone: preferences.timezone,
      });

      setPreferences(updatedPreferences);
      setSuccessMessage('Preferences saved successfully!');
    } catch (error: any) {
      console.error('Failed to save preferences:', error);
      setError(error.response?.data?.details || 'Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async (templateName: string) => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedPreferences = await apiClient.applyPreferenceTemplate(
        templateName,
        preferences?.timezone || 'UTC'
      );

      setPreferences(updatedPreferences);
      setSuccessMessage(`Template "${templateName}" applied successfully!`);
    } catch (error: any) {
      console.error('Failed to apply template:', error);
      setError(error.response?.data?.error || 'Failed to apply template. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    // eslint-disable-next-line no-restricted-globals
    if (!confirm('Are you sure you want to reset to default preferences? This will overwrite your current settings.')) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updatedPreferences = await apiClient.resetPreferences(
        preferences?.timezone || 'UTC'
      );

      setPreferences(updatedPreferences);
      setSuccessMessage('Preferences reset to defaults successfully!');
    } catch (error: any) {
      console.error('Failed to reset preferences:', error);
      setError('Failed to reset preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading preferences...</span>
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="text-center p-8">
        <p className="text-red-600">Failed to load preferences.</p>
        <button
          onClick={loadPreferences}
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Work Preferences</h2>
          <p className="text-gray-600 mt-2">
            Configure your work hours and break times to help Tandem schedule tasks intelligently.
          </p>
          {workspace && (
            <p className="text-sm text-gray-500 mt-1">
              Workspace: <span className="font-medium">{workspace.name}</span>
            </p>
          )}
        </div>

        {error && (
          <div className="p-4 m-6 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="p-4 m-6 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800">{successMessage}</p>
          </div>
        )}

        <div className="p-6 space-y-8">
          {/* Templates Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Setup Templates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map((template) => (
                <div key={template.name} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">{template.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                  <button
                    onClick={() => applyTemplate(template.name)}
                    disabled={saving}
                    className="mt-3 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    Apply Template
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Timezone Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timezone</h3>
            <select
              value={preferences.timezone}
              onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
              className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          {/* Work Hours Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Work Hours</h3>
            <div className="space-y-4">
              {DAYS_OF_WEEK.map((day) => {
                const hours = preferences.weeklyHours[day.key];
                const isWorkingDay = hours !== null;
                
                return (
                  <div key={day.key} className="flex items-center space-x-4">
                    <div className="w-20">
                      <label className="text-sm font-medium text-gray-700">
                        {day.label}
                      </label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={isWorkingDay}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateWorkHours(day.key, { start: '09:00', end: '17:00' });
                          } else {
                            updateWorkHours(day.key, null);
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-600">Working day</span>
                    </div>
                    
                    {isWorkingDay && hours && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={hours.start}
                          onChange={(e) => updateWorkHours(day.key, { ...hours, start: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          type="time"
                          value={hours.end}
                          onChange={(e) => updateWorkHours(day.key, { ...hours, end: e.target.value })}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Break Times Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Break Times</h3>
            <div className="space-y-3">
              {Object.entries(preferences.breakTimes).map(([breakName, hours]) => (
                <div key={breakName} className="flex items-center space-x-4">
                  <div className="w-20">
                    <span className="text-sm font-medium text-gray-700 capitalize">
                      {breakName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="time"
                      value={hours.start}
                      onChange={(e) => updateBreakTime(breakName, { ...hours, start: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="time"
                      value={hours.end}
                      onChange={(e) => updateBreakTime(breakName, { ...hours, end: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <button
                      onClick={() => updateBreakTime(breakName, null)}
                      className="px-2 py-1 text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              
              <button
                onClick={addBreakTime}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add Break Time
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between pt-6 border-t border-gray-200">
            <button
              onClick={resetToDefaults}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Reset to Defaults
            </button>
            
            <div className="space-x-4">
              <button
                onClick={loadPreferences}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={savePreferences}
                disabled={saving}
                className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>

        {/* Metadata */}
        {preferences.lastUpdated && (
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600">
            Last updated: {new Date(preferences.lastUpdated).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}