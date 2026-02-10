/**
 * Password Service
 * Handles password hashing and verification using bcrypt
 * Per SECURITY.md - bcrypt with 12 rounds
 */

import bcrypt from 'bcrypt';

export class PasswordService {
  private readonly saltRounds = 12;

  /**
   * Hash a password using bcrypt
   * @param password - Plain text password
   * @returns Hashed password
   */
  async hash(password: string): Promise<string> {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Verify a password against a hash
   * @param password - Plain text password
   * @param hash - Stored password hash
   * @returns True if password matches
   */
  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate password strength
   * Must contain: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
   */
  validateStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
