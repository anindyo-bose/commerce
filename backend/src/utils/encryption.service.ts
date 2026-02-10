/**
 * Encryption Service
 * Implements AES-256-GCM encryption for PII data
 * Per SECURITY.md - field-level encryption with unique IVs
 */

import crypto from 'crypto';
import { pbkdf2Sync } from 'crypto';

export interface EncryptionResult {
  encrypted: string;
  iv: string;
  authTag: string;
}

export interface DecryptionInput {
  encrypted: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private readonly iterations = 100000;

  constructor(private readonly masterKey: string) {
    if (!masterKey || masterKey.length < 12) {
      throw new Error('Master key must be at least 12 characters');
    }
  }

  /**
   * Derive encryption key from master key using PBKDF2
   */
  private deriveKey(salt: string): Buffer {
    return pbkdf2Sync(
      this.masterKey,
      salt,
      this.iterations,
      this.keyLength,
      'sha512'
    );
  }

  /**
   * Encrypt plaintext data
   * @param plaintext - Data to encrypt
   * @returns Encryption result with encrypted data, IV, and auth tag
   */
  encrypt(plaintext: string): EncryptionResult {
    // Generate random IV (unique per encryption)
    const iv = crypto.randomBytes(this.ivLength);
    
    // Generate random salt for key derivation
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(salt.toString('hex'));

    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted: `${salt.toString('hex')}:${encrypted}`,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /**
   * Decrypt encrypted data
   * @param input - Decryption input containing encrypted data, IV, and auth tag
   * @returns Decrypted plaintext
   */
  decrypt(input: DecryptionInput): string {
    try {
      // Extract salt and encrypted data
      const [salt, encrypted] = input.encrypted.split(':');
      
      if (!salt || !encrypted) {
        throw new Error('Invalid encrypted data format');
      }

      // Derive same key using stored salt
      const key = this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        key,
        Buffer.from(input.iv, 'hex')
      );

      // Set authentication tag
      decipher.setAuthTag(Buffer.from(input.authTag, 'hex'));

      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: Data may have been tampered with');
    }
  }

  /**
   * Create a hash for searchable encrypted fields
   * Used for email/phone lookups
   */
  createSearchableHash(value: string): string {
    return crypto
      .createHash('sha256')
      .update(value.toLowerCase())
      .digest('hex');
  }

  /**
   * Mask PII for display during impersonation
   */
  maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    
    const maskedLocal = local.length > 2
      ? `${local[0]}***${local[local.length - 1]}`
      : `${local[0]}***`;
    
    return `${maskedLocal}@${domain}`;
  }

  maskPhone(phone: string): string {
    // Show only last 2 digits: +91-9***-****10
    if (phone.length < 4) return '***';
    
    const lastTwo = phone.slice(-2);
    const prefix = phone.startsWith('+') ? phone.slice(0, 3) : '';
    
    return `${prefix}-9***-****${lastTwo}`;
  }

  maskAddress(address: string): string {
    // Show only first line
    const lines = address.split('\n');
    return lines[0] || address.substring(0, 20);
  }

  maskGSTIN(gstin: string): string {
    // Show only first 2 and last 1 characters: 27AAAP****Z0
    if (gstin.length < 10) return gstin;
    
    return `${gstin.substring(0, 5)}****${gstin.substring(gstin.length - 2)}`;
  }
}
