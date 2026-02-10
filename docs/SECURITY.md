# Security & Encryption Model

**Classification**: Confidential - Technical Security Documentation  
**Last Updated**: February 2026  

---

## 1. ENCRYPTION ARCHITECTURE

### 1.1 Layered Encryption Strategy

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Transport Security (TLS 1.2+)              │
│ • HTTPS only                                         │
│ • Certificate pinning (mobile clients)              │
│ • HSTS headers enforced                             │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Layer 2: Application-Level Encryption               │
│ • Field-level AES-256-GCM                           │
│ • Per-field IV (initialization vector)              │
│ • Authentication tag (prevents tampering)           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Layer 3: Database Encryption                        │
│ • PG (pgcrypto)                                     │
│ • MySQL TDE (Transparent Data Encryption)           │
│ • Full-disk encryption (OS level)                   │
└─────────────────────────────────────────────────────┘
```

### 1.2 Field-Level Encryption (AES-256-GCM)

```typescript
// Encryption service pseudo-code
class EncryptionService {
  readonly algorithm = 'aes-256-gcm';
  readonly authTagLength = 16;  // bytes
  readonly saltLength = 16;
  readonly keyDerivationIterations = 100000;
  
  // Master key stored: process.env.ENCRYPTION_MASTER_KEY (12 chars, rotatable)
  
  encrypt(plaintext: string, fieldName: string): {
    encrypted: string;  // Base64
    iv: string;        // Base64
  } {
    // 1. Generate random IV (16 bytes)
    const iv = crypto.randomBytes(16);
    
    // 2. Derive key from master key (PBKDF2)
    const salt = crypto.randomBytes(this.saltLength);
    const derivedKey = crypto.pbkdf2Sync(
      process.env.ENCRYPTION_MASTER_KEY,
      salt,
      this.keyDerivationIterations,
      32,  // 256 bits
      'sha256'
    );
    
    // 3. Create cipher & encrypt
    const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // 4. Get authentication tag (prevents tampering)
    const authTag = cipher.getAuthTag();
    
    // 5. Return encrypted data
    return {
      encrypted: authTag.toString('base64') + ':' + encrypted,
      iv: iv.toString('base64'),
      salt: salt.toString('base64')
    };
  }
  
  decrypt(encrypted: string, iv: string, salt: string, fieldName: string): string {
    const [authTagB64, ciphertextB64] = encrypted.split(':');
    const authTag = Buffer.from(authTagB64, 'base64');
    const iv_buf = Buffer.from(iv, 'base64');
    const salt_buf = Buffer.from(salt, 'base64');
    
    const derivedKey = crypto.pbkdf2Sync(
      process.env.ENCRYPTION_MASTER_KEY,
      salt_buf,
      this.keyDerivationIterations,
      32,
      'sha256'
    );
    
    const decipher = crypto.createDecipheriv(this.algorithm, derivedKey, iv_buf);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertextB64, 'base64', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }
}
```

### 1.3 Fields Encrypted at Application Level

```typescript
enum Encryptedfields {
  UserEmail = 'users.email',
  UserPhone = 'users.phone',
  UserAddress = 'user_addresses.address_line_1',
  UserAddressCity = 'user_addresses.city',
  SellerGSTIN = 'seller_gstin.gstin',
  SellerPAN = 'seller_gstin.pan',
  BankAccountNumber = 'seller_bank_accounts.account_number',
}

// Encrypted at write time, decrypted on read
// Automatic via ORM hooks (beforeInsert, beforeUpdate, afterFind)
```

---

## 2. KEY MANAGEMENT

### 2.1 Master Encryption Key

```
Environment Variable: ENCRYPTION_MASTER_KEY
Format: 12-character alphanumeric (128 bits entropy minimum)
Example: "Tr0PyK9$mL2@"

Rotation Policy:
- Every 90 days (automated alert)
- On security incident
- On system compromise suspicion

Fallback Strategy:
- Keep previous 2 keys in secret manager
- Support key versioning in encrypted fields
```

### 2.2 Key Storage (Secure Vault Integration)

**Development**
```bash
ENCRYPTION_MASTER_KEY="DevTestKey123"  # In .env.local (DO NOT commit)
```

**Staging/Production**
```
# AWS Secrets Manager
aws secretsmanager get-secret-value \
  --secret-id commerce/encryption/master-key

# Azure Key Vault
az keyvault secret show \
  --vault-name commerce-vault \
  --name encryption-master-key

# HashiCorp Vault
vault kv get secret/commerce/encryption-master-key
```

### 2.3 JWT Signing Keys

```
JWT_SECRET: 32+ character random string
Example: "5Yx#kQ8$mN2@L9pRw7fZvCxB3dPaEsG6"

