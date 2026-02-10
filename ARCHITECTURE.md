# E-Commerce Platform - Enterprise Architecture

**System Version**: 1.0.0  
**Design Date**: February 2026  
**Classification**: Production-Ready | SOC-Level Security  

---

## 1. ARCHITECTURAL OVERVIEW

### 1.1 System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER (React MFE)                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐             │
│  │  Host Shell  │ │ Auth Widget  │ │ Cart Widget  │ ...         │
│  │  (Router)    │ │              │ │              │             │
│  └──────────────┘ └──────────────┘ └──────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (HTTPS/TLS 1.2+)
┌─────────────────────────────────────────────────────────────────┐
│                  API GATEWAY / LOAD BALANCER                    │
│  • Rate Limiting   • Request Validation   • JWT Verification   │
│  • CORS Policy     • Request Logging      • Security Headers   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              BACKEND SERVICES (Node.js - Clean Arch)            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Auth Service    │  │  Product Service │  │ Order Service│  │
│  │  (JWT + RBAC)    │  │  (GST Logic)     │  │  (Payment)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  User Service    │  │  Seller Service  │  │ Audit Service│  │
│  │  (PII Encrypt)   │  │  (Shop Mgmt)     │  │  (Logs)      │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (ORM + Prepared Statements)
┌─────────────────────────────────────────────────────────────────┐
│              DATA ACCESS & PERSISTENCE LAYER                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PostgreSQL / MySQL - RDBMS with Strong Referential Int │   │
│  │  • Encrypted Columns (AES-256)      • Audit Log Tables  │   │
│  │  • GST Slab Lookup                  • Payment Records   │   │
│  │  • User & Role Management           • Inventory Mgmt    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Clean Architecture** | Entities → Use Cases → Interface Adapters → Frameworks |
| **Separation of Concerns** | Service boundaries; each service owns its data & logic |
| **Statelessness** | No session state on backend; JWT-only auth |
| **Security-First** | Encryption by default; audit trails; RBAC enforcement |
| **Testability** | ≥95% unit coverage; dependency injection; mockable services |
| **Modularity** | Independent MFE widgets; versioned APIs; plugin-ready |

---

## 2. DOMAIN DECOMPOSITION

### 2.1 Core Domains

#### **Identity & Access Domain**
- User registration & authentication
- Role & permission management (RBAC)
- JWT token lifecycle
- Admin impersonation with audit trail
- **Ownership**: Auth Service

#### **Seller & Shop Domain**
- Seller profile management
- Shop configuration
- Product catalog ownership
- GST configuration per product
- **Ownership**: Seller Service

#### **Product & Catalog Domain**
- Product CRUD operations
- Inventory management
- Pricing & GST application
- Product search & filtering
- **Ownership**: Product Service

#### **Order & Transaction Domain**
- Shopping cart management
- Order creation & state transitions
- Payment processing
- Order fulfillment tracking
- **Ownership**: Order Service

#### **Customer Domain**
- Customer profiles
- Order history
- Wishlist & reviews
- Address management
- **Ownership**: User Service

#### **Payment Domain**
- Payment gateway abstraction
- Webhook handling
- Payment state machine
- Transaction recording
- **Ownership**: Order Service (Payment sub-module)

#### **Audit & Compliance Domain**
- Immutable audit logs
- Actor tracking
- Impersonation flagging
- IP address logging
- **Ownership**: Audit Service

---

## 3. ROLE-BASED ACCESS CONTROL (RBAC)

### 3.1 Role Hierarchy

```json
{
  "roles": {
    "SUPER_ADMIN": {
      "permissions": [
        "users:all",
        "sellers:all",
        "products:all",
        "orders:view",
        "platform:config",
        "audit:view",
        "impersonate:execute"
      ],
      "impersonation": "allowed",
      "auditRequired": true
    },
    "ADMIN": {
      "permissions": [
        "users:manage",
        "sellers:manage",
        "products:view",
        "orders:view",
        "audit:view",
        "impersonate:execute"
      ],
      "impersonation": "allowed_with_log",
      "auditRequired": true
    },
    "SELLER": {
      "permissions": [
        "shop:own_manage",
        "products:own_manage",
        "orders:own_view",
        "inventory:own_manage"
      ],
      "dataScope": "seller_id = authenticated_user.seller_id",
      "auditRequired": false
    },
    "CUSTOMER": {
      "permissions": [
        "products:view",
        "cart:own_manage",
        "orders:own_view",
        "invoices:own_view"
      ],
      "dataScope": "user_id = authenticated_user.id",
      "auditRequired": false
    }
  }
}
```

