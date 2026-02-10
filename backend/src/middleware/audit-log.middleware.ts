/**
 * Audit Logging Middleware
 * Logs all API requests to audit trail
 * Per SECURITY.md - Immutable append-only logs with actor tracking
 */

import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../guards/rbac.guard';

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  resourceType: string | null;
  resourceId: string | null;
  httpMethod: string;
  endpoint: string;
  ipAddress: string;
  userAgent: string;
  requestBody: any;
  responseStatus: number;
  isImpersonation: boolean;
  impersonatorId: string | null;
  metadata: Record<string, any>;
}

export class AuditLogger {
  private sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'creditCard',
    'cvv',
  ];

  /**
   * Audit logging middleware
   */
  logRequest() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Capture response
      const originalJson = res.json.bind(res);
      let responseData: any;

      res.json = (body: any) => {
        responseData = body;
        return originalJson(body);
      };

      // Continue processing
      res.on('finish', async () => {
        const duration = Date.now() - startTime;

        const auditEntry: AuditLogEntry = {
          id: this.generateId(),
          timestamp: new Date(),
          action: this.determineAction(req),
          actorId: req.user?.userId || null,
          actorEmail: req.user?.email || null,
          actorRole: req.user?.role || null,
          resourceType: this.extractResourceType(req.path),
          resourceId: req.params.id || req.params.userId || req.params.productId || null,
          httpMethod: req.method,
          endpoint: req.path,
          ipAddress: this.getClientIp(req),
          userAgent: req.headers['user-agent'] || 'unknown',
          requestBody: this.sanitizeData(req.body),
          responseStatus: res.statusCode,
          isImpersonation: req.isImpersonation || false,
          impersonatorId: req.isImpersonation && req.user?.type === 'impersonation' 
            ? (req.user as any).impersonatorId 
            : null,
          metadata: {
            duration,
            query: req.query,
            params: req.params,
          },
        };

        // In production, persist to database via repository
        await this.persistAuditLog(auditEntry);
      });

      next();
    };
  }

  /**
   * Log specific action (called from services)
   */
  async logAction(
    action: string,
    actorId: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const auditEntry: Partial<AuditLogEntry> = {
      id: this.generateId(),
      timestamp: new Date(),
      action,
      actorId,
      resourceType,
      resourceId,
      httpMethod: 'SYSTEM',
      endpoint: 'SYSTEM',
      ipAddress: 'SYSTEM',
      userAgent: 'SYSTEM',
      requestBody: null,
      responseStatus: 200,
      isImpersonation: false,
      impersonatorId: null,
      metadata,
    };

    await this.persistAuditLog(auditEntry as AuditLogEntry);
  }

  /**
   * Determine action from request
   */
  private determineAction(req: Request): string {
    const path = req.path;
    const method = req.method;

    // Special endpoints
    if (path.includes('/login')) return 'USER_LOGIN';
    if (path.includes('/register')) return 'USER_REGISTER';
    if (path.includes('/logout')) return 'USER_LOGOUT';
    if (path.includes('/impersonate')) return 'IMPERSONATION_START';

    // CRUD operations
    if (method === 'POST') return 'CREATE';
    if (method === 'PUT' || method === 'PATCH') return 'UPDATE';
    if (method === 'DELETE') return 'DELETE';
    if (method === 'GET') return 'READ';

    return 'UNKNOWN';
  }

  /**
   * Extract resource type from path
   */
  private extractResourceType(path: string): string | null {
    const segments = path.split('/').filter(Boolean);
    
    // Remove 'api' and version from path
    const filtered = segments.filter(s => s !== 'api' && !s.startsWith('v'));
    
    if (filtered.length > 0) {
      return filtered[0].toUpperCase();
    }

    return null;
  }

  /**
   * Sanitize sensitive data from logs
   */
  private sanitizeData(data: any): any {
    if (!data) return null;

    const sanitized = { ...data };

    for (const field of this.sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
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
   * Persist audit log to database
   */
  private async persistAuditLog(entry: AuditLogEntry): Promise<void> {
    // In production, this would call AuditLogRepository
    console.log('[AUDIT LOG]', {
      timestamp: entry.timestamp.toISOString(),
      action: entry.action,
      actor: entry.actorEmail || 'anonymous',
      resource: `${entry.resourceType}:${entry.resourceId}`,
      status: entry.responseStatus,
      impersonation: entry.isImpersonation,
    });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
