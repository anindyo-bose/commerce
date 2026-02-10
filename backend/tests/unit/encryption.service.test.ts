/**
 * Encryption Service Tests
 * Per TESTING.md - Mandatory 100% coverage for encryption
 * Tests encrypt/decrypt roundtrip, tampering detection, unique IVs
 */

import { EncryptionService } from '../src/utils/encryption.service';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;
  const masterKey = 'test-master-key-at-least-12-chars';

  beforeEach(() => {
    encryptionService = new EncryptionService(masterKey);
  });

  describe('constructor', () => {
    it('should create instance with valid master key', () => {
      expect(encryptionService).toBeInstanceOf(EncryptionService);
    });

    it('should throw error if master key is too short', () => {
      expect(() => {
        new EncryptionService('short');
      }).toThrow('Master key must be at least 12 characters');
    });

    it('should throw error if master key is empty', () => {
      expect(() => {
        new EncryptionService('');
      }).toThrow('Master key must be at least 12 characters');
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt plaintext correctly', () => {
      const plaintext = 'sensitive-email@example.com';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different encrypted output for same plaintext (unique IV)', () => {
      const plaintext = 'test@example.com';
      
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);
      
      // Different encrypted values
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
      
      // Different IVs
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      
      // Different auth tags
      expect(encrypted1.authTag).not.toBe(encrypted2.authTag);
      
      // But both decrypt to same value
      expect(encryptionService.decrypt(encrypted1)).toBe(plaintext);
      expect(encryptionService.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should encrypt and decrypt empty string', () => {
      const plaintext = '';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt unicode characters', () => {
      const plaintext = '你好世界 🌍 مرحبا';
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt long text', () => {
      const plaintext = 'A'.repeat(10000);
      
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('tampering detection', () => {
    it('should throw error if encrypted data is tampered', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      
      // Tamper with encrypted data
      const tampered = {
        ...encrypted,
        encrypted: encrypted.encrypted.substring(0, encrypted.encrypted.length - 2) + '00',
      };
      
      expect(() => {
        encryptionService.decrypt(tampered);
      }).toThrow('Decryption failed');
    });

    it('should throw error if IV is tampered', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      
      // Tamper with IV
      const tampered = {
        ...encrypted,
        iv: encrypted.iv.substring(0, encrypted.iv.length - 2) + '00',
      };
      
      expect(() => {
        encryptionService.decrypt(tampered);
      }).toThrow('Decryption failed');
    });

    it('should throw error if auth tag is tampered', () => {
      const plaintext = 'test@example.com';
      const encrypted = encryptionService.encrypt(plaintext);
      
      // Tamper with auth tag
      const tampered = {
        ...encrypted,
        authTag: encrypted.authTag.substring(0, encrypted.authTag.length - 2) + '00',
      };
      
      expect(() => {
        encryptionService.decrypt(tampered);
      }).toThrow('Decryption failed');
    });

    it('should throw error if encrypted data format is invalid', () => {
      expect(() => {
        encryptionService.decrypt({
          encrypted: 'invalid-format-no-colon',
          iv: '0123456789abcdef',
          authTag: '0123456789abcdef',
        });
      }).toThrow('Invalid encrypted data format');
    });
  });

  describe('createSearchableHash', () => {
    it('should create consistent hash for same input', () => {
      const input = 'test@example.com';
      
      const hash1 = encryptionService.createSearchableHash(input);
      const hash2 = encryptionService.createSearchableHash(input);
      
      expect(hash1).toBe(hash2);
    });

    it('should create different hashes for different inputs', () => {
      const hash1 = encryptionService.createSearchableHash('test1@example.com');
      const hash2 = encryptionService.createSearchableHash('test2@example.com');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should be case-insensitive', () => {
      const hash1 = encryptionService.createSearchableHash('Test@Example.COM');
      const hash2 = encryptionService.createSearchableHash('test@example.com');
      
      expect(hash1).toBe(hash2);
    });

    it('should produce 64-character hex hash (SHA-256)', () => {
      const hash = encryptionService.createSearchableHash('test@example.com');
      
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('PII masking', () => {
    describe('maskEmail', () => {
      it('should mask email correctly', () => {
        expect(encryptionService.maskEmail('john@example.com')).toBe('j***n@example.com');
      });

      it('should mask short email', () => {
        expect(encryptionService.maskEmail('ab@test.com')).toBe('a***@test.com');
      });

      it('should mask single character email', () => {
        expect(encryptionService.maskEmail('a@test.com')).toBe('a***@test.com');
      });

      it('should handle email without domain gracefully', () => {
        expect(encryptionService.maskEmail('invalid-email')).toBe('invalid-email');
      });
    });

    describe('maskPhone', () => {
      it('should mask phone correctly', () => {
        expect(encryptionService.maskPhone('+919876543210')).toBe('+91-9***-****10');
      });

      it('should mask phone without country code', () => {
        expect(encryptionService.maskPhone('9876543210')).toBe('-9***-****10');
      });

      it('should mask short phone', () => {
        expect(encryptionService.maskPhone('123')).toBe('***');
      });
    });

    describe('maskAddress', () => {
      it('should show only first line of address', () => {
        const address = '123 Main Street\nApt 4B\nNew York, NY 10001';
        expect(encryptionService.maskAddress(address)).toBe('123 Main Street');
      });

      it('should handle single line address', () => {
        const address = '123 Main Street';
        expect(encryptionService.maskAddress(address)).toBe('123 Main Street');
      });

      it('should limit very long single line addresses', () => {
        const address = 'A'.repeat(100);
        const masked = encryptionService.maskAddress(address);
        expect(masked).toHaveLength(20);
      });
    });

    describe('maskGSTIN', () => {
      it('should mask GSTIN correctly', () => {
        expect(encryptionService.maskGSTIN('27AAAPZ1234C1Z0')).toBe('27AAA****Z0');
      });

      it('should handle short GSTIN', () => {
        const short = '12345';
        expect(encryptionService.maskGSTIN(short)).toBe(short);
      });

      it('should mask standard 15-digit GSTIN', () => {
        const gstin = '09AAACH7409R1ZZ';
        const masked = encryptionService.maskGSTIN(gstin);
        expect(masked).toBe('09AAA****ZZ');
      });
    });
  });
});