### 3.2 Authorization Guard Pattern

```typescript
// Policy-driven, not hardcoded
@UseGuard(RBACGuard)
@Policy("products:view")
async getProduct(id: string) { }

@UseGuard(RBACGuard)
@Policy("orders:own_view")
@DataScope("orders.user_id = req.user.id")
async getMyOrders() { }
```

---

## 4. DATA SECURITY MODEL

### 4.1 Encryption Strategy

#### **In Transit**
- TLS 1.2+ (minimum)
- HTTPS only; no HTTP fallback
- HSTS headers enforced

#### **At Rest**
Layering approach:
1. **Database-level encryption**: PostgreSQL pgcrypto
2. **Application-level encryption**: Node.js crypto (AES-256-GCM)
3. **Field-level encryption** for PII:

| Field | Encryption | Key Management | Purpose |
|-------|-----------|-----------------|---------|
| `email` | AES-256-GCM | Root KMS key | User identification |
| `phone` | AES-256-GCM | Root KMS key | Contact verification |
| `address` | AES-256-GCM | Root KMS key | Delivery address |
| `gstin` | AES-256-GCM | Root KMS key | Tax compliance |
| `payment_token` | Never stored | Gateway only | Compliance (PCI-DSS avoided) |

#### **Key Management**
- Master key stored in environment variable (12-character rotatable)
- Per-field initialization vectors (IV) generated fresh
- Key rotation every 90 days
- Audit log for all encryption/decryption operations

### 4.2 PII Masking Rules (Admin Impersonation)

| Field | Original | Masked | Visible? |
|-------|----------|--------|----------|
| Email | user@example.com | u***@example.com | Partially |
| Phone | +91-98765-43210 | +91-9***-****10 | Partially |
| GST ID | 27AAAPA5055K1Z0 | 27AAAP****Z0 | Partially |
| Address | 123 Main St, NYC | 123 Main St, [MASKED] | Partially |
| Payment ID | tok_1234567890 | [REDACTED] | No |

---

## 5. AUTHENTICATION & TOKEN LIFECYCLE

### 5.1 JWT Strategy

**Access Token**
```json
{
  "sub": "user_id",
  "role": "SELLER",
  "permissions": ["products:own_manage"],
  "tenant_id": "seller_123",
  "iat": 1705056000,
  "exp": 1705059600,
  "iss": "commerce.api"
}
```

**Refresh Token**
- Longer expiry (7 days)
- One-time use (token rotation)
- Stored in secure httpOnly cookie
- Revocation tracked in Redis cache

### 5.2 Token Rotation Flow

```
User Login
  ↓
Generate Access Token (15 min) + Refresh Token (7 days)
  ↓
Return Access Token (Authorization header)
Return Refresh Token (httpOnly cookie + database)
  ↓
Access Token Expires
  ↓
Client sends Refresh Token
  ↓
Validate Refresh Token (not revoked, not expired)
  ↓
Revoke old Refresh Token
New Access Token + New Refresh Token issued
```

---

## 6. ADMIN IMPERSONATION (STRICT PROTOCOL)

### 6.1 Impersonation Lifecycle

**Step 1: Initiate**
```json
POST /api/v1/admin/impersonate
{
  "targetUserId": "user_456",
  "reason": "Support ticket #12345",
  "durationMinutes": 30
}
```

**Step 2: Validation**
- Admin must have `impersonate:execute` permission
- Target user must exist and be active
- Duration capped at 240 minutes
- Reason is mandatory (audit)

**Step 3: Session Creation**
- New impersonation token issued with metadata:
  ```json
  {
    "sub": "user_456",  // impersonated user
    "impersonated_by": "admin_123",
    "impersonation_started": 1705056000,
    "impersonation_expires": 1705056000 + 1800,
    "impersonation_reason": "Support ticket #12345",
    "iss": "commerce.api/impersonation"
  }
  ```

