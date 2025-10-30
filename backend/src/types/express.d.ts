/**
 * Express Request type extensions for workspace context
 */

declare namespace Express {
  interface Request {
    /**
     * Workspace ID extracted from URL parameters or request context
     */
    workspaceId?: string;
    
    /**
     * User information for workspace-scoped operations
     */
    user?: {
      id: string;
      workspaceId: string;
      email: string;
      slackUserId: string;
    };
    
    /**
     * Workspace information for request context
     */
    workspace?: {
      id: string;
      name: string;
      slackTeamId: string;
      slackTeamName: string;
      isActive: boolean;
    };
  }
}