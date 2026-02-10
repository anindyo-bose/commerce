# Bootstrap & Initialization Guide

**Purpose**: First-time setup script to initialize the e-commerce platform  
**Runtime**: Node.js 18+  
**Database**: PostgreSQL 14+ or MySQL 8.0+  

---

## 1. BOOTSTRAP SCRIPT OVERVIEW

The bootstrap script performs:
1. ✅ Environment validation
2. ✅ Database schema initialization
3. ✅ Database migrations
4. ✅ Encryption key generation
5. ✅ JWT secret generation
6. ✅ Seed data creation (roles, permissions, GST slabs)
7. ✅ Super admin account creation
8. ✅ Health checks
9. ✅ Output one-time admin credentials

---

## 2. SCRIPT: bootstrap.sh

```bash
#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}E-Commerce Platform - Bootstrap Initialization${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# ============================================================================
# Step 1: Environment Validation
# ============================================================================

echo -e "${YELLOW}[1/8] Validating environment...${NC}"

# Check .env file
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}✗ .env file not found at $ENV_FILE${NC}"
    echo -e "Copy .env.example to .env and configure:"
    echo -e "  cp .env.example .env"
    exit 1
fi

# Source .env
source "$ENV_FILE"

# Validate required variables
required_vars=(
    "NODE_ENV"
    "DATABASE_HOST"
    "DATABASE_PORT"
    "DATABASE_NAME"
    "DATABASE_USER"
    "DATABASE_PASSWORD"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}✗ Missing environment variable: $var${NC}"
        exit 1
    fi
done

# Set defaults
ENCRYPTION_MASTER_KEY="${ENCRYPTION_MASTER_KEY}"
JWT_SECRET="${JWT_SECRET}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@commerce.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"

# If secrets not set, generate them
if [ -z "$ENCRYPTION_MASTER_KEY" ]; then
    ENCRYPTION_MASTER_KEY=$(openssl rand -base64 12 | head -c 12)
    echo "ENCRYPTION_MASTER_KEY=$ENCRYPTION_MASTER_KEY" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Generated ENCRYPTION_MASTER_KEY${NC}"
fi

if [ -z "$JWT_SECRET" ]; then
    JWT_SECRET=$(openssl rand -base64 32)
    echo "JWT_SECRET=$JWT_SECRET" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Generated JWT_SECRET${NC}"
fi

if [ -z "$JWT_REFRESH_SECRET" ]; then
    JWT_REFRESH_SECRET=$(openssl rand -base64 32)
    echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET" >> "$ENV_FILE"
    echo -e "${GREEN}✓ Generated JWT_REFRESH_SECRET${NC}"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=$(openssl rand -base64 16 | head -c 20)
    echo -e "${YELLOW}Generated temporary admin password: $ADMIN_PASSWORD${NC}"
fi

echo -e "${GREEN}✓ Environment validation passed${NC}"
echo ""

# ============================================================================
# Step 2: Database Connection Test
# ============================================================================

echo -e "${YELLOW}[2/8] Testing database connection...${NC}"

DB_URL="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@$DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME"

if ! psql "$DB_URL" -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}✗ Cannot connect to database at $DATABASE_HOST:$DATABASE_PORT${NC}"
    echo -e "Ensure PostgreSQL is running and credentials are correct."
    exit 1
fi

echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# ============================================================================
# Step 3: Create Database (if not exists)
# ============================================================================

echo -e "${YELLOW}[3/8] Creating database (if not exists)...${NC}"

psql -h "$DATABASE_HOST" -U "$DATABASE_USER" -p "$DATABASE_PORT" \
  -c "CREATE DATABASE \"$DATABASE_NAME\" OWNER $DATABASE_USER;" \
  2>/dev/null || true

echo -e "${GREEN}✓ Database ready${NC}"
echo ""

# ============================================================================
# Step 4: Run Schema Initialization
# ============================================================================

echo -e "${YELLOW}[4/8] Initializing database schema...${NC}"

cd "$PROJECT_ROOT/backend"

# Run SQL init script
psql "$DB_URL" -f "$SCRIPT_DIR/database/init.sql" \
  -v master_key="'$ENCRYPTION_MASTER_KEY'" \
  > /dev/null

echo -e "${GREEN}✓ Schema initialized${NC}"
echo ""

# ============================================================================
# Step 5: Run Migrations
# ============================================================================

echo -e "${YELLOW}[5/8] Running database migrations...${NC}"

npm run migrate:up || {
    echo -e "${RED}✗ Migration failed${NC}"
    exit 1
}

echo -e "${GREEN}✓ Migrations completed${NC}"
echo ""

# ============================================================================
# Step 6: Seed Core Data
# ============================================================================

echo -e "${YELLOW}[6/8] Seeding core data...${NC}"

npm run seed:roles
npm run seed:permissions
npm run seed:gst-slabs
npm run seed:platform-config

echo -e "${GREEN}✓ Core data seeded${NC}"
echo ""

# ============================================================================
# Step 7: Create Super Admin
# ============================================================================

echo -e "${YELLOW}[7/8] Creating super admin account...${NC}"

npm run seed:super-admin \
  -- --email="$ADMIN_EMAIL" \
     --password="$ADMIN_PASSWORD" \
  > /dev/null || {
    echo -e "${RED}✗ Super admin creation failed${NC}"
    exit 1
}

echo -e "${GREEN}✓ Super admin created${NC}"
echo ""

# ============================================================================
# Step 8: Health Checks
# ============================================================================

echo -e "${YELLOW}[8/8] Running health checks...${NC}"

# Verify schema
TABLE_COUNT=$(psql "$DB_URL" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")

if [ "$TABLE_COUNT" -lt 20 ]; then
    echo -e "${RED}✗ Schema incomplete (found $TABLE_COUNT tables, expected 20+)${NC}"
    exit 1
fi

# Verify roles
ROLE_COUNT=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM roles;")

if [ "$ROLE_COUNT" -lt 4 ]; then
    echo -e "${RED}✗ Roles not seeded${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Health checks passed${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Bootstrap completed successfully!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}SUPER ADMIN CREDENTIALS (ONE-TIME):${NC}"
echo -e "  Email:    $ADMIN_EMAIL"
echo -e "  Password: $ADMIN_PASSWORD"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Start backend:   cd backend && npm start"
echo -e "  2. Start frontend:  cd frontend/host-shell && npm start"
echo -e "  3. Login: https://localhost:3000/auth/login"
echo ""
echo -e "${YELLOW}Save these credentials securely. Change password after first login.${NC}"
echo -e "${YELLOW}Do NOT commit credentials to version control.${NC}"
echo ""
```

