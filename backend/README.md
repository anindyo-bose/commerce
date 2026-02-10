# Backend - E-Commerce Platform

Production-ready Node.js backend following Clean Architecture principles.

## Structure

```
src/
├── entities/        # Domain models (no dependencies)
├── usecases/        # Business logic (orchestration)
├── services/        # Service layer (business operations)
├── repositories/    # Data access layer (ORM)
├── controllers/     # HTTP request handlers
├── guards/          # Auth guards (RBAC)
├── middleware/      # Express middleware
├── utils/           # Helper functions, encryption, validation
├── config/          # Configuration & constants
└── main.ts          # Entry point
```

## Development

```bash
# Install
npm install

# Dev mode (auto-reload)
npm run dev

# Build
npm run build

# Run tests
npm run test:coverage
```

## Requirements

- Node.js 18+
- PostgreSQL 14+ or MySQL 8.0+
- Environment variables (see .env.example)

## API Documentation

See [../docs/API_CONTRACTS.md](../docs/API_CONTRACTS.md)

## Security

- ✅ TLS 1.2+ enforced
- ✅ JWT + refresh token rotation
- ✅ AES-256-GCM field encryption
- ✅ RBAC with policy guards
- ✅ SQL injection prevention (ORM)
- ✅ Rate limiting
- ✅ Input validation
- ✅ Audit logging

See [../docs/SECURITY.md](../docs/SECURITY.md) for details.

## Testing

Minimum 95% coverage enforced. See [../docs/TESTING.md](../docs/TESTING.md)

```bash
npm run test:coverage
```
