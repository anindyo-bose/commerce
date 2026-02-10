# E-Commerce Platform - Complete System Design & Architecture

**Version**: 1.0.0  
**Status**: Architecture & Design Phase  
**Last Updated**: February 2026  

---

## 📋 Quick Navigation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System topology, domain design, security model |
| [SCHEMA.md](./docs/SCHEMA.md) | Database design, tables, relationships, indexes |
| [API_CONTRACTS.md](./docs/API_CONTRACTS.md) | REST API specifications, endpoints, payloads |
| [SECURITY.md](./docs/SECURITY.md) | Encryption, RBAC, authentication, audit logs |
| [TESTING.md](./docs/TESTING.md) | Test strategy, ≥95% coverage enforcement |
| [MFE_DESIGN.md](./docs/MFE_DESIGN.md) | Micro Frontend architecture, Module Federation |
| [BOOTSTRAP.md](./docs/BOOTSTRAP.md) | Setup script, database initialization |

---

## 🎯 Project Scope

### What This System Does
- ✅ Multi-role e-commerce platform (Customer, Seller, Admin)
- ✅ Product catalog with GST (0%, 5%, 12%, 18%, 28%)
- ✅ Shopping cart & checkout with tax calculation
- ✅ Payment processing (sandbox testing only)
- ✅ Order management & invoice generation
- ✅ Admin dashboard with user impersonation
- ✅ Audit trails for compliance
- ✅ Micro Frontend architecture for scalability

### What This System Does NOT Include
- ❌ Multiple currencies (INR only)
- ❌ International shipping
- ❌ Real payment processing (sandbox only)
- ❌ Shipping integration APIs
- ❌ Recommendation engine (future scope)
- ❌ Advanced analytics (future scope)

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│     Frontend (React MFE - Multiple Ports)   │
│  Auth | Product | Cart | Order | Admin      │
└─────────────────────────────────────────────┘
                ↓ HTTPS
┌─────────────────────────────────────────────┐
│  API Gateway (Rate Limit, Auth, CORS)       │
└─────────────────────────────────────────────┘
                ↓
┌─────────────────────────────────────────────┐
│  Backend Services (Clean Architecture)      │
│  Auth | Product | Order | Seller | Audit   │
└─────────────────────────────────────────────┘
                ↓ ORM + Prepared Statements
┌─────────────────────────────────────────────┐
│  PostgreSQL / MySQL (RDBMS)                 │
│  - Encrypted Fields (AES-256)               │
│  - Audit Logs (Immutable)                   │
└─────────────────────────────────────────────┘
```

---

## 🚀 Getting Started (5 minutes)

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (optional, for development)
- PostgreSQL 14+ or MySQL 8.0+

### Quick Start

```bash
# 1. Clone repository
git clone <repo> commerce && cd commerce

# 2. Install dependencies
npm install

# 3. Copy and configure environment
cp .env.example .env

# 4. Run bootstrap (creates DB, seeds data, generates secrets)
npm run bootstrap

# Output: ✓ Super admin created
#         Email: admin@commerce.local
#         Password: [one-time password shown]

# 5. Start services
npm start

# Backend: http://localhost:3001
# Frontend: http://localhost:3000
```

### First Login
```
Email: admin@commerce.local
Password: [from bootstrap output]

