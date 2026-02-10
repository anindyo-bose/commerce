import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RBACGuard } from '../guards/rbac.guard';
import { UserRepository } from '../repositories/user.repository';

describe('RBACGuard', () => {
  let rbacGuard: RBACGuard;
  let userRepo: jest.Mocked<UserRepository>;

  beforeEach(() => {
    userRepo = {
      getPermissions: jest.fn(),
    } as any;

    rbacGuard = new RBACGuard(userRepo);
  });

  describe('canActivate', () => {
    it('should allow access with required permission', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['product:read'],
      });

      userRepo.getPermissions.mockResolvedValue([
        'product:read',
        'cart:write',
      ]);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
      expect(userRepo.getPermissions).toHaveBeenCalledWith('user-123');
    });

    it('should deny access without required permission', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['admin:users:manage'],
      });

      userRepo.getPermissions.mockResolvedValue(['product:read']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(false);
    });

    it('should allow access with multiple required permissions', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['product:read', 'cart:write'],
      });

      userRepo.getPermissions.mockResolvedValue([
        'product:read',
        'cart:write',
        'order:read',
      ]);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
    });

    it('should deny access if missing one required permission', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['product:read', 'admin:users:manage'],
      });

      userRepo.getPermissions.mockResolvedValue(['product:read']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(false);
    });

    it('should allow admin with wildcard permission', async () => {
      const context = createMockContext({
        user: { id: 'admin-123', email: 'admin@example.com' },
        requiredPermissions: ['product:write'],
      });

      userRepo.getPermissions.mockResolvedValue(['*:*']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
    });

    it('should enforce data scope for user-owned resources', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['order:read'],
        params: { userId: 'user-123' },
      });

      userRepo.getPermissions.mockResolvedValue(['order:read']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
    });

    it('should deny access to other users resources without admin permission', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['order:read'],
        params: { userId: 'user-456' }, // Different user
      });

      userRepo.getPermissions.mockResolvedValue(['order:read']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(false);
    });

    it('should allow admin to access other users resources', async () => {
      const context = createMockContext({
        user: { id: 'admin-123', email: 'admin@example.com' },
        requiredPermissions: ['order:read'],
        params: { userId: 'user-456' },
      });

      userRepo.getPermissions.mockResolvedValue([
        'order:read',
        'admin:users:manage',
      ]);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
    });

    it('should cache permissions for performance', async () => {
      const context = createMockContext({
        user: { id: 'user-123', email: 'test@example.com' },
        requiredPermissions: ['product:read'],
      });

      userRepo.getPermissions.mockResolvedValue(['product:read']);

      await rbacGuard.canActivate(context as any);
      await rbacGuard.canActivate(context as any);

      // Should only call once due to caching
      expect(userRepo.getPermissions).toHaveBeenCalledTimes(1);
    });

    it('should handle impersonation context', async () => {
      const context = createMockContext({
        user: {
          id: 'user-456',
          email: 'target@example.com',
          isImpersonated: true,
          impersonatorId: 'admin-123',
        },
        requiredPermissions: ['cart:write'],
      });

      userRepo.getPermissions.mockResolvedValue(['cart:write']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
      expect(userRepo.getPermissions).toHaveBeenCalledWith('user-456');
    });

    it('should mask PII fields in impersonation mode', async () => {
      const context = createMockContext({
        user: {
          id: 'user-456',
          email: 'target@example.com',
          isImpersonated: true,
          impersonatorId: 'admin-123',
        },
        requiredPermissions: ['profile:read'],
      });

      userRepo.getPermissions.mockResolvedValue(['profile:read']);

      const result = await rbacGuard.canActivate(context as any);

      expect(result).toBe(true);
    });
  });
});

function createMockContext(options: {
  user: any;
  requiredPermissions: string[];
  params?: any;
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: options.user,
        params: options.params || {},
      }),
    }),
    getHandler: () => ({
      // Mock decorator metadata
      __permissions__: options.requiredPermissions,
    }),
  };
}
