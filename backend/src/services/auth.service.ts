/**
 * Authentication Service
 * Handles user registration, login, token management
 * Per SECURITY.md - JWT with refresh token rotation
 */

import { User, UserCredentials, UserRole } from '../entities/user.entity';
import { PasswordService } from '../utils/password.service';
import { TokenService, TokenPair } from '../utils/token.service';
import { EncryptionService } from '../utils/encryption.service';

export interface RegistrationData {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName?: string;
  role?: UserRole;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User;
  tokens: TokenPair;
}

export class AuthService {
  constructor(
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly encryptionService: EncryptionService
  ) {}

  /**
   * Register a new user
   */
  async register(data: RegistrationData): Promise<AuthResult> {
    // Validate password strength
    const passwordValidation = this.passwordService.validateStrength(data.password);
    if (!passwordValidation.valid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password
    const passwordHash = await this.passwordService.hash(data.password);

    // Encrypt PII
    const emailEncryption = this.encryptionService.encrypt(data.email);
    const phoneEncryption = this.encryptionService.encrypt(data.phone);

    // Create user entity
    const userId = this.generateId();
    const user = new User(
      userId,
      data.email,
      data.email.toLowerCase(),
      data.phone,
      data.firstName,
      data.lastName || null,
      true,
      new Date(),
      new Date()
    );

    // Create credentials
    const credentials = new UserCredentials(
      userId,
      passwordHash,
      0, // failed login attempts
      null, // locked until
      false, // 2FA enabled
      null // 2FA secret
    );

    // Generate tokens
    const tokens = this.tokenService.generateTokenPair({
      userId: user.id,
      email: user.email,
      role: data.role || UserRole.CUSTOMER,
      permissions: this.getDefaultPermissions(data.role || UserRole.CUSTOMER),
    });

    return { user, tokens };
  }

  /**
   * Login user with email and password
   */
  async login(
    data: LoginData,
    storedUser: User,
    storedCredentials: UserCredentials,
    userRole: UserRole,
    userPermissions: string[]
  ): Promise<AuthResult> {
    // Check if user is active
    if (!storedUser.isActive) {
      throw new Error('Account is deactivated');
    }

    // Check if account is locked
    if (storedCredentials.isLocked()) {
      const lockDuration = storedCredentials.lockedUntil
        ? Math.ceil((storedCredentials.lockedUntil.getTime() - Date.now()) / 60000)
        : 0;
      throw new Error(`Account is locked. Try again in ${lockDuration} minutes`);
    }

    // Verify password
    const isPasswordValid = await this.passwordService.verify(
      data.password,
      storedCredentials.passwordHash
    );

    if (!isPasswordValid) {
      storedCredentials.incrementFailedLogins();
      throw new Error('Invalid email or password');
    }

    // Reset failed login attempts
    storedCredentials.resetFailedLogins();

    // Generate tokens
    const tokens = this.tokenService.generateTokenPair({
      userId: storedUser.id,
      email: storedUser.email,
      role: userRole,
      permissions: userPermissions,
    });

    return { user: storedUser, tokens };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    storedUser: User,
    userRole: UserRole,
    userPermissions: string[]
  ): Promise<TokenPair> {
    // Verify refresh token
    const payload = this.tokenService.verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new Error('Invalid token type. Expected refresh token');
    }

    if (payload.userId !== storedUser.id) {
      throw new Error('Token user mismatch');
    }

    // Check if user is still active
    if (!storedUser.isActive) {
      throw new Error('Account is deactivated');
    }

    // Generate new token pair (implements token rotation)
    const tokens = this.tokenService.generateTokenPair({
      userId: storedUser.id,
      email: storedUser.email,
      role: userRole,
      permissions: userPermissions,
    });

    return tokens;
  }

  /**
   * Start impersonation session
   * Admin can impersonate non-admin users
   */
  startImpersonation(
    impersonatorId: string,
    impersonatorRole: UserRole,
    targetUser: User,
    targetRole: UserRole,
    targetPermissions: string[],
    reason: string,
    durationMinutes: number = 60
  ): string {
    // Validate impersonator permissions
    if (impersonatorRole !== UserRole.SUPER_ADMIN && impersonatorRole !== UserRole.ADMIN) {
      throw new Error('Only admins can impersonate users');
    }

    // Cannot impersonate admin users
    if (targetRole === UserRole.SUPER_ADMIN || targetRole === UserRole.ADMIN) {
      throw new Error('Cannot impersonate admin users');
    }

    // Cannot impersonate inactive users
    if (!targetUser.isActive) {
      throw new Error('Cannot impersonate inactive user');
    }

    // Validate duration
    if (durationMinutes <= 0 || durationMinutes > 240) {
      throw new Error('Impersonation duration must be between 1 and 240 minutes');
    }

    // Validate reason
    if (!reason || reason.length < 10) {
      throw new Error('Impersonation reason must be at least 10 characters');
    }

    // Generate impersonation token
    const impersonationToken = this.tokenService.generateImpersonationToken(
      { id: impersonatorId, role: impersonatorRole },
      {
        userId: targetUser.id,
        email: targetUser.email,
        role: targetRole,
        permissions: targetPermissions,
      },
      reason,
      durationMinutes
    );

    return impersonationToken;
  }

  /**
   * Verify impersonation token and extract details
   */
  verifyImpersonation(token: string) {
    const payload = this.tokenService.verifyToken(token);

    if (payload.type !== 'impersonation') {
      throw new Error('Invalid token type. Expected impersonation token');
    }

    return payload;
  }

  /**
   * Logout (client-side token removal)
   * For stateless JWT, actual revocation requires token blacklist
   */
  async logout(userId: string, tokenId: string): Promise<void> {
    // In production, add to token blacklist/revocation list
    // This is a placeholder for the repository call
    console.log(`User ${userId} logged out. Token ${tokenId} should be blacklisted.`);
  }

  /**
   * Get default permissions for role
   */
  private getDefaultPermissions(role: UserRole): string[] {
    const permissionMap: Record<UserRole, string[]> = {
      [UserRole.SUPER_ADMIN]: [
        'users:read',
        'users:write',
        'users:delete',
        'sellers:read',
        'sellers:write',
        'sellers:verify',
        'products:read',
        'orders:read',
        'audit:read',
        'impersonate:start',
      ],
      [UserRole.ADMIN]: [
        'users:read',
        'sellers:read',
        'sellers:verify',
        'products:read',
        'orders:read',
        'audit:read',
        'impersonate:start',
      ],
      [UserRole.SELLER]: [
        'products:read',
        'products:write',
        'orders:read',
        'seller:profile:write',
      ],
      [UserRole.CUSTOMER]: [
        'products:read',
        'cart:write',
        'orders:write',
        'orders:read',
        'profile:write',
      ],
    };

    return permissionMap[role] || [];
  }

  /**
   * Generate unique ID (in production, use UUID library)
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
