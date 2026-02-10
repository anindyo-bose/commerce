import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import { TokenService } from '../services/token.service';
import { PasswordService } from '../services/password.service';
import { ImpersonationRepository } from '../repositories/impersonation.repository';

describe('AuthService', () => {
  let authService: AuthService;
  let userRepo: jest.Mocked<UserRepository>;
  let tokenService: jest.Mocked<TokenService>;
  let passwordService: jest.Mocked<PasswordService>;
  let impersonationRepo: jest.Mocked<ImpersonationRepository>;

  beforeEach(() => {
    userRepo = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      verifyPassword: jest.fn(),
      getPermissions: jest.fn(),
      findById: jest.fn(),
    } as any;

    tokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    } as any;

    passwordService = {
      hash: jest.fn(),
      verify: jest.fn(),
    } as any;

    impersonationRepo = {
      startSession: jest.fn(),
      getActiveSession: jest.fn(),
      endSession: jest.fn(),
    } as any;

    authService = new AuthService(
      userRepo,
      tokenService,
      passwordService,
      impersonationRepo
    );
  });

  describe('register', () => {
    it('should create new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
        phoneNumber: '+919876543210',
      };

      const hashedPassword = 'hashed_password_123';
      const createdUser = {
        id: 'user-123',
        email: userData.email,
        fullName: userData.fullName,
      };

      passwordService.hash.mockResolvedValue(hashedPassword);
      userRepo.create.mockResolvedValue(createdUser as any);

      const result = await authService.register(userData);

      expect(passwordService.hash).toHaveBeenCalledWith(userData.password);
      expect(userRepo.create).toHaveBeenCalledWith({
        ...userData,
        password: hashedPassword,
      });
      expect(result).toEqual(createdUser);
    });

    it('should throw error if email already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
      };

      userRepo.create.mockRejectedValue(new Error('Email already exists'));

      await expect(authService.register(userData)).rejects.toThrow(
        'Email already exists'
      );
    });

    it('should validate password strength', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123', // Weak password
        fullName: 'Test User',
      };

      passwordService.hash.mockRejectedValue(
        new Error('Password too weak')
      );

      await expect(authService.register(userData)).rejects.toThrow(
        'Password too weak'
      );
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      const email = 'test@example.com';
      const password = 'SecurePass123!';

      const user = {
        id: 'user-123',
        email,
        isLocked: false,
      };

      const permissions = ['product:read', 'cart:write'];
      const accessToken = 'access_token_xyz';
      const refreshToken = 'refresh_token_abc';

      userRepo.findByEmail.mockResolvedValue(user as any);
      userRepo.verifyPassword.mockResolvedValue(true);
      userRepo.getPermissions.mockResolvedValue(permissions);
      tokenService.generateAccessToken.mockResolvedValue(accessToken);
      tokenService.generateRefreshToken.mockResolvedValue(refreshToken);

      const result = await authService.login(email, password);

      expect(userRepo.findByEmail).toHaveBeenCalledWith(email);
      expect(userRepo.verifyPassword).toHaveBeenCalledWith(
        user.id,
        password
      );
      expect(result).toEqual({
        accessToken,
        refreshToken,
        user,
        permissions,
      });
    });

    it('should throw error if user not found', async () => {
      userRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login('nonexistent@example.com', 'password')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error if password is incorrect', async () => {
      const user = { id: 'user-123', email: 'test@example.com' };
      userRepo.findByEmail.mockResolvedValue(user as any);
      userRepo.verifyPassword.mockResolvedValue(false);

      await expect(
        authService.login('test@example.com', 'wrongpassword')
      ).rejects.toThrow('Invalid credentials');
    });

    it('should throw error if account is locked', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        isLocked: true,
      };
      userRepo.findByEmail.mockResolvedValue(user as any);

      await expect(
        authService.login('test@example.com', 'password')
      ).rejects.toThrow('Account is locked');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token successfully', async () => {
      const refreshToken = 'valid_refresh_token';
      const userId = 'user-123';
      const user = { id: userId, email: 'test@example.com' };
      const permissions = ['product:read'];
      const newAccessToken = 'new_access_token';

      tokenService.verifyRefreshToken.mockResolvedValue({ userId });
      userRepo.findById.mockResolvedValue(user as any);
      userRepo.getPermissions.mockResolvedValue(permissions);
      tokenService.generateAccessToken.mockResolvedValue(newAccessToken);

      const result = await authService.refreshToken(refreshToken);

      expect(tokenService.verifyRefreshToken).toHaveBeenCalledWith(
        refreshToken
      );
      expect(result).toEqual({ accessToken: newAccessToken });
    });

    it('should throw error if refresh token is invalid', async () => {
      tokenService.verifyRefreshToken.mockRejectedValue(
        new Error('Invalid token')
      );

      await expect(
        authService.refreshToken('invalid_token')
      ).rejects.toThrow('Invalid token');
    });
  });

  describe('impersonate', () => {
    it('should start impersonation session successfully', async () => {
      const impersonatorId = 'admin-123';
      const targetUserId = 'user-456';
      const reason = 'Customer support';
      const durationMinutes = 30;

      const sessionId = 'session-789';
      const targetUser = { id: targetUserId, email: 'target@example.com' };
      const permissions = ['cart:read'];
      const impersonationToken = 'impersonation_token';

      impersonationRepo.startSession.mockResolvedValue(sessionId);
      userRepo.findById.mockResolvedValue(targetUser as any);
      userRepo.getPermissions.mockResolvedValue(permissions);
      tokenService.generateAccessToken.mockResolvedValue(
        impersonationToken
      );

      const result = await authService.impersonate(
        impersonatorId,
        targetUserId,
        reason,
        durationMinutes
      );

      expect(impersonationRepo.startSession).toHaveBeenCalledWith({
        impersonatorId,
        targetUserId,
        reason,
        durationMinutes,
      });
      expect(result).toEqual({
        sessionId,
        token: impersonationToken,
        expiresIn: durationMinutes * 60,
      });
    });

    it('should throw error if target user not found', async () => {
      impersonationRepo.startSession.mockResolvedValue('session-123');
      userRepo.findById.mockResolvedValue(null);

      await expect(
        authService.impersonate('admin-123', 'nonexistent', 'Support', 30)
      ).rejects.toThrow('User not found');
    });
  });

  describe('endImpersonation', () => {
    it('should end impersonation session successfully', async () => {
      const sessionId = 'session-789';

      await authService.endImpersonation(sessionId);

      expect(impersonationRepo.endSession).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('validateImpersonationSession', () => {
    it('should validate active impersonation session', async () => {
      const sessionId = 'session-789';
      const session = {
        id: sessionId,
        isActive: true,
        expiresAt: new Date(Date.now() + 3600000),
      };

      impersonationRepo.getActiveSession.mockResolvedValue(session);

      const result = await authService.validateImpersonationSession(
        sessionId
      );

      expect(result).toBe(true);
    });

    it('should return false for expired session', async () => {
      impersonationRepo.getActiveSession.mockResolvedValue(null);

      const result = await authService.validateImpersonationSession(
        'expired-session'
      );

      expect(result).toBe(false);
    });
  });
});
