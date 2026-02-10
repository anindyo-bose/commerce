# Database Schema - E-Commerce Platform

**Last Updated**: February 2026  
**RDBMS**: PostgreSQL 14+ / MySQL 8.0+  
**Normalization**: 3NF  

---

## 1. INITIALIZATION & EXTENSIONS

```sql
-- PostgreSQL: Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "hstore";

-- PostgreSQL: Custom types
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'CUSTOMER');
CREATE TYPE payment_status AS ENUM (
  'INITIATED', 'PAYMENT_PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'
);
CREATE TYPE order_status AS ENUM (
  'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'
);
CREATE TYPE gender_enum AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');
```

---

## 2. IDENTITY & ACCESS MANAGEMENT

### 2.1 Users Table (Core Identity)

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  email_normalized VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100),
  date_of_birth DATE,
  gender gender_enum,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Audit columns
  created_by BIGINT,  -- Points to users.id (admin who created)
  ip_address_registered INET,
  
  CONSTRAINT email_valid CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  CONSTRAINT phone_valid CHECK (phone ~ '^\+?[0-9]{10,}$')
);

CREATE INDEX idx_users_email ON users(email_normalized);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE deleted_at IS NULL;
```

### 2.2 User PII (Encrypted Fields)

```sql
CREATE TABLE user_pii (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Encrypted fields (AES-256-GCM)
  email_encrypted BYTEA NOT NULL,
  email_iv BYTEA NOT NULL,
  
  phone_encrypted BYTEA NOT NULL,
  phone_iv BYTEA NOT NULL,
  
  address_encrypted BYTEA NOT NULL,
  address_iv BYTEA NOT NULL,
  
  gstin_encrypted BYTEA,  -- For sellers
  gstin_iv BYTEA,
  
  -- Searchable hashes (for LIKE queries without decryption)
  email_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256
  phone_hash VARCHAR(64) UNIQUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_pii_email_hash ON user_pii(email_hash);
```

### 2.3 User Credentials

```sql
CREATE TABLE user_credentials (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  password_hash VARCHAR(255) NOT NULL,  -- bcrypt($2b$12$...)
  password_salt VARCHAR(255) NOT NULL,
  password_changed_at TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP,
  
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_method ENUM ('SMS', 'EMAIL', 'AUTHENTICATOR'),
  two_factor_verified_at TIMESTAMP,
  two_factor_secret TEXT,  -- If AUTHENTICATOR
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2.4 Roles Definition

```sql
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name user_role UNIQUE NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (name IN ('SUPER_ADMIN', 'ADMIN', 'SELLER', 'CUSTOMER'))
);

INSERT INTO roles (name, description) VALUES
  ('SUPER_ADMIN', 'Full platform control, can impersonate any user'),
  ('ADMIN', 'Platform administrator, user management'),
  ('SELLER', 'Seller with product shop'),
  ('CUSTOMER', 'End customer');
```

### 2.5 Permissions

```sql
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  resource VARCHAR(50),  -- 'users', 'products', 'orders', etc.
  action VARCHAR(50),  -- 'create', 'read', 'update', 'delete'
  is_system_permission BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(resource, action)
);

INSERT INTO permissions (resource, action, description) VALUES
  ('users', 'manage', 'Can manage user accounts'),
  ('products', 'view', 'Can view any product'),
  ('products', 'manage_own', 'Can manage own products'),
  ('orders', 'view_all', 'Can view all orders'),
  ('orders', 'view_own', 'Can view own orders'),
  ('platform', 'config', 'Can manage platform config'),
  ('impersonate', 'execute', 'Can impersonate other users'),
  ('audit', 'view', 'Can view audit logs');
```

### 2.6 Role-Permission Mapping

```sql
CREATE TABLE role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(role_id, permission_id)
);
```

### 2.7 User Roles (M:N)

```sql
CREATE TABLE user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  assigned_by BIGINT REFERENCES users(id),  -- Admin who assigned
  assigned_reason TEXT,
  expires_at TIMESTAMP,  -- For temporary role assignments
  
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
```

### 2.8 JWT Token Registry (For Revocation)

```sql
CREATE TABLE jwt_registries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) UNIQUE NOT NULL,
  token_family VARCHAR(36) NOT NULL,  -- UUID for token family
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revocation_reason VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

CREATE INDEX idx_jwt_user_active ON jwt_registries(user_id)
  WHERE revoked_at IS NULL;
```

---

## 3. SELLERS & SHOPS DOMAIN

### 3.1 Sellers

```sql
CREATE TABLE sellers (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  business_name VARCHAR(255) NOT NULL,
  business_type ENUM ('INDIVIDUAL', 'SOLE_PROPRIETOR', 'PARTNERSHIP', 'CORPORATION'),
  
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'),
  verified_at TIMESTAMP,
  verification_rejected_reason TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(business_name)
);

CREATE INDEX idx_sellers_user ON sellers(user_id);
CREATE INDEX idx_sellers_verified ON sellers(is_verified);
```

### 3.2 Seller Tax Identity

```sql
CREATE TABLE seller_gstin (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT UNIQUE NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  -- Encrypted
  gstin_encrypted BYTEA NOT NULL,
  gstin_iv BYTEA NOT NULL,
  gstin_hash VARCHAR(64) UNIQUE NOT NULL,  -- SHA-256 for search
  
  pan_encrypted BYTEA,
  pan_iv BYTEA,
  
  is_verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Seller Bank Accounts

```sql
CREATE TABLE seller_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  account_holder_name VARCHAR(255) NOT NULL,
  account_number_encrypted BYTEA NOT NULL,
  account_number_iv BYTEA NOT NULL,
  account_number_hash VARCHAR(64) UNIQUE NOT NULL,
  
  ifsc_code VARCHAR(11) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  
  is_primary BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (account_holder_name ~ '^[A-Za-z\s]+$')
);

CREATE INDEX idx_seller_bank_primary ON seller_bank_accounts(seller_id, is_primary);
```

---

## 4. PRODUCTS & CATALOG DOMAIN

### 4.1 GST Slabs (Lookup Table)

```sql
CREATE TABLE gst_slabs (
  id SERIAL PRIMARY KEY,
  slab_percentage DECIMAL(5,2) NOT NULL CHECK (slab_percentage IN (0, 5, 12, 18, 28)),
  description VARCHAR(255),
  effective_from DATE NOT NULL,
  effective_to DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(slab_percentage, effective_from)
);

INSERT INTO gst_slabs (slab_percentage, description, effective_from) VALUES
  (0, 'GST exempt', '2017-07-01'),
  (5, 'GST 5% - Essential goods', '2017-07-01'),
  (12, 'GST 12% - Standard', '2017-07-01'),
  (18, 'GST 18% - Standard', '2017-07-01'),
  (28, 'GST 28% - Luxury goods', '2017-07-01');
```

### 4.2 Products

```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  base_price DECIMAL(10,2) NOT NULL CHECK (base_price >= 0),
  gst_slab_id INT NOT NULL REFERENCES gst_slabs(id),
  
  is_active BOOLEAN DEFAULT TRUE,
  is_visible BOOLEAN DEFAULT TRUE,
  
  category VARCHAR(100),
  tags VARCHAR(255),  -- Comma-separated
  images JSONB,  -- Array of { url, alt_text, sequence }
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  UNIQUE(seller_id, sku),
  CONSTRAINT price_positive CHECK (base_price > 0)
);

CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_active ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_category ON products(category);
```

### 4.3 Product Variants (Optional)

```sql
CREATE TABLE product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  sku_variant VARCHAR(100) NOT NULL,
  variant_name VARCHAR(255),  -- e.g., "Red - Large", "Blue - Medium"
  
  base_price DECIMAL(10,2),  -- Override parent price if set
  
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(product_id, sku_variant)
);
```

### 4.4 Product Inventory

```sql
CREATE TABLE product_inventory (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  
  quantity_on_hand INT NOT NULL DEFAULT 0,
  quantity_reserved INT NOT NULL DEFAULT 0,  -- Items in carts
  quantity_available INT GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  
  reorder_level INT DEFAULT 10,
  warehouse_location VARCHAR(100),
  
  last_restocked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (quantity_on_hand >= 0),
  CHECK (quantity_reserved >= 0)
);

CREATE INDEX idx_inventory_low_stock ON product_inventory(quantity_available)
  WHERE quantity_available < 10;
```

---

## 5. SHOPPING CART & CHECKOUT

### 5.1 Shopping Cart

```sql
CREATE TABLE shopping_carts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  session_id VARCHAR(255) UNIQUE NOT NULL,  -- For guest carts
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,  -- 7 days for guest carts
  
  UNIQUE(user_id, is_active)  -- Only one active cart per authenticated user
);

