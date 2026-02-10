/**
 * Application Configuration
 * Centralized configuration management
 */

export interface AppConfig {
  // Server
  port: number;
  nodeEnv: string;
  apiVersion: string;

  // Database
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl: boolean;
  };

  // Security
  security: {
    encryptionMasterKey: string;
    jwtSecret: string;
    jwtAccessExpiry: string;
    jwtRefreshExpiry: string;
    bcryptRounds: number;
  };

  // Rate Limiting
  rateLimit: {
    globalMax: number;
    globalWindowMs: number;
    loginMax: number;
    loginWindowMs: number;
  };

  // CORS
  cors: {
    origin: string[];
    credentials: boolean;
  };

  // Features
  features: {
    impersonationEnabled: boolean;
    maxImpersonationMinutes: number;
  };
}

export class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validate();
  }

  private loadConfig(): AppConfig {
    return {
      port: parseInt(process.env.PORT || '3001', 10),
      nodeEnv:process.env.NODE_ENV || 'development',
      apiVersion: process.env.API_VERSION || 'v1',

      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'commerce',
        ssl: process.env.DB_SSL === 'true',
      },

      security: {
        encryptionMasterKey: process.env.ENCRYPTION_MASTER_KEY || '',
        jwtSecret: process.env.JWT_SECRET || '',
        jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
        jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
      },

      rateLimit: {
        globalMax: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '1000', 10),
        globalWindowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10),
        loginMax: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
        loginWindowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || '900000', 10),
      },

      cors: {
        origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
        credentials: process.env.CORS_CREDENTIALS === 'true',
      },

      features: {
        impersonationEnabled: process.env.FEATURE_IMPERSONATION !== 'false',
        maxImpersonationMinutes: parseInt(process.env.MAX_IMPERSONATION_MINUTES || '240', 10),
      },
    };
  }

  private validate(): void {
    const errors: string[] = [];

    // Validate critical secrets
    if (this.config.nodeEnv === 'production') {
      if (!this.config.security.encryptionMasterKey || this.config.security.encryptionMasterKey.length < 12) {
        errors.push('ENCRYPTION_MASTER_KEY must be at least 12 characters in production');
      }

      if (!this.config.security.jwtSecret || this.config.security.jwtSecret.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters in production');
      }

      if (this.config.database.password === 'postgres') {
        errors.push('DB_PASSWORD must be changed from default in production');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  get(): AppConfig {
    return this.config;
  }

  isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }
}
