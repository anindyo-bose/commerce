/**
 * JWT Token Service
 * Handles JWT generation, verification, and refresh token rotation
 * Per SECURITY.md - Access tokens (15 min) + Refresh tokens (7 days)
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  type: 'access' | 'refresh' | 'impersonation';
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface ImpersonationTokenPayload extends TokenPayload {
  impersonatorId: string;
  impersonatorRole: string;
  reason: string;
  expiresInMinutes: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class TokenService {
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '7d';
  private readonly impersonationMaxMinutes = 240; // 4 hours

  constructor(
    private readonly jwtSecret: string,
    private readonly issuer: string = 'commerce-api'
  ) {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }
  }

  /**
   * Generate access and refresh token pair
   */
  generateTokenPair(payload: Omit<TokenPayload, 'type' | 'iat' | 'exp' | 'jti'>): TokenPair {
    const tokenId = crypto.randomBytes(16).toString('hex');

    // Access token (short-lived)
    const accessToken = jwt.sign(
      {
        ...payload,
        type: 'access',
        aud: 'frontend',
      },
      this.jwtSecret,
      {
        expiresIn: this.accessTokenExpiry,
        issuer: this.issuer,
        jwtid: tokenId,
      }
    );

    // Refresh token (long-lived)
    const refreshToken = jwt.sign(
      {
        userId: payload.userId,
        email: payload.email,
        type: 'refresh',
      },
      this.jwtSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: this.issuer,
        jwtid: `refresh_${tokenId}`,
      }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Generate impersonation token
   * Time-bound with audit trail
   */
  generateImpersonationToken(
    impersonator: { id: string; role: string },
    target: { userId: string; email: string; role: string; permissions: string[] },
    reason: string,
    durationMinutes: number = 60
  ): string {
    if (durationMinutes > this.impersonationMaxMinutes) {
      throw new Error(`Impersonation duration cannot exceed ${this.impersonationMaxMinutes} minutes`);
    }

    if (impersonator.role !== 'SUPER_ADMIN' && impersonator.role !== 'ADMIN') {
      throw new Error('Only admins can impersonate users');
    }

    if (target.role === 'SUPER_ADMIN' || target.role === 'ADMIN') {
      throw new Error('Cannot impersonate admin users');
    }

    const payload: ImpersonationTokenPayload = {
      userId: target.userId,
      email: target.email,
      role: target.role,
      permissions: target.permissions,
      type: 'impersonation',
      impersonatorId: impersonator.id,
      impersonatorRole: impersonator.role,
      reason,
      expiresInMinutes: durationMinutes,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: `${durationMinutes}m`,
      issuer: this.issuer,
      jwtid: `impersonate_${crypto.randomBytes(16).toString('hex')}`,
    });
  }

  /**
   * Verify and decode token
   */
  verifyToken<T = TokenPayload>(token: string): T {
    try {
      return jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
      }) as T;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }
      throw new Error('Token verification failed');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  decodeToken(token: string): TokenPayload | null {
    try {
      return jwt.decode(token) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired (without throwing)
   */
  isTokenExpired(token: string): boolean {
    try {
      this.verifyToken(token);
      return false;
    } catch (error) {
      if (error instanceof Error && error.message === 'Token has expired') {
        return true;
      }
      return false;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }
}