**Step 4: Front-end Banner**
- UI shows persistent banner: `⚠️ IMPERSONATION MODE [Admin: john@admin.com] [Expires: 14:30]`
- All data displayed with PII masking
- Logout immediately terminates impersonation

**Step 5: Audit Trail**
- Every action logged with `impersonation_flag = true`
- Query: `SELECT * FROM audit_logs WHERE impersonation_flag = true ORDER BY created_at DESC`

### 6.2 Impersonation Constraints
- ❌ Cannot impersonate another Admin
- ❌ Cannot chain impersonations (A impersonates B)
- ❌ Cannot override role permissions (e.g., Admin impersonates Customer, still cannot access Admin APIs)
- ✅ Admin can see PII **masked**
- ✅ Admin can perform customer actions (with audit flag)
- ✅ Admin cannot modify payment methods or billing address
- ✅ Time-bound session with automatic termination

---

## 7. GST HANDLING & TAX COMPUTATION

### 7.1 GST Slab Structure

```sql
CREATE TABLE gst_slabs (
  id SERIAL PRIMARY KEY,
  slab_percentage DECIMAL(5,2) CHECK (slab_percentage IN (0, 5, 12, 18, 28)),
  description VARCHAR(255),
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2 Product-Level GST Configuration

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  gst_slab_id INT NOT NULL REFERENCES gst_slabs(id),
  -- ...
  UNIQUE(seller_id, sku)
);
```

### 7.3 Tax Computation Formula

**At Cart Level:**
```
For each line_item {
  item_gst_amount = item_base_price * (gst_percentage / 100)
  item_total = item_base_price + item_gst_amount
}

cart_total = SUM(item_total)
cart_gst = SUM(item_gst_amount)
```

**At Order Finalization (Immutable):**
```sql
INSERT INTO order_items (
  order_id, product_id, qty, base_price,
  gst_percentage, gst_amount, item_total,
  snapshot_gst_slab_id
) VALUES (...)
-- snapshot_gst_slab_id ensures tax cannot be retroactively changed
```

### 7.4 Invoice Tax Breakup

```
Item 1: Shirt @ ₹1000 (GST 18%)
  GST Amount: ₹180
  Total: ₹1180

Item 2: Shoes @ ₹2000 (GST 12%)
  GST Amount: ₹240
  Total: ₹2240

Cart Subtotal: ₹3000
Total GST: ₹420
Cart Total: ₹3420
```

---

## 8. PAYMENT PROCESSING

### 8.1 Payment Gateway Abstraction (Factory Pattern)

```typescript
interface PaymentProvider {
  initiatePayment(order: Order): Promise<PaymentSession>;
  verifyWebhook(payload: any): Promise<boolean>;
  refund(transactionId: string, amount: number): Promise<RefundResult>;
}

class PaymentFactory {
  static getProvider(env: string): PaymentProvider {
    switch(env) {
      case 'production':
        return new StripeProvider();  // Real payments
      case 'staging':
        return new RazorpayTestProvider();  // Sandbox
      case 'development':
        return new MockPaymentProvider();  // Mock
    }
  }
}
```

### 8.2 Payment State Machine

```
INITIATED
    ↓
PAYMENT_PENDING (waiting for gateway response)
    ├─→ SUCCESS (webhook confirmed)
    │     ↓
    │   ORDER_CONFIRMED
    │
    ├─→ FAILED (payment declined)
    │     ↓
    │   PAYMENT_FAILED (order cancelled)
    │
    └─→ TIMEOUT (no response in 30 min)
          ↓
        PAYMENT_TIMEOUT (order cancelled)
```

### 8.3 Webhook Security

