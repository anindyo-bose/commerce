/**
 * Main Application Entry Point
 * Express.js server with all middleware and routes
 */

import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ConfigService } from './config/app.config';
import { TokenService } from './utils/token.service';
import { PasswordService } from './utils/password.service';
import { EncryptionService } from './utils/encryption.service';
import { TaxService } from './services/tax.service';
import { AuthService } from './services/auth.service';
import { RBACGuard } from './guards/rbac.guard';
import { RateLimitMiddleware } from './middleware/rate-limit.middleware';
import { ErrorHandler } from './middleware/error-handler.middleware';
import { AuditLogger } from './middleware/audit-log.middleware';
import { ValidationMiddleware } from './middleware/validation.middleware';
import { AuthController } from './controllers/auth.controller';
import { ProductController } from './controllers/product.controller';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  impersonateSchema,
  createProductSchema,
  updateProductSchema,
  productFilterSchema,
} from './utils/validation.schemas';

export class App {
  private app: Application;
  private config: ConfigService;
  
  // Services
  private tokenService: TokenService;
  private passwordService: PasswordService;
  private encryptionService: EncryptionService;
  private taxService: TaxService;
  private authService: AuthService;

  // Guards & Middleware
  private rbacGuard: RBACGuard;
  private rateLimiter: RateLimitMiddleware;
  private errorHandler: ErrorHandler;
  private auditLogger: AuditLogger;
  private validator: ValidationMiddleware;

  // Controllers
  private authController: AuthController;
  private productController: ProductController;

  constructor() {
    this.app = express();
    this.config = new ConfigService();

    // Initialize services
    this.initializeServices();

    // Setup middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();

    // Setup error handling
    this.setupErrorHandling();
  }

  private initializeServices(): void {
    const appConfig = this.config.get();

    // Utility services
    this.tokenService = new TokenService(appConfig.security.jwtSecret);
    this.passwordService = new PasswordService();
    this.encryptionService = new EncryptionService(appConfig.security.encryptionMasterKey);
    this.taxService = new TaxService();

    // Business services
    this.authService = new AuthService(
      this.passwordService,
      this.tokenService,
      this.encryptionService
    );

    // Guards & Middleware
    this.rbacGuard = new RBACGuard(this.tokenService);
    this.rateLimiter = new RateLimitMiddleware();
    this.errorHandler = new ErrorHandler();
    this.auditLogger = new AuditLogger();
    this.validator = new ValidationMiddleware();

    // Controllers
    this.authController = new AuthController(this.authService);
    this.productController = new ProductController(this.taxService);
  }

  private setupMiddleware(): void {
    const appConfig = this.config.get();

    // Security headers
    this.app.use(helmet());

    // CORS
    this.app.use(
      cors({
        origin: appConfig.cors.origin,
        credentials: appConfig.cors.credentials,
      })
    );

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Global rate limiting
    this.app.use(this.rateLimiter.globalLimiter());

    // Audit logging
    this.app.use(this.auditLogger.logRequest());

    // Health check (no middleware)
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: appConfig.apiVersion,
      });
    });
  }

  private setupRoutes(): void {
    const router = express.Router();
    const apiVersion = this.config.get().apiVersion;

    // ==================
    // Auth Routes
    // ==================
    router.post(
      '/auth/register',
      this.validator.validateBody(registerSchema),
      this.errorHandler.asyncHandler(this.authController.register.bind(this.authController))
    );

    router.post(
      '/auth/login',
      this.rateLimiter.loginLimiter(),
      this.validator.validateBody(loginSchema),
      this.errorHandler.asyncHandler(this.authController.login.bind(this.authController))
    );

    router.post(
      '/auth/refresh',
      this.validator.validateBody(refreshTokenSchema),
      this.errorHandler.asyncHandler(this.authController.refreshToken.bind(this.authController))
    );

    router.post(
      '/auth/logout',
      this.rbacGuard.authenticate(),
      this.errorHandler.asyncHandler(this.authController.logout.bind(this.authController))
    );

    router.post(
      '/auth/impersonate/start',
      this.rbacGuard.authenticate(),
      this.rbacGuard.requireRole('SUPER_ADMIN', 'ADMIN'),
      this.rbacGuard.blockImpersonation(), // Cannot impersonate while already impersonating
      this.validator.validateBody(impersonateSchema),
      this.errorHandler.asyncHandler(this.authController.startImpersonation.bind(this.authController))
    );

    router.post(
      '/auth/impersonate/end',
      this.rbacGuard.authenticate(),
      this.errorHandler.asyncHandler(this.authController.endImpersonation.bind(this.authController))
    );

    // ==================
    // Product Routes
    // ==================
    router.get(
      '/products',
      this.validator.validateQuery(productFilterSchema),
      this.errorHandler.asyncHandler(this.productController.listProducts.bind(this.productController))
    );

    router.get(
      '/products/:id',
      this.errorHandler.asyncHandler(this.productController.getProduct.bind(this.productController))
    );

    router.post(
      '/products',
      this.rbacGuard.authenticate(),
      this.rbacGuard.requirePermission('products:write'),
      this.validator.validateBody(createProductSchema),
      this.errorHandler.asyncHandler(this.productController.createProduct.bind(this.productController))
    );

    router.put(
      '/products/:id',
      this.rbacGuard.authenticate(),
      this.rbacGuard.requirePermission('products:write'),
      this.validator.validateBody(updateProductSchema),
      this.errorHandler.asyncHandler(this.productController.updateProduct.bind(this.productController))
    );

    router.delete(
      '/products/:id',
      this.rbacGuard.authenticate(),
      this.rbacGuard.requirePermission('products:write'),
      this.errorHandler.asyncHandler(this.productController.deleteProduct.bind(this.productController))
    );

    // Mount router
    this.app.use(`/api/${apiVersion}`, router);
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(this.errorHandler.notFound());

    // Global error handler (must be last)
    this.app.use(this.errorHandler.handle());
  }

  public getApp(): Application {
    return this.app;
  }

  public async start(): Promise<void> {
    const port = this.config.get().port;
    
    this.app.listen(port, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🚀 Commerce Platform API Server                    ║
║                                                       ║
║   Environment: ${this.config.get().nodeEnv.padEnd(37)}║
║   Port:        ${port.toString().padEnd(37)}║
║   API Version: ${this.config.get().apiVersion.padEnd(37)}║
║   Health:      http://localhost:${port}/health${' '.repeat(12)}║
║                                                       ║
║   📚 Documentation: /docs${' '.repeat(22)}║
║   🔒 Security: Enabled${' '.repeat(23)}║
║   ✅ Ready to accept requests${' '.repeat(18)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
    });
  }
}

// Start server if this file is executed directly
if (require.main === module) {
  const app = new App();
  app.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default App;
