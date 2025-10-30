/**
 * Workspace Preference Templates Service
 * 
 * This service manages workspace-level preference templates and defaults
 * that can be applied to users during onboarding or preference setup.
 */

import { findWorkspaceById } from '../../models/workspace';
import {
  getWorkspacePreferenceTemplates,
  type WorkspacePreferenceTemplate,
} from '../preferences/preferences_manager';
import {
  type WeeklyHours,
  type BreakTimes,
} from '../../models/workPreferences';
import { Logger, LogCategory } from '../../utils/logger';

// Extended template with workspace-specific metadata
export interface WorkspaceTemplate extends WorkspacePreferenceTemplate {
  id: string;
  workspaceId?: string;
  isDefault: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Template configuration for different workspace types/industries
export interface IndustryTemplate {
  industry: string;
  description: string;
  templates: WorkspacePreferenceTemplate[];
}

/**
 * Get industry-specific preference templates
 */
export function getIndustryTemplates(): IndustryTemplate[] {
  return [
    {
      industry: 'Technology',
      description: 'Templates optimized for software development and tech companies',
      templates: [
        {
          name: 'Developer Standard',
          description: '9 AM to 5 PM with focused morning coding blocks',
          weeklyHours: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '10:30', end: '10:45' },
            lunch: { start: '12:00', end: '13:00' },
            afternoon: { start: '15:30', end: '15:45' },
          },
          timezone: 'UTC',
        },
        {
          name: 'Startup Hours',
          description: 'Flexible 10 AM to 6 PM for startup environments',
          weeklyHours: {
            monday: { start: '10:00', end: '18:00' },
            tuesday: { start: '10:00', end: '18:00' },
            wednesday: { start: '10:00', end: '18:00' },
            thursday: { start: '10:00', end: '18:00' },
            friday: { start: '10:00', end: '18:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            lunch: { start: '13:00', end: '14:00' },
            afternoon: { start: '16:00', end: '16:15' },
          },
          timezone: 'UTC',
        },
        {
          name: 'Remote Developer',
          description: 'Optimized for remote work with flexible breaks',
          weeklyHours: {
            monday: { start: '08:30', end: '16:30' },
            tuesday: { start: '08:30', end: '16:30' },
            wednesday: { start: '08:30', end: '16:30' },
            thursday: { start: '08:30', end: '16:30' },
            friday: { start: '08:30', end: '16:30' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '10:00', end: '10:20' },
            lunch: { start: '12:30', end: '13:30' },
            afternoon: { start: '15:00', end: '15:20' },
          },
          timezone: 'UTC',
        },
      ],
    },
    {
      industry: 'Consulting',
      description: 'Templates for client-facing consulting work',
      templates: [
        {
          name: 'Client Hours',
          description: 'Traditional business hours for client meetings',
          weeklyHours: {
            monday: { start: '08:00', end: '17:00' },
            tuesday: { start: '08:00', end: '17:00' },
            wednesday: { start: '08:00', end: '17:00' },
            thursday: { start: '08:00', end: '17:00' },
            friday: { start: '08:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            lunch: { start: '12:00', end: '13:00' },
          },
          timezone: 'UTC',
        },
        {
          name: 'Global Consulting',
          description: 'Extended hours for international client support',
          weeklyHours: {
            monday: { start: '07:00', end: '19:00' },
            tuesday: { start: '07:00', end: '19:00' },
            wednesday: { start: '07:00', end: '19:00' },
            thursday: { start: '07:00', end: '19:00' },
            friday: { start: '07:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '09:30', end: '09:45' },
            lunch: { start: '12:00', end: '13:00' },
            afternoon: { start: '15:30', end: '15:45' },
          },
          timezone: 'UTC',
        },
      ],
    },
    {
      industry: 'Healthcare',
      description: 'Templates for healthcare professionals',
      templates: [
        {
          name: 'Clinical Hours',
          description: 'Standard clinical work schedule',
          weeklyHours: {
            monday: { start: '07:00', end: '16:00' },
            tuesday: { start: '07:00', end: '16:00' },
            wednesday: { start: '07:00', end: '16:00' },
            thursday: { start: '07:00', end: '16:00' },
            friday: { start: '07:00', end: '16:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '09:30', end: '09:45' },
            lunch: { start: '12:00', end: '12:30' },
            afternoon: { start: '14:30', end: '14:45' },
          },
          timezone: 'UTC',
        },
        {
          name: 'Administrative',
          description: 'Healthcare administration hours',
          weeklyHours: {
            monday: { start: '08:00', end: '17:00' },
            tuesday: { start: '08:00', end: '17:00' },
            wednesday: { start: '08:00', end: '17:00' },
            thursday: { start: '08:00', end: '17:00' },
            friday: { start: '08:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '10:00', end: '10:15' },
            lunch: { start: '12:00', end: '13:00' },
            afternoon: { start: '15:00', end: '15:15' },
          },
          timezone: 'UTC',
        },
      ],
    },
    {
      industry: 'Education',
      description: 'Templates for educational institutions',
      templates: [
        {
          name: 'Academic Staff',
          description: 'University/college academic hours',
          weeklyHours: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '10:30', end: '10:45' },
            lunch: { start: '12:00', end: '13:00' },
            afternoon: { start: '15:00', end: '15:15' },
          },
          timezone: 'UTC',
        },
        {
          name: 'School Hours',
          description: 'K-12 teaching schedule',
          weeklyHours: {
            monday: { start: '07:30', end: '16:00' },
            tuesday: { start: '07:30', end: '16:00' },
            wednesday: { start: '07:30', end: '16:00' },
            thursday: { start: '07:30', end: '16:00' },
            friday: { start: '07:30', end: '16:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            morning: { start: '09:45', end: '10:00' },
            lunch: { start: '12:00', end: '12:30' },
            afternoon: { start: '14:00', end: '14:15' },
          },
          timezone: 'UTC',
        },
      ],
    },
    {
      industry: 'Creative',
      description: 'Templates for creative professionals and agencies',
      templates: [
        {
          name: 'Creative Agency',
          description: 'Flexible creative work schedule',
          weeklyHours: {
            monday: { start: '10:00', end: '18:00' },
            tuesday: { start: '10:00', end: '18:00' },
            wednesday: { start: '10:00', end: '18:00' },
            thursday: { start: '10:00', end: '18:00' },
            friday: { start: '10:00', end: '17:00' },
            saturday: null,
            sunday: null,
          },
          breakTimes: {
            lunch: { start: '13:00', end: '14:00' },
            afternoon: { start: '16:00', end: '16:15' },
          },
          timezone: 'UTC',
        },
        {
          name: 'Freelancer',
          description: 'Self-directed freelance schedule',
          weeklyHours: {
            monday: { start: '09:00', end: '15:00' },
            tuesday: { start: '09:00', end: '15:00' },
            wednesday: { start: '09:00', end: '15:00' },
            thursday: { start: '09:00', end: '15:00' },
            friday: { start: '09:00', end: '15:00' },
            saturday: { start: '10:00', end: '14:00' },
            sunday: null,
          },
          breakTimes: {
            morning: { start: '10:30', end: '10:45' },
            lunch: { start: '12:30', end: '13:30' },
          },
          timezone: 'UTC',
        },
      ],
    },
  ];
}

/**
 * Get templates by industry
 */
export function getTemplatesByIndustry(industry: string): WorkspacePreferenceTemplate[] {
  const industryTemplates = getIndustryTemplates();
  const industryData = industryTemplates.find(
    (ind) => ind.industry.toLowerCase() === industry.toLowerCase()
  );
  
  return industryData?.templates || [];
}

/**
 * Get all available templates (default + industry-specific)
 */
export function getAllAvailableTemplates(): WorkspacePreferenceTemplate[] {
  const defaultTemplates = getWorkspacePreferenceTemplates();
  const industryTemplates = getIndustryTemplates();
  
  const allIndustryTemplates = industryTemplates.flatMap(
    (industry) => industry.templates
  );
  
  return [...defaultTemplates, ...allIndustryTemplates];
}

/**
 * Recommend templates based on workspace characteristics
 */
export async function getRecommendedTemplates(
  workspaceId: string
): Promise<{
  recommended: WorkspacePreferenceTemplate[];
  reasoning: string[];
}> {
  try {
    Logger.info(LogCategory.AUTH, `Getting recommended templates for workspace ${workspaceId}`);

    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Get user count to help determine workspace type
    const { getUserCountByWorkspace } = await import('../../models/user');
    const userCount = await getUserCountByWorkspace(workspaceId);

    const recommendations: WorkspacePreferenceTemplate[] = [];
    const reasoning: string[] = [];

    // Default recommendation
    const defaultTemplates = getWorkspacePreferenceTemplates();
    recommendations.push(defaultTemplates[0]); // Standard Business Hours
    reasoning.push('Standard business hours work well for most teams');

    // Size-based recommendations
    if (userCount <= 10) {
      // Small team - suggest flexible hours
      const flexibleTemplate = defaultTemplates.find(t => t.name === 'Flexible Hours');
      if (flexibleTemplate) {
        recommendations.push(flexibleTemplate);
        reasoning.push('Flexible hours are ideal for small, agile teams');
      }
    } else if (userCount > 50) {
      // Large team - suggest structured hours
      const structuredTemplate = getTemplatesByIndustry('consulting').find(
        t => t.name === 'Client Hours'
      );
      if (structuredTemplate) {
        recommendations.push(structuredTemplate);
        reasoning.push('Structured hours help coordinate large teams');
      }
    }

    // Workspace name-based industry detection (basic heuristics)
    const workspaceName = workspace.slackTeamName.toLowerCase();
    
    if (workspaceName.includes('tech') || workspaceName.includes('dev') || workspaceName.includes('software')) {
      const techTemplates = getTemplatesByIndustry('technology');
      recommendations.push(...techTemplates.slice(0, 2));
      reasoning.push('Tech-optimized schedules detected based on workspace name');
    } else if (workspaceName.includes('consult') || workspaceName.includes('client')) {
      const consultingTemplates = getTemplatesByIndustry('consulting');
      recommendations.push(...consultingTemplates.slice(0, 1));
      reasoning.push('Client-focused schedules detected based on workspace name');
    } else if (workspaceName.includes('health') || workspaceName.includes('medical')) {
      const healthTemplates = getTemplatesByIndustry('healthcare');
      recommendations.push(...healthTemplates.slice(0, 1));
      reasoning.push('Healthcare schedules detected based on workspace name');
    } else if (workspaceName.includes('school') || workspaceName.includes('edu') || workspaceName.includes('university')) {
      const eduTemplates = getTemplatesByIndustry('education');
      recommendations.push(...eduTemplates.slice(0, 1));
      reasoning.push('Educational schedules detected based on workspace name');
    } else if (workspaceName.includes('creative') || workspaceName.includes('design') || workspaceName.includes('agency')) {
      const creativeTemplates = getTemplatesByIndustry('creative');
      recommendations.push(...creativeTemplates.slice(0, 1));
      reasoning.push('Creative work schedules detected based on workspace name');
    }

    // Remove duplicates and limit to top 5
    const uniqueRecommendations = recommendations.filter(
      (template, index, arr) => arr.findIndex(t => t.name === template.name) === index
    ).slice(0, 5);

    Logger.info(LogCategory.AUTH, `Recommended ${uniqueRecommendations.length} templates for workspace ${workspaceId}`, {
      workspaceName: workspace.slackTeamName,
      userCount,
      recommendations: uniqueRecommendations.map(t => t.name),
    });

    return {
      recommended: uniqueRecommendations,
      reasoning,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to get recommended templates for workspace ${workspaceId}`, error as Error);
    
    // Fallback to default templates
    const defaultTemplates = getWorkspacePreferenceTemplates();
    return {
      recommended: defaultTemplates.slice(0, 3),
      reasoning: ['Default recommendations (error occurred during analysis)'],
    };
  }
}

/**
 * Get template usage statistics for a workspace
 */
export async function getTemplateUsageStats(
  workspaceId: string
): Promise<{
  templateUsage: Record<string, number>;
  mostPopular: string | null;
  totalUsers: number;
}> {
  try {
    Logger.info(LogCategory.AUTH, `Getting template usage stats for workspace ${workspaceId}`);

    // Get total users in workspace
    const { getUserCountByWorkspace } = await import('../../models/user');
    const totalUsers = await getUserCountByWorkspace(workspaceId);
    
    // TODO: Implement actual template usage tracking
    // For now, return mock data structure
    const templateUsage: Record<string, number> = {
      'Standard Business Hours': Math.floor(totalUsers * 0.6),
      'Flexible Hours': Math.floor(totalUsers * 0.3),
      'Extended Hours': Math.floor(totalUsers * 0.1),
      'Four Day Week': 0,
    };
    
    // Find most popular template
    const mostPopular = Object.entries(templateUsage).reduce(
      (a, b) => (templateUsage[a[0]] > templateUsage[b[0]] ? a : b)
    )[0] || null;

    Logger.info(LogCategory.AUTH, `Retrieved template usage stats for workspace ${workspaceId}`, {
      totalUsers,
      mostPopular,
      templateCount: Object.keys(templateUsage).length,
    });

    return {
      templateUsage,
      mostPopular,
      totalUsers,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to get template usage stats for workspace ${workspaceId}`, error as Error);
    
    return {
      templateUsage: {},
      mostPopular: null,
      totalUsers: 0,
    };
  }
}

/**
 * Suggest optimal timezone for a workspace based on user locations
 */
export async function suggestWorkspaceTimezone(
  workspaceId: string
): Promise<{
  suggestedTimezone: string;
  reasoning: string;
  alternativeTimezones: string[];
}> {
  try {
    Logger.info(LogCategory.AUTH, `Suggesting timezone for workspace ${workspaceId}`);

    // Get all user timezones in the workspace
    // This would need to be implemented to analyze user timezones
    // For now, return UTC as default with reasonable alternatives
    
    const commonTimezones = [
      'America/New_York',
      'America/Chicago', 
      'America/Denver',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Tokyo',
    ];

    Logger.info(LogCategory.AUTH, `Suggested timezone UTC for workspace ${workspaceId}`);

    return {
      suggestedTimezone: 'UTC',
      reasoning: 'UTC is recommended as a universal baseline for diverse teams',
      alternativeTimezones: commonTimezones,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to suggest timezone for workspace ${workspaceId}`, error as Error);
    
    return {
      suggestedTimezone: 'UTC',
      reasoning: 'Default recommendation (error occurred during analysis)',
      alternativeTimezones: ['America/New_York', 'Europe/London'],
    };
  }
}