⚠️ Change password immediately after login
```

---

## 📁 Directory Structure

```
commerce/
├── docs/                          # Architecture & design docs
│   ├── ARCHITECTURE.md            # System design
│   ├── SCHEMA.md                  # Database schema
│   ├── API_CONTRACTS.md           # API specifications
│   ├── SECURITY.md                # Security & encryption
│   ├── TESTING.md                 # Test strategy (95%+ coverage)
│   ├── MFE_DESIGN.md              # Micro Frontend architecture
│   └── BOOTSTRAP.md               # Setup & initialization
│
├── backend/                       # Node.js Backend (Clean Arch)
│   ├── src/
│   │   ├── entities/              # Domain entities
│   │   ├── usecases/              # Business logic (use cases)
│   │   ├── controllers/           # HTTP controllers
│   │   ├── services/              # Service layer
│   │   ├── repositories/          # Data access layer
│   │   ├── guards/                # Auth guards (RBAC)
│   │   ├── middleware/            # Express middleware
│   │   ├── utils/                 # Helpers, encryption, validation
│   │   ├── config/                # Configuration
│   │   └── main.ts                # Entry point
│   ├── tests/
│   │   ├── unit/                  # Unit tests
│   │   ├── integration/           # Integration tests
│   │   └── fixtures/              # Test data
│   ├── migrations/                # Database migrations
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── frontend/                      # React Frontend (MFE)
│   ├── host-shell/                # Router shell (port 3000)
│   │   ├── src/
│   │   │   ├── App.tsx            # Main routing
│   │   │   ├── Layout.tsx         # Layout component
│   │   │   └── ErrorBoundary.tsx
│   │   ├── webpack.config.js      # Module Federation config
│   │   └── package.json
│   │
│   ├── auth-mfe/                  # Auth widget (port 3001)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   ├── RegisterPage.tsx
│   │   │   │   └── ForgotPasswordPage.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useAuth.ts
│   │   │   ├── context/
│   │   │   │   └── AuthContext.tsx
│   │   │   └── index.ts           # Module Federation exposes
│   │   └── webpack.config.js
│   │
│   ├── product-mfe/               # Product widget (port 3002)
│   ├── cart-mfe/                  # Cart widget (port 3003)
│   ├── order-mfe/                 # Order widget (port 3004)
│   ├── seller-mfe/                # Seller dashboard (port 3005)
│   ├── admin-mfe/                 # Admin dashboard (port 3006)
│   │
│   └── shared/                    # Shared components, hooks, types
│       ├── src/
│       │   ├── components/        # Reusable components
│       │   ├── hooks/             # Shared hooks
│       │   ├── context/           # Shared context (Auth)
│       │   ├── types/             # TypeScript types
│       │   ├── utils/             # Utilities
│       │   └── api/               # API client
│       └── package.json
│
├── shared/                        # Shared TypeScript types
│   └── src/
│       ├── entities/              # Domain models
│       ├── contracts/             # API contracts
│       └── enums/                 # Type-safe enums
│
├── scripts/                       # DevOps & setup scripts
│   ├── bootstrap.sh               # First-run initialization
│   ├── seed/                      # Database seed scripts
│   └── database/
│       └── init.sql
│
├── .env.example                   # Environment template
├── docker-compose.yml             # Docker services
├── package.json                   # Root package.json
├── README.md                      # This file
└── ARCHITECTURE.md                # High-level architecture
```

---

## 🔑 Core Features

### 1. **Multi-Role Access Control**
- **Super Admin**: Full platform control, impersonate any user, audit logs
- **Admin**: User management, seller verification, platform configuration
- **Seller**: Product CRUD, shop management, GST configuration per product
- **Customer**: Browse products, cart management, order placement

### 2. **GST Tax Management**
- Per-product GST slab (0%, 5%, 12%, 18%, 28%)
- Cart-level tax calculation
- Order-item immutable tax snapshot
- Invoice with full GST breakup

### 3. **Secure Authentication**
- JWT + refresh token rotation
- Bcrypt password hashing
- Two-factor authentication (optional)
- Rate-limited login (5 attempts/15 min)

### 4. **Admin Impersonation (Audit-Ready)**
- Time-bound impersonation sessions (max 240 min)
- PII masking during impersonation
- Comprehensive audit logging
- Cannot impersonate other admins

### 5. **Payment Integration (Testing)**
- Sandbox mode only (no real card processing)
- Payment state machine (INITIATED → PENDING → SUCCESS/FAILED)
- Webhook signature verification
- Idempotent webhook processing

### 6. **Encryption & Security**
- TLS 1.2+ in transit
- AES-256-GCM field-level encryption at rest
- Encrypted fields: email, phone, address, GSTIN, bank accounts
- Keys stored in secure vault

### 7. **Audit & Compliance**
- Immutable append-only audit logs
- Actor tracking (user, admin, system)
- IP address logging
- Impersonation flagging
- Queryable audit trail

### 8. **Micro Frontend Architecture**
- Widget-based design
- Webpack Module Federation
- Independent deployment per MFE
- Shared dependencies (React, React Router)
- Lazy-loaded modules

---

## 🧪 Testing Standards

**Minimum Coverage**: 95% unit + integration tests

**Critical Test Suites**:
- ✅ GST calculation (100% - all 5 slabs)
- ✅ RBAC enforcement (100% - all roles)
- ✅ JWT token lifecycle (100% - rotation, revocation)
- ✅ Payment state machine (100% - all transitions)
- ✅ Impersonation logic (100% - time, permissions, masking)
- ✅ Encryption (100% - encrypt/decrypt, tampering)
- ✅ Audit log immutability (100%)

```bash
# Run tests with coverage
npm run test:coverage

