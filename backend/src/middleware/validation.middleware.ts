/**
 * Validation Middleware
 * Validates request body, params, and query using Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export class ValidationMiddleware {
  /**
   * Validate request body
   */
  validateBody<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        req.body = schema.parse(req.body);
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request body validation failed',
              details: error.errors.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            },
            meta: {
              timestamp: new Date().toISOString(),
              path: req.path,
            },
          });
        }
        next(error);
      }
    };
  }

  /**
   * Validate request query parameters
   */
  validateQuery<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        // Convert string values to appropriate types
        const query = this.parseQueryParams(req.query);
        req.query = schema.parse(query) as any;
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Query parameters validation failed',
              details: error.errors.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            },
            meta: {
              timestamp: new Date().toISOString(),
              path: req.path,
            },
          });
        }
        next(error);
      }
    };
  }

  /**
   * Validate request params
   */
  validateParams<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        req.params = schema.parse(req.params);
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'URL parameters validation failed',
              details: error.errors.map((err) => ({
                field: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            },
            meta: {
              timestamp: new Date().toISOString(),
              path: req.path,
            },
          });
        }
        next(error);
      }
    };
  }

  /**
   * Parse query parameters to correct types
   */
  private parseQueryParams(query: any): any {
    const parsed: any = {};

    for (const [key, value] of Object.entries(query)) {
      if (typeof value === 'string') {
        // Try to parse as number
        if (!isNaN(Number(value))) {
          parsed[key] = Number(value);
        }
        // Try to parse as boolean
        else if (value === 'true' || value === 'false') {
          parsed[key] = value === 'true';
        }
        // Keep as string
        else {
          parsed[key] = value;
        }
      } else {
        parsed[key] = value;
      }
    }

    return parsed;
  }
}