Rotation Pattern:
- Signed with current key
- Accept verification from current + previous key (7-day window)
- Sign new tokens with new key
- After 7 days, reject old key

Implementation:
CURRENT_JWT_KEY = env.JWT_SECRET
PREVIOUS_JWT_KEY = env.JWT_SECRET_PREVIOUS (optional)
```

---

## 3. AUTHENTICATION & TOKEN SECURITY

### 3.1 Password Hashing (bcrypt)

```typescript
// Never store plaintext passwords

import bcrypt from 'bcrypt';

// At registration/password change
const saltRounds = 12;  // Cost factor (2^12 iterations)
const passwordHash = await bcrypt.hash(password, saltRounds);

// At login
const isValid = await bcrypt.compare(inputPassword, storedHash);

// Timing: ~200-300ms per hash (intentional slowness)
// Purpose: Prevents brute-force attacks
```

### 3.2 JWT Token Structure

**Access Token** (15 minutes)
```json
{
  "sub": "user_123",
  "email": "user@example.com",
  "role": "SELLER",
  "permissions": ["products:manage_own", "orders:view_own"],
  "tenant_id": "seller_123",
  "iat": 1707463800,
  "exp": 1707464700,
  "iss": "commerce.api",
  "aud": "commerce-frontend",
  "jti": "uuid-unique-token-id"  // For revocation tracking
}
```

**Refresh Token** (7 days)
```json
{
  "sub": "user_123",
  "type": "refresh",
  "token_family": "uuid-group",
  "iat": 1707463800,
  "exp": 1708068600,
  "iss": "commerce.api"
}
```

### 3.3 Token Rotation (Family-Based)

```
Timeline:
Day 0, 10:00 AM:
  - User logs in
  - Issue: accessToken_A (exp: 10:15 AM)
           refreshToken_1 (exp: Day 7 10:00 AM, family: abc123)
  - Store: refreshToken_1 hash in JWT registry

Day 0, 10:30 AM (access token expired):
  - Client sends refreshToken_1
  - Backend verifies:
    - Signature valid ✓
    - Expiry OK ✓
    - Not in revocation list ✓
    - Same family as last issued ✓
  - Issue NEW: accessToken_B (exp: 10:45 AM)
               refreshToken_2 (exp: Day 7 10:30 AM, family: abc123)
  - REVOKE: refreshToken_1 (mark in jwt_registries.revoked_at)

Day 1, 10:35 AM (attacker steals old refreshToken_1):
  - Client sends refreshToken_1
  - Backend checks: revoked_at is not null → REJECT
  - Alert: Potential token compromise detected
  - Action: Invalidate entire token family → revoke refreshToken_2
  - Behavior: Force user re-login
```

### 3.4 Impersonation Token Security

```typescript
// Impersonation tokens have special claims
{
  "sub": "user_456",           // Impersonated user
  "impersonated_by": "admin_123",
  "impersonation_started": 1707463800,
  "impersonation_expires": 1707467400,  // 60 min max
  "impersonation_reason": "Support ticket #12345",
  "type": "impersonation",
  "iss": "commerce.api/impersonation",
  "aud": "commerce-frontend"
}

Properties:
- Cannot be refreshed (one-time use)
- Cannot extend beyond original expiry
- Must include reason
- Cannot be used to impersonate another admin
```

---

## 4. AUTHORIZATION & RBAC

### 4.1 Permission Declaration

```typescript
interface Permission {
  name: string;
  resource: string;
  action: string;  // create, read, update, delete, manage
  description: string;
  dataScope?: {
    table: string;
    condition: string;  // SQL: "seller_id = ${user.seller_id}"
  };
}

const permissions: Permission[] = [
  {
    name: 'products:view',
    resource: 'products',
    action: 'view',
    description: 'View any product'
  },
  {
    name: 'products:manage_own',
    resource: 'products',
    action: 'manage_own',
    description: 'Manage own seller products',
    dataScope: {
      table: 'products',
      condition: 'seller_id = ${user.seller_id}'
    }
  },
  {
    name: 'orders:view_all',
    resource: 'orders',
    action: 'view_all',
    description: 'View all orders (admin only)'
  }
];
```

### 4.2 Policy-Driven Authorization

```typescript
// Guard decorator (Clean Architecture)
@UseGuard(RBACGuard)
@Policy('products:manage_own')
@DataScope('products.seller_id = :seller_id')
async updateProduct(
  @Param('sellerId') sellerId: string,
  @Param('productId') productId: string,
  @Body() dto: UpdateProductDTO
) {
  // Authorization already validated by guards
  // seller_id = authenticated_user.seller_id enforced
  const product = await productRepo.findOne(productId);
  return productService.update(product, dto);
}