# Output: Coverage: 96.2% (must be ≥95%)
# Build FAILS if coverage < 95%
```

---

## 🔐 Security Checklist

- [x] TLS 1.2+ enforced
- [x] HTTPS only (no HTTP fallback)
- [x] AES-256-GCM encryption for PII
- [x] Bcrypt password hashing
- [x] JWT + token rotation
- [x] RBAC with policy enforcement
- [x] SQL injection prevention (ORM + prepared statements)
- [x] Rate limiting (global + endpoint-specific)
- [x] CSRF protection
- [x] Secure headers (Helmet)
- [x] Input validation (Zod/Joi)
- [x] Immutable audit logs
- [x] Webhook signature verification
- [x] No hardcoded secrets
- [x] PII masking during impersonation

---

## 📊 Database Schema Highlights

**Core Tables** (75+):
- `users` → User accounts & profile
- `user_pii` → Encrypted personal information
- `roles`, `permissions`, `user_roles` → RBAC
- `sellers`, `seller_gstin` → Seller management
- `products`, `product_inventory` → Catalog
- `orders`, `order_items` → Order management
- `order_payments`, `refunds` → Payment tracking
- `gst_slabs` → Tax configuration
- `audit_logs` → Immutable audit trail
- `jwt_registries` → Token revocation

**Constraints**:
- Foreign key integrity enforced
- Not-null constraints on critical fields
- Check constraints for data validation
- Unique constraints for business rules

**Indexing Strategy**:
- Primary key indexes (auto)
- Foreign key indexes (auto)
- Business key indexes (email, phone hash, SKU)
- Query optimization indexes (created_at, status)
- Partial indexes (active records only)

---

## 🚀 Deployment

### Development (Local)

```bash
# Start all services
docker-compose up

# Or manually:
cd backend && npm start
cd frontend/host-shell && npm start
# Plus other MFEs...
```

### Production (Kubernetes / Docker Swarm)

See [BOOTSTRAP.md](./docs/BOOTSTRAP.md#deployment-strategy)

---

## 📈 Performance Targets

| Metric | Target |
|--------|--------|
| API Response (p95) | <100ms |
| Login | <500ms |
| Product List | <200ms |
| Cart Update | <300ms |
| Order Creation | <500ms |
| Tax Calculation | <100ms |
| Audit Query (1M+ rows) | <1s |

---

## 🛠️ Development Workflow

### Add a New Feature

1. **Design Phase**
   - Update ARCHITECTURE.md if domain changes
   - Update SCHEMA.md if DB changes needed
   - Update API_CONTRACTS.md for new endpoints

2. **Implementation Phase**
   - Write tests first (TDD)
   - Implement backend logic
   - Implement frontend components
   - Update MFE exports if needed

3. **Testing Phase**
   - Run `npm run test:coverage`
   - Must maintain ≥95% coverage
   - Run integration tests
   - Manual testing

4. **Audit Phase**
   - Security review (RBAC, encryption, input validation)
   - Performance review
   - Documentation update
   - Peer code review

### Example: Add New GST Slab

```typescript
// 1. Update SCHEMA.md (gst_slabs table)
// 2. Create migration
npm run migrate:create -- add_new_gst_slab