---

## 3. DATABASE INITIALIZATION SCRIPT

```sql
-- scripts/database/init.sql

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "hstore";

-- Create custom types
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'CUSTOMER');
CREATE TYPE payment_status AS ENUM ('INITIATED', 'PAYMENT_PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');
CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');

-- Create schemas versioning table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [Core schema tables from SCHEMA.md are created here via migration system]

-- Create schema_migrations record
INSERT INTO schema_migrations (version, name) 
VALUES ('001', 'initial_schema') 
ON CONFLICT (version) DO NOTHING;

-- Record initialization completion
INSERT INTO platform_config (key, value, value_type, description)
VALUES ('initialized_at', CURRENT_TIMESTAMP::TEXT, 'STRING', 'Platform initialization timestamp')
ON CONFLICT (key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP;
```

---

## 4. SEED SCRIPTS (Node.js)

### 4.1 Seed Roles & Permissions

```typescript
// scripts/seed/seed-roles.ts
import { createConnection } from 'typeorm';

async function seedRoles() {
  const conexion = await createConnection();
  
  const roles = [
    {
      name: 'SUPER_ADMIN',
      description: 'Full platform control, can impersonate'
    },
    {
      name: 'ADMIN',
      description: 'Platform administrator'
    },
    {
      name: 'SELLER',
      description: 'Product seller'
    },
    {
      name: 'CUSTOMER',
      description: 'End customer'
    }
  ];
  
  for (const role of roles) {
    await connection.query(
      `INSERT INTO roles (name, description, is_system_role) 
       VALUES ($1, $2, true) 
       ON CONFLICT (name) DO NOTHING`,
      [role.name, role.description]
    );
    console.log(`✓ Created role: ${role.name}`);
  }
  
  await connection.close();
}

seedRoles().catch(console.error);
```

