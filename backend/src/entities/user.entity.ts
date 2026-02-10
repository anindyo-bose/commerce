/**
 * Domain User Entity
 * Clean Architecture: Pure domain entity with no external dependencies
 * No ORM decorators - those belong in the infrastructure layer
 */

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  SELLER = 'SELLER',
  CUSTOMER = 'CUSTOMER',
}

export class User {
  constructor(
    public readonly id: string,
    public email: string,
    public emailNormalized: string,
    public phone: string,
    public firstName: string,
    public lastName: string | null = null,
    public isActive: boolean = true,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  getFullName(): string {
    return this.lastName ? `${this.firstName} ${this.lastName}` : this.firstName;
  }

  isEmailVerified(): boolean {
    return this.emailNormalized === this.email.toLowerCase();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }
}

export class UserCredentials {
  constructor(
    public readonly userId: string,
    public passwordHash: string,
    public failedLoginAttempts: number = 0,
    public lockedUntil: Date | null = null,
    public twoFactorEnabled: boolean = false,
    public twoFactorSecret: string | null = null
  ) {}

  isLocked(): boolean {
    if (!this.lockedUntil) return false;
    return new Date() < this.lockedUntil;
  }

  incrementFailedLogins(): void {
    this.failedLoginAttempts++;
    if (this.failedLoginAttempts >= 5) {
      // Lock for 15 minutes after 5 failed attempts
      this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }

  resetFailedLogins(): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
  }
}

export class UserPII {
  constructor(
    public readonly userId: string,
    public emailEncrypted: string,
    public phoneEncrypted: string,
    public addressEncrypted: string | null = null,
    public emailIv: string,
    public phoneIv: string,
    public addressIv: string | null = null
  ) {}
}