// 3. Write tests
describe('TaxService with new GST 32% slab', () => {
  it('should calculate 32% slab correctly', () => {
    const result = taxService.calculateItemTax(1000, 32);
    expect(result.gstAmount).toBe(320);
  });
});

// 4. Seed data
npm run seed -- gst-slabs

// 5. Update API docs
// docs/API_CONTRACTS.md → response examples

// 6. Test coverage must stay ≥95%
npm run test:coverage
```

---

## 📚 Learning Resources

### Architecture
- Read [ARCHITECTURE.md](./ARCHITECTURE.md) first (20 min)
- Then [SCHEMA.md](./docs/SCHEMA.md) for data model (15 min)
- [MFE_DESIGN.md](./docs/MFE_DESIGN.md) for frontend (10 min)

### Security
- [SECURITY.md](./docs/SECURITY.md) → Encryption, RBAC, audit (25 min)

### API
- [API_CONTRACTS.md](./docs/API_CONTRACTS.md) → Endpoint specifications (15 min)

### Testing
- [TESTING.md](./docs/TESTING.md) → Test strategy, coverage (20 min)

### Deployment
- [BOOTSTRAP.md](./docs/BOOTSTRAP.md) → First-run setup (10 min)

---

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check .env DATABASE_* variables
cat .env | grep DATABASE

# Test connection
psql postgresql://user:pass@localhost:5432/dbname

# Verify PostgreSQL is running
docker ps | grep postgres
```

### Coverage < 95%
```bash
# Run coverage report
npm run test:coverage

# Find uncovered lines
open coverage/index.html

# Add tests for uncovered code
```

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process (if safe)
kill -9 <PID>

# Or change port in .env
API_PORT=3002
```

### Bootstrap Failed
```bash
# Check logs
tail -f bootstrap.log

# Rerun with verbose
DEBUG=* npm run bootstrap:dev

# Manually check DB
psql $DATABASE_URL -c "SELECT version();"
```

---

## 📞 Support & Contribution

### Questions?
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Database**: See [SCHEMA.md](./docs/SCHEMA.md)
- **API**: See [API_CONTRACTS.md](./docs/API_CONTRACTS.md)
- **Security**: See [SECURITY.md](./docs/SECURITY.md)

### Found a Bug?
1. Create an issue with reproduction steps
2. Include error logs and screenshots
3. Reference relevant documentation

### Want to Contribute?
1. Fork repository
2. Create feature branch: `git checkout -b feature/xyz`
3. Ensure tests pass: `npm run test:coverage`
4. Ensure coverage ≥95%: `npm run test:coverage`
5. Submit pull request with design docs update

---

## 📝 License

**Proprietary** - Internal use only. All rights reserved.

---

## 🎓 21-Year Design Philosophy

This system is architected for:

- **Longevity** (20+ years): Clean architecture, no technical debt
- **Scalability** (1M+ QPS): Stateless services, horizontal scaling
- **Security** (SOC-2 ready): Encryption, RBAC, audit trails
- **Maintainability** (95%+ tests): High coverage, clear contracts
- **Extensibility** (MFE ready): Modular design, API versioning
- **Compliance** (immutable logs): Audit trail, data protection
- **Performance** (<100ms p95): Indexed queries, caching ready

---

**Document Version**: 1.0.0  
**Last Updated**: February 2026  
**Next Review**: August 2026  

**Built with ❤️ for enterprise excellence.**
