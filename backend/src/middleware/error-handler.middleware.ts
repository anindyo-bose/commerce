/**
 * Error Handling Middleware
 * Centralized error handling for all API endpoints
 * Per API_CONTRACTS.md - Structured error responses
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ErrorHandler {
  /**
   * Global error handling middleware
   */
  handle() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[ERROR]', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });

      // Handle known application errors
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }

      // Handle Zod validation errors
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input validation failed',
            details: error.errors.map((err) => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          },
          meta: {
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }

      // Handle specific error types
      if (error.message.includes('authentication') || error.message.includes('token')) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: error.message,
          },
          meta: {
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }

      if (error.message.includes('permission') || error.message.includes('forbidden')) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'AUTHORIZATION_ERROR',
            message: error.message,
          },
          meta: {
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: error.message,
          },
          meta: {
            timestamp: new Date().toISOString(),
            path: req.path,
          },
        });
      }

      // Default server error
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        },
        meta: {
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    };
  }

  /**
   * 404 Not Found handler
   */
  notFound() {
    return (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Route ${req.method} ${req.path} not found`,
        },
        meta: {
          timestamp: new Date().toISOString(),
          path: req.path,
        },
      });
    };
  }

  /**
   * Async error wrapper for route handlers
   */
  asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
}

// Common error factories
export class ErrorFactory {
  static badRequest(message: string, details?: any): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message: string = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message: string = 'Access denied'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(resource: string = 'Resource'): AppError {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }

  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