// Guard implementation
class RBACGuard {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const policy = getMetadata('policy', context.getHandler());
    const dataScope = getMetadata('dataScope', context.getHandler());
    
    // 1. Check permission exists
    const hasPermission = req.user.permissions.includes(policy);
    if (!hasPermission) throw new ForbiddenException();
    
    // 2. Apply data scope if defined
    if (dataScope) {
      const scopeVars = extractScopeVariables(dataScope, req);
      req.dataScope = { sql: dataScope, vars: scopeVars };
    }
    
    return true;
  }
}

// Repository enforces data scope
const repo = new ProductRepository();
const products = await repo.find({
  seller_id: req.user.seller_id  // Auto-applied
});
```

### 4.3 Role-Permission Mapping

```json
{
  "SUPER_ADMIN": {
    "description": "Full platform control",
    "permissions": [
      "users:manage",
      "sellers:manage",
      "products:view",
      "products:delete_any",
      "orders:view_all",
      "platform:config",
      "impersonate:execute",
      "audit:view"
    ]
  },
  "ADMIN": {
    "description": "Platform administrator",
    "permissions": [
      "users:manage",
      "sellers:manage",
      "products:view",
      "orders:view_all",
      "audit:view",
      "impersonate:execute"
    ]
  },
  "SELLER": {
    "description": "Product seller",
    "permissions": [
      "shop:own_manage",
      "products:own_create",
      "products:own_update",
      "products:own_delete",
      "orders:own_view",
      "inventory:own_manage"
    ],
    "dataScope": {
      "products": "seller_id = ${user.seller_id}",
      "orders": "seller_id = ${user.seller_id}"
    }
  },
  "CUSTOMER": {
    "description": "End customer",
    "permissions": [
      "products:view",
      "products:search",
      "cart:own_manage",
      "orders:own_create",
      "orders:own_view",
      "invoices:own_view"
    ],
    "dataScope": {
      "orders": "user_id = ${user.id}",
      "carts": "user_id = ${user.id}"
    }
  }
}
```

---

## 5. PII MASKING DURING IMPERSONATION

### 5.1 Masking Rules

```typescript
interface MaskingRule {
  field: string;
  pattern: RegExp | Function;
  replacement: Function;
  example: { original: string; masked: string };
}

const maskingRules: MaskingRule[] = [
  {
    field: 'email',
    pattern: (email: string) => email,
    replacement: (email: string) => {
      const [local, domain] = email.split('@');
      const masked = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
      return `${masked}@${domain}`;
    },
    example: {
      original: 'john.doe@example.com',
      masked: 'j***e@example.com'
    }
  },
  {
    field: 'phone',
    replacement: (phone: string) => {
      // +91-98765-43210 → +91-9***-****10
      const digits = phone.replace(/\D/g, '');
      const country = digits.substring(0, 2);
      const prefix = digits.substring(2, 3);
      const suffix = digits.substring(-2);
      return `+${country}-${prefix}***-****${suffix}`;
    },
    example: {
      original: '+91-98765-43210',
      masked: '+91-9***-****10'
    }
  },
  {
    field: 'address_line_1',
    replacement: (address: string) => {
      // "123 Main Street" → "123 Main St"
      return address.replace(/(\d+\s+\w+\s+)\w+.*/, '$1');
    },
    example: {
      original: '123 Main Street, Apt 456',
      masked: '123 Main St'
    }
  },
  {
    field: 'gstin',
    replacement: (gstin: string) => {
      // "27AAAPA5055K1Z0" → "27AAAP****Z0"
      return gstin.substring(0, 6) + '*'.repeat(8) + gstin.substring(-2);
    },
    example: {
      original: '27AAAPA5055K1Z0',
      masked: '27AAAP****Z0'
    }
  },
  {
    field: 'payment_identifier',
    replacement: (id: string) => '[REDACTED]',
    example: {
      original: 'tok_1234567890abcdef',
      masked: '[REDACTED]'
    }
  }
];
```

### 5.2 Masking Enforcement

```typescript
// Auto-applied when impersonation_flag = true
class MaskingMiddleware {
  apply(data: any, isImpersonating: boolean): any {
    if (!isImpersonating) return data;
    
    return applyMaskingRules(data, maskingRules);
  }
}

