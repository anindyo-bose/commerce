import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { UserRepository } from '../repositories/user.repository';
import { EncryptionService } from '../services/encryption.service';
import { PasswordService } from '../services/password.service';

describe('UserRepository', () => {
  let userRepo: UserRepository;
  let dataSource: any;
  let encryptionService: jest.Mocked<EncryptionService>;
  let passwordService: jest.Mocked<PasswordService>;

  beforeEach(() => {
    dataSource = createMockDataSource();
    encryptionService = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      searchableHash: jest.fn(),
      maskPII: jest.fn(),
    } as any;
    passwordService = {
      hash: jest.fn(),
      verify: jest.fn(),
    } as any;

    userRepo = new UserRepository(dataSource, encryptionService, passwordService);
  });

  describe('create', () => {
    it('should create user with encrypted PII', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        fullName: 'Test User',
        phoneNumber: '+919876543210',
      };

      const hashedPassword = 'hashed_password';
      const encryptedEmail = { encrypted: 'encrypted_email', iv: 'iv_email' };
      const encryptedPhone = { encrypted: 'encrypted_phone', iv: 'iv_phone' };
      const emailHash = 'email_hash_123';

      passwordService.hash.mockResolvedValue(hashedPassword);
      encryptionService.encrypt.mockReturnValueOnce(encryptedEmail);
      encryptionService.encrypt.mockReturnValueOnce(encryptedPhone);
      encryptionService.searchableHash.mockReturnValue(emailHash);

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.insert.mockResolvedValue({
        identifiers: [{ id: 'user-123' }],
      });

      const user = await userRepo.create(userData);

      expect(passwordService.hash).toHaveBeenCalledWith(userData.password);
      expect(encryptionService.encrypt).toHaveBeenCalledWith(userData.email);
      expect(encryptionService.encrypt).toHaveBeenCalledWith(userData.phoneNumber);
      expect(encryptionService.searchableHash).toHaveBeenCalledWith(
        userData.email.toLowerCase()
      );

      // Verify user creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'users',
        expect.objectContaining({ full_name: userData.fullName })
      );

      // Verify credentials creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'user_credentials',
        expect.objectContaining({ password_hash: hashedPassword })
      );

      // Verify PII encryption
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'user_pii',
        expect.objectContaining({
          email_encrypted: encryptedEmail.encrypted,
          email_hash: emailHash,
        })
      );

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password',
        fullName: 'Test User',
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.insert.mockRejectedValue(new Error('DB error'));

      await expect(userRepo.create(userData)).rejects.toThrow('DB error');
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email using searchable hash', async () => {
      const email = 'test@example.com';
      const emailHash = 'email_hash_123';
      const encryptedEmail = 'encrypted_email';
      const encryptedPhone = 'encrypted_phone';

      encryptionService.searchableHash.mockReturnValue(emailHash);
      encryptionService.decrypt.mockReturnValueOnce(email);
      encryptionService.decrypt.mockReturnValueOnce('+919876543210');

      const mockPII = {
        user_id: 'user-123',
        email_encrypted: encryptedEmail,
        email_iv: 'iv_email',
        phone_encrypted: encryptedPhone,
        phone_iv: 'iv_phone',
      };

      const mockUser = {
        id: 'user-123',
        full_name: 'Test User',
        is_active: true,
        created_at: new Date(),
      };

      const piiRepo = dataSource.getRepository('user_pii');
      const userRepo = dataSource.getRepository('users');

      piiRepo.findOne.mockResolvedValue(mockPII);
      userRepo.findOne.mockResolvedValue(mockUser);

      const user = await userRepo.findByEmail(email);

      expect(encryptionService.searchableHash).toHaveBeenCalledWith(
        email.toLowerCase()
      );
      expect(piiRepo.findOne).toHaveBeenCalledWith({
        where: { email_hash: emailHash },
      });
      expect(user.email).toBe(email);
    });

    it('should return null if user not found', async () => {
      encryptionService.searchableHash.mockReturnValue('hash');
      const piiRepo = dataSource.getRepository('user_pii');
      piiRepo.findOne.mockResolvedValue(null);

      const user = await userRepo.findByEmail('nonexistent@example.com');

      expect(user).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const userId = 'user-123';
      const password = 'CorrectPassword123!';
      const passwordHash = 'hashed_password';

      const mockCredentials = {
        user_id: userId,
        password_hash: passwordHash,
        failed_login_attempts: 0,
      };

      const credRepo = dataSource.getRepository('user_credentials');
      credRepo.findOne.mockResolvedValue(mockCredentials);
      passwordService.verify.mockResolvedValue(true);

      const result = await userRepo.verifyPassword(userId, password);

      expect(passwordService.verify).toHaveBeenCalledWith(
        password,
        passwordHash
      );
      expect(result).toBe(true);

      // Should reset failed attempts
      expect(credRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({ failed_login_attempts: 0 })
      );
    });

    it('should increment failed attempts on wrong password', async () => {
      const userId = 'user-123';
      const password = 'WrongPassword';

      const mockCredentials = {
        user_id: userId,
        password_hash: 'hashed_password',
        failed_login_attempts: 2,
      };

      const credRepo = dataSource.getRepository('user_credentials');
      credRepo.findOne.mockResolvedValue(mockCredentials);
      passwordService.verify.mockResolvedValue(false);

      const result = await userRepo.verifyPassword(userId, password);

      expect(result).toBe(false);
      expect(credRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({ failed_login_attempts: 3 })
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      const userId = 'user-123';
      const mockCredentials = {
        user_id: userId,
        password_hash: 'hashed_password',
        failed_login_attempts: 4,
      };

      const credRepo = dataSource.getRepository('user_credentials');
      const userRepo = dataSource.getRepository('users');

      credRepo.findOne.mockResolvedValue(mockCredentials);
      passwordService.verify.mockResolvedValue(false);

      await userRepo.verifyPassword(userId, 'WrongPassword');

      // Should lock account
      expect(userRepo.update).toHaveBeenCalledWith(
        { id: userId },
        expect.objectContaining({ is_locked: true })
      );
    });
  });

  describe('getPermissions', () => {
    it('should load user permissions via SQL join', async () => {
      const userId = 'user-123';
      const mockPermissions = [
        { policy_name: 'product:read' },
        { policy_name: 'cart:write' },
        { policy_name: 'order:read' },
      ];

      dataSource.query.mockResolvedValue(mockPermissions);

      const permissions = await userRepo.getPermissions(userId);

      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN user_roles'),
        [userId]
      );
      expect(permissions).toEqual(['product:read', 'cart:write', 'order:read']);
    });

    it('should return empty array if no permissions', async () => {
      dataSource.query.mockResolvedValue([]);

      const permissions = await userRepo.getPermissions('user-123');

      expect(permissions).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update user profile', async () => {
      const userId = 'user-123';
      const updateData = {
        fullName: 'Updated Name',
        phoneNumber: '+919999999999',
      };

      const user = await userRepo.update(userId, updateData);

      const userRepoMock = dataSource.getRepository('users');
      expect(userRepoMock.update).toHaveBeenCalledWith(
        { id: userId },
        expect.objectContaining({ full_name: updateData.fullName })
      );
    });

    it('should re-encrypt PII on update', async () => {
      const userId = 'user-123';
      const updateData = {
        email: 'newemail@example.com',
      };

      const encryptedEmail = { encrypted: 'new_encrypted', iv: 'new_iv' };
      encryptionService.encrypt.mockReturnValue(encryptedEmail);
      encryptionService.searchableHash.mockReturnValue('new_hash');

      await userRepo.update(userId, updateData);

      const piiRepo = dataSource.getRepository('user_pii');
      expect(piiRepo.update).toHaveBeenCalledWith(
        { user_id: userId },
        expect.objectContaining({
          email_encrypted: encryptedEmail.encrypted,
        })
      );
    });
  });
});

function createMockDataSource() {
  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    })),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      insert: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    },
  };

  return {
    getRepository: jest.fn(() => mockRepository),
    createQueryRunner: jest.fn(() => mockQueryRunner),
    query: jest.fn(),
  };
}