```typescript
@Post("/webhooks/payment")
async handlePaymentWebhook(@Body() payload: any) {
  // 1. Signature verification (HMAC-SHA256)
  const isValid = verifyWebhookSignature(
    payload,
    req.headers['x-webhook-signature'],
    process.env.PAYMENT_WEBHOOK_SECRET
  );
  if (!isValid) throw new UnauthorizedException();
  
  // 2. Idempotency check (transaction ID)
  const existingRecord = await db.payments.findOne({
    gateway_transaction_id: payload.transaction_id
  });
  if (existingRecord) return { idempotent: true };
  
  // 3. State transition validation
  const order = await db.orders.findOne({ id: payload.order_id });
  if (order.payment_status !== 'PAYMENT_PENDING') {
    throw new InvalidStateError('Cannot transition from current state');
  }
  
  // 4. Atomic update
  await db.transaction(() => {
    db.orders.update({ payment_status: 'SUCCESS' });
    db.payments.insert({ ...payload });
    db.auditLogs.insert({ action: 'payment_confirmed' });
  });
}
```

---

## 9. MICRO FRONTEND (MFE) ARCHITECTURE

### 9.1 MFE Decomposition

| Widget | Owner | Responsibilities | Tech Stack |
|--------|-------|------------------|-----------|
| **Host Shell** | Platform | Routing, Layout, Auth Check | React Router v6 |
| **Auth Widget** | Auth Service | Login, Signup, Forgot Password | React + Formik |
| **Product Widget** | Product Service | Product Browse, Search, Filter | React + TanStack Query |
| **Seller Dashboard** | Seller Service | Shop Mgmt, Product Listing | React + Recharts |
| **Product Manager** | Seller Service | Product CRUD, Inventory | React Hook Form |
| **Cart Widget** | Order Service | Cart UI, Quantity Management | React Context/Redux |
| **Checkout Widget** | Order Service | Address, Payment Integration | React + Stripe.js |
| **Order Widget** | Order Service | Order History, Tracking | React + TanStack Query |
| **Invoice Widget** | Order Service | Invoice Generation, PDF | React + html2pdf |
| **Admin Dashboard** | Admin Service | User Mgmt, Analytics, Impersonation | React + Recharts |
| **Audit Viewer** | Audit Service | Audit Log Visualization | React + React Table |

### 9.2 MFE Module Federation Config (Webpack)

```javascript
// Host Shell
const deps = require('./package.json').dependencies;
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'host',
      remotes: {
        auth: 'auth@http://localhost:3001/remoteEntry.js',
        product: 'product@http://localhost:3002/remoteEntry.js',
        seller: 'seller@http://localhost:3003/remoteEntry.js',
        order: 'order@http://localhost:3004/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
      },
    }),
  ],
};

// Auth MFE
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'auth',
      filename: 'remoteEntry.js',
      exposes: {
        './AuthWidget': './src/AuthWidget',
      },
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
      },
    }),
  ],
};
```

### 9.3 MFE Communication Contracts

**Example: Cart → Order Service**
```typescript
// docs/contracts/cart-order-contract.ts

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  sellerId: string;
}

export interface AddToCartResponse {
  cartId: string;
  itemCount: number;
  totalPrice: number;
  gstBreakup: {
    baseAmount: number;
    gstAmount: number;
    percentage: number;
  };
}

// Expected HTTP
// POST /api/v1/carts/{cartId}/items
// Success: 201 Created
// Error 400: Invalid product
// Error 401: Unauthorized
```

---

## 10. DATABASE SCHEMA (NORMALIZED - 3NF)

See [SCHEMA.md](./docs/SCHEMA.md) for complete DDL.

### 10.1 Core Tables

```
users
├── user_roles (M:N)
├── user_credentials
└── user_pii_encrypted

sellers
├── seller_shops
├── seller_gstin
└── seller_bank_accounts

products
├── product_variants
├── product_inventory
└── gst_slabs

orders
├── order_items (snapshot GST)
├── order_payments
└── order_shipments

audit_logs (immutable append-only)
└── impersonation_logs
```

---

## 11. SECURITY CONTROLS CHECKLIST

### 11.1 Input Validation
```typescript
// ✅ All inputs validated against schema
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(3).max(255),
  price: z.number().positive(),
  gstSlabId: z.number().int().positive(),
});

@Post("/products")
async createProduct(@Body() dto: unknown) {
  const validated = createProductSchema.parse(dto);
  // Process validated data
}
```

