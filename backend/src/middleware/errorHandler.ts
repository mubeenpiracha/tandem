/**
 * Error handling middleware
 * 
 * This module provides centralized error handling for the Express application
 * including custom error types and proper error responses.
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

// Custom error class
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public code?: string;
  public details?: any;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: any,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    this.details = details;

    // Maintain proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

// Error response formatter
function formatErrorResponse(err: AppError, includeStack: boolean = false) {
  const response: any = {
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message,
    },
  };

  if (err.details) {
    response.error.details = err.details;
  }

  if (includeStack && err.stack) {
    response.error.stack = err.stack;
  }

  return response;
}

// Main error handling middleware
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  let error: AppError;

  // Convert different error types to AppError
  if (err instanceof AppError) {
    error = err;
  } else if (err.name === 'ValidationError') {
    error = new ValidationError(err.message);
  } else if (err.name === 'CastError') {
    error = new ValidationError('Invalid data format');
  } else if (err.name === 'JsonWebTokenError') {
    error = new AuthenticationError('Invalid token');
  } else if (err.name === 'TokenExpiredError') {
    error = new AuthenticationError('Token expired');
  } else {
    // Unknown error - treat as internal server error
    error = new AppError(
      config.isProduction ? 'Internal server error' : err.message,
      500,
      'INTERNAL_ERROR',
      undefined,
      false
    );
  }

  // Log error (only log unexpected errors in production)
  if (!error.isOperational || !config.isProduction) {
    console.error('Error:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack,
      url: req.url,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
  }

  // Send error response
  const includeStack = config.isDevelopment && !error.isOperational;
  const response = formatErrorResponse(error, includeStack);

  res.status(error.statusCode).json(response);
}

// 404 handler for undefined routes
export function notFoundHandler(req: Request, res: Response): void {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  const response = formatErrorResponse(error);
  
  res.status(error.statusCode).json(response);
}

// Async wrapper to catch async errors
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}