// In serialization layer
@UseInterceptor(MaskingInterceptor)
async getUser() {
  const user = await userService.findOne(id);
  
  // Automatic: if req.impersonation_flag = true
  // Serializer applies masking rules → returns masked data
  return user;
}
```

---

## 6. INPUT VALIDATION & INJECTION PREVENTION

### 6.1 Schema Validation (Zod/Joi)

```typescript
import { z } from 'zod';

const createProductSchema = z.object({
  sku: z.string()
    .min(3).max(100)
    .regex(/^[A-Z0-9\-]+$/),  // Alphanumeric + hyphens
  
  name: z.string()
    .min(3).max(255)
    .transform(s => s.trim()),
  
  basePrice: z.number()
    .min(0)
    .max(1000000),
  
  gstSlabId: z.number()
    .int()
    .positive()
});

// Usage
@Post('/products')
async create(@Body() dto: unknown) {
  const validated = createProductSchema.parse(dto);
  // If parse fails → 400 Bad Request with error details
  return productService.create(validated);
}
```

### 6.2 SQL Injection Prevention (ORM)

```typescript
// ❌ VULNERABLE (never do this)
const query = `SELECT * FROM products WHERE id = ${req.params.id}`;

// ✅ SAFE (ORM with parameterized queries)
const product = await productRepo.find({ id: req.params.id });

// Under the hood:
// ORM generates: SELECT * FROM products WHERE id = $1
// Params passed separately: [$1 = req.params.id]
// Prevents injection: Even if id = "1; DROP TABLE products;--" → treated as literal
```

### 6.3 XSS Prevention

```typescript
// ✅ React auto-escapes HTML
function UserProfile({ user }) {
  return <div>{user.email}</div>;  // HTML-safe
}

// ❌ Dangerous
<div dangerouslySetInnerHTML={{ __html: user.email }} />

// API: Always return JSON (not HTML templates)
// Headers: Content-Type: application/json (not text/html)
```

---

## 7. RATE LIMITING & DOS PROTECTION

### 7.1 Global Rate Limits

```typescript
import RateLimiter from 'express-rate-limit';

const globalLimiter = new RateLimiter({
  windowMs: 60 * 1000,          // 1 minute
  max: 1000,                     // 1000 requests per minute
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.user?.role === 'SUPER_ADMIN',  // Admins exempt
  keyGenerator: (req) => {
    // Rate limit by user ID (if auth) or IP
    return req.user?.id || req.ip;
  }
});

app.use('/api/', globalLimiter);
```

### 7.2 Endpoint-Specific Limits

```typescript
const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                      // 5 attempts max
  message: 'Too many login attempts. Try again later.',
  skipSuccessfulRequests: true  // Don't count successful logins
});

@Post('/auth/login')
@UseMiddleware(loginLimiter)
async login(@Body() cred: LoginDTO) {
  // After 5 failed attempts in 15 min → blocks for remainder of window
}
```

---

## 8. SECURE HEADERS

### 8.1 Helmet Configuration

```typescript
import helmet from 'helmet';

app.use(helmet());

// Configured headers:
// - Content-Security-Policy (CSP) → prevents XSS
// - X-Frame-Options: DENY → prevents clickjacking
// - X-Content-Type-Options: nosniff → prevents MIME sniffing
// - Strict-Transport-Security (HSTS) → enforces HTTPS
// - X-XSS-Protection: 1; mode=block → browser XSS filter
// - Referrer-Policy: strict-origin-when-cross-origin
// - Permissions-Policy: geolocation=(),microphone=()
```

### 8.2 CORS Configuration

```typescript
import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];
    
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600
};

app.use(cors(corsOptions));
```

---

## 9. CSRF PROTECTION

```typescript
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

app.use(cookieParser());

const csrfProtection = csrf({
  cookie: false,
  sessionKey: 'session'  // Store in session
});

@Post('/orders')
@UseMiddleware(csrfProtection)
async createOrder(@Body() dto: CreateOrderDTO) {
  // CSRF token validated by middleware before handler executes
  return orderService.create(dto);
}

// Frontend must:
// 1. GET /csrf-token
// 2. Include token in POST request header: X-CSRF-Token
```

---

## 10. AUDIT LOGGING

### 10.1 What to Log

- ✅ Authentication events (login, logout, token refresh)
- ✅ Authorization failures (permission denied)
- ✅ Data mutations (create, update, delete)
- ✅ Sensitive operations (impersonation, payment)
- ✅ Failed validations (input errors)
- ✅ Security events (rate limit, CSRF, encryption ops)
- ❌ Do NOT log: passwords, card numbers, sensitive tokens

### 10.2 Audit Log Entry

```typescript
interface AuditLogEntry {
  timestamp: Date;
  actorType: 'USER' | 'ADMIN' | 'SYSTEM';
  actorId: string;
  action: string;  // 'products:create'
  resourceType: string;  // 'products'
  resourceId: string;
  changes: {
    before?: object;
    after?: object;
  };
  ipAddress: string;
  userAgent: string;
  impersonationFlag: boolean;
  impersonatedBy?: string;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}