### 11.2 SQL Injection Prevention
```typescript
// ✅ Use ORM with parameterized queries
const repo = new ProductRepository();
const products = await repo.find({ price_gte: 100 });

// ❌ Never concatenate SQL
const bad = `SELECT * FROM products WHERE id = ${id}`;

// Under the hood: ORM uses prepared statements
const query = 'SELECT * FROM products WHERE id = $1';
const result = await db.query(query, [id]);
```

### 11.3 Rate Limiting
```typescript
// ✅ Global rate limiting + endpoint-specific
import { RateLimiter } from 'express-rate-limit';

const loginLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,  // 5 requests per IP
  message: 'Too many login attempts',
});

@Post("/auth/login")
@UseMiddleware(loginLimiter)
async login() { }
```

### 11.4 CSRF Protection
```typescript
// ✅ CSRF token in cookies + state validation
@Post("/orders")
@UseMiddleware(csrfProtection)
async createOrder(@Body() dto: CreateOrderDTO) {
  // CSRF token validated by middleware
}
```

### 11.5 Secure Headers
```typescript
// ✅ Security headers enforced via helmet
import helmet from 'helmet';

app.use(helmet());
// Sets: CSP, X-Frame-Options, X-Content-Type-Options, HSTS, etc.
```

---

## 12. AUDIT & COMPLIANCE

### 12.1 Immutable Audit Log

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor_type ENUM('USER', 'ADMIN', 'SYSTEM'),
  actor_id BIGINT,
  action VARCHAR(100),  -- 'products:create', 'orders:update', etc.
  resource_type VARCHAR(100),
  resource_id BIGINT,
  changes JSONB,  -- Before/after delta
  ip_address INET,
  user_agent TEXT,
  impersonation_flag BOOLEAN DEFAULT FALSE,
  impersonated_by BIGINT,
  status ENUM('SUCCESS', 'FAILURE'),
  error_message TEXT
);

-- ✅ Immutable: No UPDATE/DELETE allowed
CREATE POLICY audit_logs_immutable ON audit_logs
  AS (false) FOR UPDATE;
```

### 12.2 Audit Query Examples

```sql
-- Failed login attempts
SELECT * FROM audit_logs
WHERE action = 'auth:login'
  AND status = 'FAILURE'
  AND timestamp > NOW() - INTERVAL '24 hours'
ORDER BY timestamp DESC;

-- Admin impersonations
SELECT * FROM audit_logs
WHERE impersonation_flag = TRUE
ORDER BY timestamp DESC;

-- Product price changes (for GST audit)
SELECT * FROM audit_logs
WHERE resource_type = 'products'
  AND action = 'products:update'
  AND changes->>'base_price' IS NOT NULL;
```

---

## 13. API VERSIONING STRATEGY

### 13.1 URL-Based Versioning

```
/api/v1/products     (Current stable)
/api/v2/products     (In development)
/api/v3/products     (Future)
```

### 13.2 Deprecation Policy

**v1 API**: Supported for 24 months
**v2 API**: Introduced after v1 stabilization
**Sunset Announcement**: Published 6 months before v1 sunset

---

## 14. DEPLOYMENT & OPERATIONS

### 14.1 Environment Tiers

| Tier | Purpose | Payment Gateway | Encryption | Logging |
|------|---------|-----------------|-----------|---------|
| **dev** | Local development | Mock | Disabled (plaintext) | Console |
| **staging** | QA & Load Testing | Sandbox | Enabled | File + ELK |
| **production** | Live | Real (stripe only) | Enabled | ELK + CloudWatch |

### 14.2 Secrets Management

```bash
# ✅ Environment variables (sensitive)
POSTGRES_PASSWORD=<strong-password>
JWT_SECRET=<32-char-random>
ENCRYPTION_MASTER_KEY=<12-char-rotatable>
PAYMENT_API_KEY=<from-vault>

# ✅ Stored in: AWS Secrets Manager / Azure Key Vault / HashiCorp Vault
# ❌ Never in git, code, or config files
```

---

## 15. TESTING STRATEGY

**Coverage Target**: ≥95% unit tests

### 15.1 Testing Pyramid

```
         △
        /|\
       / | \  E2E Tests (5%) - Full user journeys
      /  |  \
     /───┼───\
    /    |    \  Integration Tests (20%) - Service interactions
   /     |     \
  /──────┼──────\
 /       |       \  Unit Tests (75%) - Business logic, GST, RBAC
