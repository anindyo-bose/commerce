/**
 * Rate Limiting Middleware
 * Implements request rate limiting to prevent abuse
 * Per SECURITY.md - Global (1000/min) + endpoint-specific (login 5/15min)
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (req: Request) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  message?: string; // Custom error message
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export class RateLimitMiddleware {
  private store: RateLimitStore = {};

  /**
   * Create rate limiter
   */
  createLimiter(options: RateLimitOptions) {
    const {
      windowMs,
      maxRequests,
      keyGenerator = this.defaultKeyGenerator,
      skipSuccessfulRequests = false,
      message = 'Too many requests, please try again later',
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
      const key = keyGenerator(req);
      const now = Date.now();

      // Clean up expired entries
      this.cleanup();

      // Get or create rate limit entry
      let entry = this.store[key];

      if (!entry || now > entry.resetTime) {
        // Create new entry
        entry = {
          count: 0,
          resetTime: now + windowMs,
        };
        this.store[key] = entry;
      }

      // Check if limit exceeded
      if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
        
        return res.status(429)
          .set('Retry-After', retryAfter.toString())
          .json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message,
              retryAfter,
            },
          });
      }

      // Increment counter
      entry.count++;

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - entry.count).toString(),
        'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
      });

      // Handle response to potentially reset counter
      if (skipSuccessfulRequests) {
        const originalSend = res.json.bind(res);
        res.json = (body: any) => {
          if (res.statusCode < 400) {
            entry.count--;
          }
          return originalSend(body);
        };
      }

      next();
    };
  }

  /**
   * Global rate limiter - 1000 requests per minute
   */
  globalLimiter() {
    return this.createLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 1000,
      message: 'Too many requests from this IP, please try again later',
    });
  }

  /**
   * Login rate limiter - 5 attempts per 15 minutes
   */
  loginLimiter() {
    return this.createLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyGenerator: (req) => {
        // Use email from body if available, otherwise IP
        const email = req.body?.email || '';
        return `login:${email || this.getClientIp(req)}`;
      },
      message: 'Too many login attempts, please try again after 15 minutes',
    });
  }

  /**
   * API rate limiter - 100 requests per minute per user
   */
  apiLimiter() {
    return this.createLimiter({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      keyGenerator: (req) => {
        const user = (req as any).user;
        return `api:${user?.userId || this.getClientIp(req)}`;
      },
    });
  }

  /**
   * Default key generator - uses IP address
   */
  private defaultKeyGenerator(req: Request): string {
    return `global:${this.getClientIp(req)}`;
  }

  /**
   * Get client IP address
   */
  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  /**
   * Clean up expired entries (run every 60 seconds)
   */
  private cleanup() {
    const now = Date.now();
    for (const key in this.store) {
      if (this.store[key].resetTime < now - 60000) {
        delete this.store[key];
      }
    }
  }

  /**
   * Reset rate limit for specific key (admin function)
   */
  resetLimit(key: string) {
    delete this.store[key];
  }

  /**
   * Get current count for a key
   */
  getCount(key: string): number {
    return this.store[key]?.count || 0;
  }
}