CREATE INDEX idx_carts_user_active ON shopping_carts(user_id, is_active);
```

### 5.2 Cart Items

```sql
CREATE TABLE cart_items (
  id BIGSERIAL PRIMARY KEY,
  cart_id BIGSERIAL NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  product_variant_id BIGINT REFERENCES product_variants(id),
  
  quantity INT NOT NULL CHECK (quantity > 0),
  
  -- Snapshot at time of addition
  price_at_addition DECIMAL(10,2) NOT NULL,
  gst_percentage DECIMAL(5,2) NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(cart_id, product_id, product_variant_id)
);
```

---

## 6. ORDERS & TRANSACTIONS

### 6.1 Orders

```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(50) UNIQUE NOT NULL,  -- Customer-facing: ORD-2026-001-12345
  
  user_id BIGINT NOT NULL REFERENCES users(id),
  seller_id BIGINT NOT NULL REFERENCES sellers(id),
  
  order_status order_status DEFAULT 'PENDING',
  payment_status payment_status DEFAULT 'INITIATED',
  
  subtotal_amount DECIMAL(10,2) NOT NULL,
  total_gst_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  
  shipping_fee DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_code VARCHAR(50),
  
  delivery_address_id BIGINT REFERENCES user_addresses(id),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT amount_sanity CHECK (
    total_amount = subtotal_amount + total_gst_amount + shipping_fee - discount_amount
  )
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_seller ON orders(seller_id);
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
```

### 6.2 Order Items (Immutable Snapshot)

```sql
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  product_id BIGINT NOT NULL REFERENCES products(id),
  product_variant_id BIGINT,
  
  -- Snapshots (cannot change after order placement)
  product_sku VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,  -- Price at order time
  
  gst_slab_id INT NOT NULL REFERENCES gst_slabs(id),
  gst_percentage DECIMAL(5,2) NOT NULL,
  gst_amount DECIMAL(10,2) NOT NULL,
  
  item_subtotal DECIMAL(10,2) NOT NULL,
  item_total DECIMAL(10,2) NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Read-only after creation
  CONSTRAINT immutable_snapshot CHECK (
    created_at = CURRENT_TIMESTAMP
  )
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

### 6.3 Order Shipments

```sql
CREATE TABLE order_shipments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  tracking_number VARCHAR(100) UNIQUE,
  carrier_name VARCHAR(100),
  
  shipped_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  estimated_delivery_date DATE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. PAYMENTS

### 7.1 Payment Records

```sql
CREATE TABLE order_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  
  payment_method ENUM ('CARD', 'UPI', 'NET_BANKING', 'WALLET'),
  payment_status payment_status NOT NULL,
  
  gateway_name VARCHAR(50),  -- 'STRIPE', 'RAZORPAY', 'MOCK'
  gateway_transaction_id VARCHAR(255) UNIQUE,
  
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'INR',
  
  -- Never store card/UPI data
  last_4_digits VARCHAR(4),  -- Masked
  
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success_at TIMESTAMP,
  failed_at TIMESTAMP,
  
  failure_reason TEXT,
  failure_code VARCHAR(50),
  
  webhook_received_at TIMESTAMP,
  webhook_verified BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(gateway_name, gateway_transaction_id)
);

CREATE INDEX idx_payments_order ON order_payments(order_id);
CREATE INDEX idx_payments_status ON order_payments(payment_status);
```

### 7.2 Refunds

```sql
CREATE TABLE refunds (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES order_payments(id),
  order_id BIGINT NOT NULL REFERENCES orders(id),
  
  refund_reason VARCHAR(255),
  refund_status ENUM ('INITIATED', 'PROCESSED', 'FAILED', 'REVERSED'),
  
  refund_amount DECIMAL(10,2) NOT NULL,
  gateway_refund_id VARCHAR(255) UNIQUE,
  
  initiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. CUSTOMER ADDRESSES

### 8.1 User Addresses

```sql
CREATE TABLE user_addresses (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Encrypted
  address_line_1_encrypted BYTEA NOT NULL,
  address_line_1_iv BYTEA NOT NULL,
  
  address_line_2_encrypted BYTEA,
  address_line_2_iv BYTEA,
  
  city_encrypted BYTEA NOT NULL,
  city_iv BYTEA NOT NULL,
  
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(10) NOT NULL,
  country_code VARCHAR(2) DEFAULT 'IN',
  
  address_type ENUM ('RESIDENTIAL', 'COMMERCIAL', 'OFFICE'),
  is_default_shipping BOOLEAN DEFAULT FALSE,
  is_default_billing BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_addresses_user ON user_addresses(user_id);
```

---

## 9. AUDIT & COMPLIANCE

### 9.1 Audit Logs (Immutable Append-Only)

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Actor information
  actor_type ENUM ('USER', 'ADMIN', 'SYSTEM') NOT NULL,
  actor_id BIGINT,  -- References users.id
  
  -- Action details
  action VARCHAR(100) NOT NULL,  -- e.g., 'products:create', 'orders:update'
  resource_type VARCHAR(100) NOT NULL,  -- e.g., 'products', 'orders'
  resource_id BIGINT NOT NULL,
  
  -- Change tracking
  changes JSONB,  -- { before: {...}, after: {...} }
  
  -- Network info
  ip_address INET NOT NULL,
  user_agent TEXT,
  
  -- Impersonation tracking
  impersonation_flag BOOLEAN DEFAULT FALSE,
  impersonated_by BIGINT,  -- References users.id (admin)
  impersonation_reason TEXT,
  
  -- Result
  status ENUM ('SUCCESS', 'FAILURE') DEFAULT 'SUCCESS',
  error_message TEXT,
  
  -- Prevention of modification
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_impersonation ON audit_logs(impersonation_flag)
  WHERE impersonation_flag = TRUE;

-- PostgreSQL: Prevent modifications (immutable table)
CREATE POLICY audit_logs_prevent_update ON audit_logs
  AS (false) FOR UPDATE;

CREATE POLICY audit_logs_prevent_delete ON audit_logs
  AS (false) FOR DELETE;
```

### 9.2 Impersonation Sessions

```sql
CREATE TABLE impersonation_sessions (
  id BIGSERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES users(id),
  impersonated_user_id BIGINT NOT NULL REFERENCES users(id),
  
  session_token_hash VARCHAR(255) UNIQUE NOT NULL,
  
  reason TEXT NOT NULL,
  
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  
  ip_address INET,
  
  CHECK (expires_at > started_at),
  CHECK (admin_id != impersonated_user_id)
);

CREATE INDEX idx_imperson_admin ON impersonation_sessions(admin_id);
CREATE INDEX idx_imperson_user ON impersonation_sessions(impersonated_user_id);
CREATE INDEX idx_imperson_active ON impersonation_sessions(started_at, expires_at)
  WHERE ended_at IS NULL;
```

---

## 10. PLATFORM CONFIGURATION

### 10.1 Platform Config

```sql
CREATE TABLE platform_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON'),
  description TEXT,
  is_secret BOOLEAN DEFAULT FALSE,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by BIGINT REFERENCES users(id)
);

