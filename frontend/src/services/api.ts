/**
 * API client for backend communication with workspace context
 * 
 * This module provides a centralized HTTP client for communicating with the
 * Tandem backend API, including workspace-aware headers and authentication.
 */

import axios, { AxiosInstance } from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

// Types for API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface TaskResponse {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  estimatedDuration: number;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  derivedUrgency: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'PENDING' | 'CONFIRMED' | 'SCHEDULED' | 'COMPLETED' | 'DISMISSED';
  createdAt: string;
  updatedAt: string;
  slackMessageId?: string;
  calendarEvent?: {
    id: string;
    googleEventId: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
  };
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasNext: boolean;
  };
}

export interface AuthStatusResponse {
  slack: {
    connected: boolean;
    isValid: boolean;
    lastUpdated?: string;
  };
  google: {
    connected: boolean;
    isValid: boolean;
    isExpired: boolean;
    expiresIn?: number;
    lastUpdated?: string;
  };
}

export interface WorkspaceResponse {
  id: string;
  name: string;
  slackTeamId: string;
  slackTeamName: string;
  isActive: boolean;
  installedAt: string;
  updatedAt: string;
}

// API Client class with workspace awareness
class ApiClient {
  private client: AxiosInstance;
  private authToken: string | null = null;
  private workspaceId: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth and workspace headers
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token if available
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }

        // Add workspace context if available
        if (this.workspaceId) {
          config.headers['X-Workspace-ID'] = this.workspaceId;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Clear auth token on 401
          this.setAuthToken(null);
          
          // Redirect to auth page if in browser
          if (typeof window !== 'undefined') {
            window.location.href = '/auth';
          }
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
    
    // Store in localStorage for persistence
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('tandem_auth_token', token);
      } else {
        localStorage.removeItem('tandem_auth_token');
      }
    }
  }

  /**
   * Get stored authentication token
   */
  getAuthToken(): string | null {
    if (this.authToken) {
      return this.authToken;
    }

    // Try to get from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tandem_auth_token');
    }

    return null;
  }

  /**
   * Set workspace context
   */
  setWorkspaceId(workspaceId: string | null): void {
    this.workspaceId = workspaceId;
    
    // Store in localStorage for persistence
    if (typeof window !== 'undefined') {
      if (workspaceId) {
        localStorage.setItem('tandem_workspace_id', workspaceId);
      } else {
        localStorage.removeItem('tandem_workspace_id');
      }
    }
  }

  /**
   * Get stored workspace ID
   */
  getWorkspaceId(): string | null {
    if (this.workspaceId) {
      return this.workspaceId;
    }

    // Try to get from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tandem_workspace_id');
    }

    return null;
  }

  /**
   * Initialize from stored tokens
   */
  initialize(): void {
    const token = this.getAuthToken();
    const workspaceId = this.getWorkspaceId();
    
    if (token) {
      this.setAuthToken(token);
    }
    
    if (workspaceId) {
      this.setWorkspaceId(workspaceId);
    }
  }

  // Task Management API

  /**
   * Get user's tasks with filtering
   */
  async getTasks(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.offset) params.set('offset', filters.offset.toString());

    const response = await this.client.get<TaskListResponse>(`/tasks?${params.toString()}`);
    return response.data;
  }

  /**
   * Get specific task by ID
   */
  async getTask(taskId: string): Promise<TaskResponse> {
    const response = await this.client.get<TaskResponse>(`/tasks/${taskId}`);
    return response.data;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: string): Promise<TaskResponse> {
    const response = await this.client.patch<TaskResponse>(`/tasks/${taskId}/status`, { status });
    return response.data;
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string): Promise<TaskResponse> {
    const response = await this.client.post<TaskResponse>(`/tasks/${taskId}/complete`);
    return response.data;
  }

  /**
   * Schedule a task
   */
  async scheduleTask(taskId: string, startTime?: string): Promise<TaskResponse> {
    const body = startTime ? { startTime } : {};
    const response = await this.client.post<TaskResponse>(`/tasks/${taskId}/schedule`, body);
    return response.data;
  }

  /**
   * Reschedule a task
   */
  async rescheduleTask(taskId: string, startTime: string): Promise<TaskResponse> {
    const response = await this.client.post<TaskResponse>(`/tasks/${taskId}/reschedule`, { startTime });
    return response.data;
  }

  // Authentication API

  /**
   * Get authentication status
   */
  async getAuthStatus(): Promise<AuthStatusResponse> {
    const response = await this.client.get<AuthStatusResponse>('/auth/status');
    return response.data;
  }

  /**
   * Initiate Slack OAuth
   */
  async initiateSlackAuth(workspaceId?: string): Promise<{ url: string }> {
    const params = workspaceId ? `?workspace=${workspaceId}` : '';
    const response = await this.client.get<{ url: string }>(`/auth/slack${params}`);
    return response.data;
  }

  /**
   * Initiate Google OAuth
   */
  async initiateGoogleAuth(): Promise<{ url: string }> {
    const response = await this.client.get<{ url: string }>('/auth/google');
    return response.data;
  }

  /**
   * Refresh auth tokens
   */
  async refreshTokens(provider: 'slack' | 'google'): Promise<void> {
    await this.client.post(`/auth/refresh/${provider}`);
  }

  /**
   * Test connections to external services
   */
  async testConnections(): Promise<{
    slack: boolean;
    google: boolean;
  }> {
    const response = await this.client.get('/auth/test');
    return response.data;
  }

  // Workspace API

  /**
   * Get workspace information
   */
  async getWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
    const response = await this.client.get<WorkspaceResponse>(`/workspace/${workspaceId}`);
    return response.data;
  }

  /**
   * Get workspace installation status
   */
  async getWorkspaceStatus(teamId?: string): Promise<{
    installed: boolean;
    workspace?: WorkspaceResponse;
  }> {
    const params = teamId ? `?team_id=${teamId}` : '';
    const response = await this.client.get(`/auth/slack/workspace/status${params}`);
    return response.data;
  }

  // Health checks

  /**
   * Check API health
   */
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    services: Record<string, string>;
  }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  // User Preferences API

  /**
   * Get user preferences
   */
  async getPreferences(): Promise<{
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
    hasCustomPreferences: boolean;
    lastUpdated?: string;
  }> {
    const response = await this.client.get('/preferences');
    return response.data;
  }

  /**
   * Create user preferences
   */
  async createPreferences(preferences: {
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
  }): Promise<{
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
    hasCustomPreferences: boolean;
    lastUpdated?: string;
  }> {
    const response = await this.client.post('/preferences', preferences);
    return response.data;
  }

  /**
   * Update user preferences
   */
  async updatePreferences(preferences: {
    weeklyHours?: Record<string, { start: string; end: string } | null>;
    breakTimes?: Record<string, { start: string; end: string }>;
    timezone?: string;
  }): Promise<{
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
    hasCustomPreferences: boolean;
    lastUpdated?: string;
  }> {
    const response = await this.client.put('/preferences', preferences);
    return response.data;
  }

  /**
   * Reset preferences to defaults
   */
  async resetPreferences(timezone?: string): Promise<{
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
    hasCustomPreferences: boolean;
    lastUpdated?: string;
  }> {
    const response = await this.client.post('/preferences/reset', { timezone });
    return response.data;
  }

  /**
   * Get preference templates
   */
  async getPreferenceTemplates(): Promise<{
    name: string;
    description: string;
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
  }[]> {
    const response = await this.client.get('/preferences/templates');
    return response.data;
  }

  /**
   * Apply preference template
   */
  async applyPreferenceTemplate(templateName: string, timezone?: string): Promise<{
    weeklyHours: Record<string, { start: string; end: string } | null>;
    breakTimes: Record<string, { start: string; end: string }>;
    timezone: string;
    hasCustomPreferences: boolean;
    lastUpdated?: string;
  }> {
    const response = await this.client.post('/preferences/templates/apply', {
      templateName,
      timezone,
    });
    return response.data;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Initialize from stored tokens
apiClient.initialize();

export default apiClient;