/________|________\
```

### 15.2 Mandatory Test Suites

| Component | Test Type | Coverage |
|-----------|-----------|----------|
| GST Calculation | Unit | 100% (all slabs) |
| RBAC Enforcement | Unit + Integration | 100% |
| JWT Token Lifecycle | Unit | 100% |
| Payment State Machine | Unit + Integration | 100% |
| Impersonation Logic | Unit + Integration | 100% |
| Encryption/Decryption | Unit | 100% |
| Audit Log Immutability | Integration | 100% |

---

## 16. QUALITY GATES

### 16.1 CI/CD Pipeline

```
1. Lint (ESLint + Prettier)
2. Unit Tests (Jest) → Coverage ≥95% (MUST-PASS)
3. Integration Tests (Supertest + Docker)
4. Security Scan (OWASP, Snyk)
5. Code Quality (SonarQube) → Maintainability ≥A
6. Build
7. Deployment
```

### 16.2 Build Failure Triggers

- ❌ Coverage < 95%
- ❌ ESLint errors
- ❌ Type errors (TypeScript strict mode)
- ❌ Security vulnerabilities (critical/high)
- ❌ Test failures

---

## 17. DOCUMENTATION ARTIFACTS

Required deliverables:

- [x] Architecture Overview (this document)
- [x] Database Schema & Migrations  → [SCHEMA.md](./docs/SCHEMA.md)
- [x] API Contracts              → [API_CONTRACTS.md](./docs/API_CONTRACTS.md)
- [x] Security Model             → [SECURITY.md](./docs/SECURITY.md)
- [x] Test Strategy              → [TESTING.md](./docs/TESTING.md)
- [x] MFE Design                 → [MFE_DESIGN.md](./docs/MFE_DESIGN.md)
- [x] Bootstrap Guide            → [BOOTSTRAP.md](./docs/BOOTSTRAP.md)
- [x] Operator Runbook           → [RUNBOOK.md](./docs/RUNBOOK.md)

---

## 18. DECISION RECORD (ADRs)

### ADR-001: Why Clean Architecture?
**Decision**: Use Clean Architecture (Entities → UseCases → Interfaces → Frameworks)
**Rationale**: 
- Testability without mocking framework code
- Framework-agnostic business logic
- Clear dependency flow (inward)

### ADR-002: Why JWT + Refresh Tokens?
**Decision**: Stateless JWT with token rotation
**Rationale**:
- Horizontal scalability (no session affinity)
- Mobile-friendly (no cookies required)
- Token rotation reduces key compromise window

### ADR-003: Why Field-Level Encryption?
**Decision**: AES-256-GCM for PII fields via application layer
**Rationale**:
- Granular control over encrypted data
- Searchable encrypted fields (LIKE queries on hashed subsets)
- Database-layer encryption is insufficient (keys exposed to DB admins)

### ADR-004: Why Immutable Audit Logs?
**Decision**: Append-only log with policy-based DELETE/UPDATE prevention
**Rationale**:
- Regulatory compliance (SOC-2, ISO 27001)
- Non-repudiation for actions
- Forensic analysis capability

### ADR-005: Why MFE Architecture?
**Decision**: Widget-based MFE using Module Federation
**Rationale**:
- Independent deployment cycles
- Team boundary alignment (Auth team owns Auth widget)
- Progressive enhancement (lazy-load widgets)
- Heterogeneous tech stack possible (future)

---

## 19. SUCCESS CRITERIA (20-Year Design)

✅ **Year 1-2**: MVP with core features, ≥95% test coverage, auditable
✅ **Year 3-5**: Multi-tenant variant, advanced analytics, payment method expansion
✅ **Year 6-10**: AI-driven recommendations, machine learning on order data, regional scaling
✅ **Year 11-20**: Blockchain order tracking (optional), advanced supply chain integration

**Non-Negotiable**:
- Zero unplanned shutdowns
- Zero data loss incidents
- Zero unauthorized access
- <2% annual downtime
- <100ms API response (p95)

---

**Document Version**: 1.0.0  
**Last Updated**: February 2026  
**Next Review**: August 2026  
**Classification**: Technical Architecture (Internal)
