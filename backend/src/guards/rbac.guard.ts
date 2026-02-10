/**
 * RBAC Guard
 * Implements role-based access control with permission checking
 * Per SECURITY.md - Policy-driven authorization, 100% test coverage required
 */

import { Request, Response, NextFunction } from 'express';
import { TokenService, TokenPayload } from '../utils/token.service';

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
  isImpersonation?: boolean;
}

export interface PermissionCheckOptions {
  requireAll?: boolean; // If true, user must have ALL specified permissions
  allowSelfAccess?: boolean; // If true, allow user to access their own resources
  dataScopeField?: string; // Field to check for data scoping (e.g., 'sellerId', 'userId')
}

export class RBACGuard {
  constructor(private readonly tokenService: TokenService) {}

  /**
   * Authenticate middleware - Verifies JWT token
   */
  authenticate() {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const token = this.tokenService.extractFromHeader(req.headers.authorization);

        if (!token) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
            },
          });
        }

        const payload = this.tokenService.verifyToken<TokenPayload>(token);

        // Attach user to request
        req.user = payload;
        req.isImpersonation = payload.type === 'impersonation';

        next();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message,
          },
        });
      }
    };
  }

  /**
   * Require specific role(s)
   */
  requireRole(...roles: string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Access denied. Required role: ${roles.join(' or ')}`,
          },
        });
      }

      next();
    };
  }

  /**
   * Require specific permission(s)
   */
  requirePermission(
    requiredPermissions: string | string[],
    options: PermissionCheckOptions = {}
  ) {
    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      const userPermissions = req.user.permissions || [];

      // Check permissions
      const hasPermission = options.requireAll
        ? permissions.every((p) => userPermissions.includes(p))
        : permissions.some((p) => userPermissions.includes(p));

      // Check self-access
      const isSelfAccess =
        options.allowSelfAccess &&
        req.params.userId === req.user.userId;

      if (!hasPermission && !isSelfAccess) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Access denied. Required permission: ${permissions.join(' or ')}`,
          },
        });
      }

      next();
    };
  }

  /**
   * Block impersonation for sensitive operations
   */
  blockImpersonation() {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (req.isImpersonation) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'IMPERSONATION_BLOCKED',
            message: 'This action cannot be performed during impersonation',
          },
        });
      }

      next();
    };
  }

  /**
   * Apply data scope filter
   * Restricts queries to user's own data (e.g., seller can only see their products)
   */
  applyDataScope(scopeField: 'sellerId' | 'userId') {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
      }

      // Admins can access all data
      if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
        next();
        return;
      }

      // Apply scope based on role
      if (scopeField === 'sellerId' && req.user.role === 'SELLER') {
        // Inject sellerId into query params
        req.query.sellerId = req.user.userId;
      } else if (scopeField === 'userId') {
        // Inject userId into query params
        req.query.userId = req.user.userId;
      }

      next();
    };
  }

  /**
   * Combine multiple guards with AND logic
   */
  combineGuards(...guards: Array<(req: AuthenticatedRequest, res: Response, next: NextFunction) => void>) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      for (const guard of guards) {
        await new Promise<void>((resolve, reject) => {
          guard(req, res, (error?: any) => {
            if (error) reject(error);
            else resolve();
          });
        });
      }
      next();
    };
  }
}