```

### 10.3 Immutable Storage

```sql
-- No updates allowed after insertion
CREATE POLICY audit_logs_immutable ON audit_logs
  AS (false) FOR UPDATE, DELETE;

-- Only append new records
INSERT INTO audit_logs (...) VALUES (...);

-- Query for forensics
SELECT * FROM audit_logs
WHERE timestamp > NOW() - INTERVAL '90 days'
  AND resource_type = 'orders'
  AND status = 'SUCCESS'
ORDER BY timestamp DESC;
```

---

## 11. SECURITY TESTING

### 11.1 Unit Tests

```typescript
describe('EncryptionService', () => {
  it('should encrypt and decrypt without data loss', () => {
    const plaintext = 'john.doe@example.com';
    const { encrypted, iv, salt } = service.encrypt(plaintext, 'email');
    const decrypted = service.decrypt(encrypted, iv, salt, 'email');
    expect(decrypted).toBe(plaintext);
  });
  
  it('should produce different ciphertext for same plaintext', () => {
    const plaintext = 'john.doe@example.com';
    const result1 = service.encrypt(plaintext, 'email');
    const result2 = service.encrypt(plaintext, 'email');
    expect(result1.encrypted).not.toBe(result2.encrypted);  // Different IV
  });
  
  it('should fail on tampered ciphertext', () => {
    const { encrypted, iv, salt } = service.encrypt('test', 'email');
    const tampered = encrypted.slice(0, -10) + 'XXXXXXXXXX';
    expect(() => service.decrypt(tampered, iv, salt, 'email'))
      .toThrow('Decipher error');
  });
});

describe('RBAC Guard', () => {
  it('should allow authorized user', async () => {
    const req = {
      user: { id: '123', permissions: ['products:manage_own'] }
    };
    expect(guard.canActivate(createContext(req))).toBe(true);
  });
  
  it('should deny unauthorized user', async () => {
    const req = {
      user: { id: '123', permissions: ['orders:view_own'] }
    };
    expect(() => guard.canActivate(createContext(req)))
      .toThrow(ForbiddenException);
  });
});
```

### 11.2 Integration Tests

```typescript
describe('Payment Webhook Security', () => {
  it('should reject unsigned webhook', async () => {
    const response = await request(app)
      .post('/webhooks/payment')
      .send({ /* payload */ });
    
    expect(response.status).toBe(401);
  });
  
  it('should reject webhook with invalid signature', async () => {
    const payload = { /* ... */ };
    const invalidSignature = 'invalid_signature_here';
    
    const response = await request(app)
      .post('/webhooks/payment')
      .set('x-webhook-signature', invalidSignature)
      .send(payload);
    
    expect(response.status).toBe(401);
  });
  
  it('should verify webhook idempotently', async () => {
    const payload = { transaction_id: 'txn_123', order_id: 'ord_456' };
    const signature = generateSignature(payload);
    
    const response1 = await request(app)
      .post('/webhooks/payment')
      .set('x-webhook-signature', signature)
      .send(payload);
    expect(response1.status).toBe(200);
    
    const response2 = await request(app)
      .post('/webhooks/payment')
      .set('x-webhook-signature', signature)
      .send(payload);
    expect(response2.status).toBe(200);
    expect(response2.body.idempotent).toBe(true);
  });
});
```

---

## 12. SECURITY INCIDENT RESPONSE

### 12.1 Potential Compromise

```
If ENCRYPTION_MASTER_KEY is leaked:
1. Immediate: Rotate key (generate new 12-char key)
2. Immediate: Update all environments
3. Within 1 hour: Re-encrypt all PII fields with new key
4. Within 24 hours: Audit who accessed PII during window
5. Notify: Audit team, security team, stakeholders

If JWT_SECRET is leaked:
1. Immediate: Generate new JWT_SECRET
2. Immediate: Set old key as PREVIOUS (7-day window)
3. Within 7 days: Phase out old key, reject old tokens
4. Review: All issued tokens during compromise window

If Database is breached:
1. Immediate: Shutdown affected services
2. Assess: Which data was accessed (encrypted fields are safe)
3. Audit: All access logs during window
4. Notify: Affected users (encrypted data is protected)
```

---

**Document Version**: 1.0.0  
**Classification**: Confidential  
**Last Reviewed**: February 2026  
**Next Review**: August 2026
