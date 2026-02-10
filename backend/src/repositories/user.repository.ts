import { DataSource, Repository } from 'typeorm';
import { User, UserCredentials, UserPII } from '../entities/user.entity';
import { EncryptionService } from '../utils/encryption.service';
import { PasswordService } from '../utils/password.service';

export class UserRepository {
  private userRepo: Repository<any>;
  private credsRepo: Repository<any>;
  private piiRepo: Repository<any>;
  private encryption: EncryptionService;
  private password: PasswordService;

  constructor(private dataSource: DataSource) {
    this.userRepo = dataSource.getRepository('users');
    this.credsRepo = dataSource.getRepository('user_credentials');
    this.piiRepo = dataSource.getRepository('user_pii');
    this.encryption = new EncryptionService();
    this.password = new PasswordService();
  }

  /**
   * Create new user with encrypted PII
   */
  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roleId?: string;
  }): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Hash password
      const passwordHash = await this.password.hash(data.password);

      // 2. Create user record
      const user = await queryRunner.manager.insert('users', {
        email: data.email.toLowerCase(),
        first_name: data.firstName,
        last_name: data.lastName,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const userId = user.identifiers[0].id;

      // 3. Create credentials
      await queryRunner.manager.insert('user_credentials', {
        user_id: userId,
        password_hash: passwordHash,
        failed_login_attempts: 0,
        is_locked: false,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 4. Encrypt and store PII
      const encryptedEmail = this.encryption.encrypt(data.email);
      const encryptedPhone = data.phone ? this.encryption.encrypt(data.phone) : null;

      await queryRunner.manager.insert('user_pii', {
        user_id: userId,
        email_encrypted: encryptedEmail.encrypted,
        email_iv: encryptedEmail.iv,
        email_hash: this.encryption.searchableHash(data.email),
        phone_encrypted: encryptedPhone?.encrypted,
        phone_iv: encryptedPhone?.iv,
        phone_hash: data.phone ? this.encryption.searchableHash(data.phone) : null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      // 5. Assign role (default: CUSTOMER)
      const roleId = data.roleId || (await this.getCustomerRoleId(queryRunner));
      await queryRunner.manager.insert('user_roles', {
        user_id: userId,
        role_id: roleId,
        assigned_at: new Date(),
      });

      await queryRunner.commitTransaction();

      return this.findById(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['credentials', 'pii', 'roles'],
    });

    if (!user) return null;

    return this.mapToEntity(user);
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const emailHash = this.encryption.searchableHash(email.toLowerCase());
    
    const pii = await this.piiRepo.findOne({
      where: { email_hash: emailHash },
      relations: ['user'],
    });

    if (!pii) return null;

    return this.findById(pii.user_id);
  }

  /**
   * Verify password and update login attempts
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    const creds = await this.credsRepo.findOne({
      where: { user_id: userId },
    });

    if (!creds) return false;
    if (creds.is_locked) throw new Error('Account is locked');

    const isValid = await this.password.verify(password, creds.password_hash);

    if (!isValid) {
      // Increment failed attempts
      await this.credsRepo.update(
        { user_id: userId },
        {
          failed_login_attempts: () => 'failed_login_attempts + 1',
          is_locked: creds.failed_login_attempts + 1 >= 5,
          updated_at: new Date(),
        }
      );
      return false;
    }

    // Reset failed attempts on success
    await this.credsRepo.update(
      { user_id: userId },
      {
        failed_login_attempts: 0,
        last_login_at: new Date(),
        updated_at: new Date(),
      }
    );

    return true;
  }

  /**
   * Get user permissions
   */
  async getPermissions(userId: string): Promise<string[]> {
    const result = await this.dataSource.query(
      `
      SELECT DISTINCT p.policy_name
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1
      `,
      [userId]
    );

    return result.map((r: any) => r.policy_name);
  }

  /**
   * Update user profile
   */
  async update(
    userId: string,
    data: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
    }>
  ): Promise<User> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update user table
      if (data.firstName || data.lastName) {
        await queryRunner.manager.update(
          'users',
          { id: userId },
          {
            first_name: data.firstName,
            last_name: data.lastName,
            updated_at: new Date(),
          }
        );
      }

      // Update encrypted PII
      if (data.phone) {
        const encryptedPhone = this.encryption.encrypt(data.phone);
        await queryRunner.manager.update(
          'user_pii',
          { user_id: userId },
          {
            phone_encrypted: encryptedPhone.encrypted,
            phone_iv: encryptedPhone.iv,
            phone_hash: this.encryption.searchableHash(data.phone),
            updated_at: new Date(),
          }
        );
      }

      await queryRunner.commitTransaction();
      return this.findById(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivate(userId: string): Promise<void> {
    await this.userRepo.update({ id: userId }, { is_active: false, updated_at: new Date() });
  }

  /**
   * List users with pagination
   */
  async list(params: {
    page: number;
    limit: number;
    search?: string;
    role?: string;
  }): Promise<{ items: User[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.userRepo.createQueryBuilder('u')
      .leftJoinAndSelect('u.roles', 'r')
      .skip(offset)
      .take(params.limit);

    if (params.search) {
      query = query.where('u.email ILIKE :search OR u.first_name ILIKE :search OR u.last_name ILIKE :search', {
        search: `%${params.search}%`,
      });
    }

    if (params.role) {
      query = query.andWhere('r.name = :role', { role: params.role });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: await Promise.all(items.map(u => this.mapToEntity(u))),
      total,
    };
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string): Promise<void> {
    await this.dataSource.manager.insert('user_roles', {
      user_id: userId,
      role_id: roleId,
      assigned_at: new Date(),
    });
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: any): User {
    const user = new User(
      row.id,
      row.email,
      row.first_name,
      row.last_name
    );

    user.isActive = row.is_active;
    user.createdAt = row.created_at;
    user.updatedAt = row.updated_at;

    if (row.pii) {
      user.pii = new UserPII(
        this.encryption.decrypt(row.pii.email_encrypted, row.pii.email_iv),
        row.pii.phone_encrypted
          ? this.encryption.decrypt(row.pii.phone_encrypted, row.pii.phone_iv)
          : undefined
      );
    }

    return user;
  }

  /**
   * Get CUSTOMER role ID
   */
  private async getCustomerRoleId(queryRunner: any): Promise<string> {
    const result = await queryRunner.manager.findOne('roles', {
      where: { name: 'CUSTOMER' },
    });
    return result.id;
  }
}