INSERT INTO platform_config (key, value, value_type) VALUES
  ('platform_name', 'E-Commerce Platform', 'STRING'),
  ('payment_gateway_sandbox', 'true', 'BOOLEAN'),
  ('jwt_token_expiry_minutes', '15', 'NUMBER'),
  ('refresh_token_expiry_days', '7', 'NUMBER'),
  ('max_login_attempts', '5', 'NUMBER');
```

---

## 11. INDEXES & PERFORMANCE

### 11.1 Critical Indexes Summary

| Table | Index | Type | Purpose |
|-------|-------|------|---------|
| users | email_normalized | UNIQUE | Login & uniqueness |
| products | (seller_id, sku) | UNIQUE | Business constraint |
| orders | (user_id, created_at DESC) | COMPOSITE | Order history pagination |
| order_items | order_id | FK | Order detail retrieval |
| audit_logs | (timestamp DESC) | INDEX | Audit trail retrieval |
| jwt_registries | refresh_token_hash | UNIQUE | Token revocation |

### 11.2 Query Performance Targets

- User login: < 50ms
- Product listing: < 200ms (with filters)
- Order creation: < 500ms
- Tax calculation: < 100ms
- Audit query: < 1s (1M+ rows)

---

## 12. DATA RETENTION & PURGING

```sql
-- Soft delete policy for users (GDPR Right to Forget)
-- Physical deletion after 90 days
CREATE TABLE deleted_user_purge_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  deleted_at TIMESTAMP NOT NULL,
  scheduled_purge_date DATE NOT NULL,
  purged_at TIMESTAMP,
  
  CONSTRAINT purge_after_90_days CHECK (
    scheduled_purge_date = (deleted_at::DATE + INTERVAL '90 days')
  )
);

-- JWT tokens: Auto-expire after expiry_at
-- Refresh tokens: Keep for 30 days after revocation for security analysis
```

---

## 13. MIGRATION STRATEGY

**Versioning**: timestamp + sequence  
**Example**: `001_20260210_001_initial_schema.sql`

```sql
-- migrations/001_20260210_001_initial_schema.sql
-- Up: Creates initial schema
-- Down: Rolls back initial schema

BEGIN;
-- ... DDL statements ...
COMMIT;

-- Record migration
INSERT INTO schema_migrations (version, name, executed_at) 
VALUES ('001_20260210_001', 'initial_schema', CURRENT_TIMESTAMP);
```

---

## 14. REFERENTIAL INTEGRITY

```sql
-- Enforce referential integrity
-- No cascading deletes for audit/financial records
-- Only soft-delete via deleted_at timestamp
```

All foreign keys defined with:
- `ON DELETE CASCADE` for lookup tables (gst_slabs)
- `ON DELETE RESTRICT` for financial records (orders, payments)
- `ON DELETE SET NULL` for optional references (created_by)

---

**Schema Version**: 1.0.0  
**Last Updated**: February 2026  
**Compatibility**: PostgreSQL 14+, MySQL 8.0+