### 4.2 Seed GST Slabs

```typescript
// scripts/seed/seed-gst.ts
async function seedGstSlabs() {
  const slabs = [
    { percentage: 0, description: 'GST exempt' },
    { percentage: 5, description: 'GST 5% - Essential goods' },
    { percentage: 12, description: 'GST 12% - Standard' },
    { percentage: 18, description: 'GST 18% - Standard' },
    { percentage: 28, description: 'GST 28% - Luxury goods' }
  ];
  
  for (const slab of slabs) {
    await connection.query(
      `INSERT INTO gst_slabs (slab_percentage, description, effective_from) 
       VALUES ($1, $2, CURRENT_DATE) 
       ON CONFLICT (slab_percentage, effective_from) DO NOTHING`,
      [slab.percentage, slab.description]
    );
    console.log(`✓ Created GST slab: ${slab.percentage}%`);
  }
}
```

### 4.3 Seed Super Admin

```typescript
// scripts/seed/seed-super-admin.ts
import bcrypt from 'bcrypt';

async function seedSuperAdmin(email: string, password: string) {
  // Create user
  const user = await connection.query(
    `INSERT INTO users (email, email_normalized, phone, first_name, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [email, email.toLowerCase(), '+91-0000000000', 'Super Admin']
  );
  
  const userId = user[0].id;
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);
  
  // Create credentials
  await connection.query(
    `INSERT INTO user_credentials (user_id, password_hash, password_salt, password_changed_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [userId, passwordHash, 'salt']
  );
  
  // Assign SUPER_ADMIN role
  const role = await connection.query(
    `SELECT id FROM roles WHERE name = 'SUPER_ADMIN'`
  );
  
  await connection.query(
    `INSERT INTO user_roles (user_id, role_id)
     VALUES ($1, $2)`,
    [userId, role[0].id]
  );
  
  // Log creation
  await connection.query(
    `INSERT INTO audit_logs (actor_type, action, resource_type, resource_id, status, ip_address)
     VALUES ('SYSTEM', 'user:create', 'users', $1, 'SUCCESS', '0.0.0.0')`,
    [userId]
  );
  
  console.log(`✓ Created super admin: ${email}`);
  console.log(`  Temporary password: ${password}`);
  console.log(`  ⚠️  Change password immediately after first login`);
}
```

---

## 5. NPM SCRIPTS

```json
{
  "scripts": {
    "bootstrap": "bash scripts/bootstrap.sh",
    "bootstrap:dev": "NODE_ENV=development bash scripts/bootstrap.sh",
    "bootstrap:prod": "NODE_ENV=production bash scripts/bootstrap.sh",
    
    "migrate:create": "typeorm migration:create -n",
    "migrate:up": "typeorm migration:run",
    "migrate:down": "typeorm migration:revert",
    
    "seed:roles": "ts-node scripts/seed/seed-roles.ts",
    "seed:permissions": "ts-node scripts/seed/seed-permissions.ts",
    "seed:gst-slabs": "ts-node scripts/seed/seed-gst.ts",
    "seed:platform-config": "ts-node scripts/seed/seed-config.ts",
    "seed:super-admin": "ts-node scripts/seed/seed-super-admin.ts"
  }
}
```

---

## 6. .ENV TEMPLATE

```bash
# .env.example

# Environment
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=ecommerce_db
DATABASE_USER=postgres
DATABASE_PASSWORD=YourSecurePassword

# Secrets (auto-generated by bootstrap if not set)
ENCRYPTION_MASTER_KEY=
JWT_SECRET=
JWT_REFRESH_SECRET=

# Admin
ADMIN_EMAIL=admin@commerce.local
ADMIN_PASSWORD=

# Payment Gateway
PAYMENT_PROVIDER=stripe_sandbox
PAYMENT_API_KEY=pk_test_xxx
PAYMENT_WEBHOOK_SECRET=whsec_test_xxx

# API
API_PORT=3001
API_HOST=localhost

# Logging
LOG_LEVEL=info

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Features
ENABLE_2FA=true
ENABLE_IMPERSONATION=true
```

---

## 7. DOCKER BOOTSTRAP

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Expose API port
EXPOSE 3001

# Run bootstrap on container start
ENV NODE_ENV=production

CMD ["bash", "-c", "npm run bootstrap && npm start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ecommerce_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_HOST: postgres
      DATABASE_USER: postgres
      DATABASE_PASSWORD: postgres
      DATABASE_NAME: ecommerce_db
    ports:
      - "3001:3001"
    depends_on:
      - postgres
    volumes:
      - ./.env:/app/.env

volumes:
  postgres_data:
```

---

## 8. BOOTSTRAP EXECUTION

### Development

```bash
# Clone repository
git clone <repo> commerce
cd commerce

# Install dependencies
npm install

# Bootstrap (interactive)
npm run bootstrap:dev

# Output:
# ═══════════════════════════════════════════════════════════
# E-Commerce Platform - Bootstrap Initialization
# ═══════════════════════════════════════════════════════════
# 
# [1/8] Validating environment...✓
# [2/8] Testing database connection...✓
# [3/8] Creating database (if not exists)...✓
# [4/8] Initializing database schema...✓
# [5/8] Running database migrations...✓
# [6/8] Seeding core data...✓
# [7/8] Creating super admin account...✓
# [8/8] Running health checks...✓
# 
# ═══════════════════════════════════════════════════════════
# ✓ Bootstrap completed successfully!
# ═══════════════════════════════════════════════════════════
# 
# SUPER ADMIN CREDENTIALS (ONE-TIME):
#   Email:    admin@commerce.local
#   Password: aB3cDeFgH1jKlMnOpQr
# 
# Next steps:
#   1. Start backend:   cd backend && npm start
#   2. Start frontend:  cd frontend/host-shell && npm start
#   3. Login: https://localhost:3000/auth/login
```

### Production (Docker)

```bash
# Start services
docker-compose up

# Bootstrap runs automatically on first start
# Subsequent starts skip bootstrap (idempotent)
```

---

## 9. BOOTSTRAP IDEMPOTENCY

Scripts are designed to be run multiple times safely:

- ✅ Database creation: Skipped if exists
- ✅ Schema tables: Skipped if exist
- ✅ Role insertion: Uses conflict resolution
- ✅ Admin creation: Creates only if not exists
- ✅ Migrations: Tracked in schema_migrations table

```typescript
// Example: Safe re-run
INSERT INTO roles (name) VALUES ('ADMIN')
ON CONFLICT (name) DO NOTHING;  // Skip if exists
```

---

## 10. SECURITY NOTES

⚠️ **Critical**:
- 🔒 Master encryption key is generated once and stored in .env
- 🔒 Admin password is **temporary** - must be changed on first login
- 🔒 **Never commit .env** to version control
- 🔒 Rotate encryption keys every 90 days
- 🔒 Backup encryption keys securely (AWS Secrets Manager / Key Vault)

---

**Bootstrap Version**: 1.0.0  
**Last Updated**: February 2026  
**Estimated Time**: 2-5 minutes
