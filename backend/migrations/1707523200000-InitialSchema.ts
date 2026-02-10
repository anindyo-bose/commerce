import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1707523200000 implements MigrationInterface {
  name = 'InitialSchema1707523200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // ==================
    // RBAC Tables
    // ==================
    
    // Roles table
    await queryRunner.query(`
      CREATE TABLE "roles" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(50) NOT NULL UNIQUE,
        "description" text,
        "is_system" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Permissions table
    await queryRunner.query(`
      CREATE TABLE "permissions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "resource" varchar(100) NOT NULL,
        "action" varchar(50) NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now(),
        UNIQUE("resource", "action")
      )
    `);

    // Role-Permission mapping
    await queryRunner.query(`
      CREATE TABLE "role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        "granted_at" timestamp DEFAULT now(),
        PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
      )
    `);

    // ==================
    // User Tables
    // ==================
    
    // Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL UNIQUE,
        "email_normalized" varchar(255) NOT NULL,
        "email_hash" varchar(64) NOT NULL,
        "phone" varchar(20) NOT NULL,
        "phone_hash" varchar(64) NOT NULL,
        "first_name" varchar(100) NOT NULL,
        "last_name" varchar(100),
        "is_active" boolean DEFAULT true,
        "is_email_verified" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Indexes for users
    await queryRunner.query(`CREATE INDEX "idx_users_email_hash" ON "users"("email_hash")`);
    await queryRunner.query(`CREATE INDEX "idx_users_phone_hash" ON "users"("phone_hash")`);
    await queryRunner.query(`CREATE INDEX "idx_users_created_at" ON "users"("created_at" DESC)`);

    // User PII (encrypted)
    await queryRunner.query(`
      CREATE TABLE "user_pii" (
        "user_id" uuid PRIMARY KEY,
        "email_encrypted" text NOT NULL,
        "email_iv" varchar(64) NOT NULL,
        "phone_encrypted" text NOT NULL,
        "phone_iv" varchar(64) NOT NULL,
        "address_encrypted" text,
        "address_iv" varchar(64),
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_user_pii_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // User credentials
    await queryRunner.query(`
      CREATE TABLE "user_credentials" (
        "user_id" uuid PRIMARY KEY,
        "password_hash" varchar(255) NOT NULL,
        "failed_login_attempts" integer DEFAULT 0,
        "locked_until" timestamp,
        "two_factor_enabled" boolean DEFAULT false,
        "two_factor_secret" varchar(255),
        "last_password_change" timestamp DEFAULT now(),
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_user_credentials_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // User-Role mapping
    await queryRunner.query(`
      CREATE TABLE "user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "assigned_at" timestamp DEFAULT now(),
        "assigned_by" uuid,
        PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "fk_user_roles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_roles_role" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
      )
    `);

    // JWT token registry (for blacklisting)
    await queryRunner.query(`
      CREATE TABLE "jwt_tokens" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_family_id" uuid NOT NULL,
        "jti" varchar(255) NOT NULL UNIQUE,
        "type" varchar(20) NOT NULL,
        "is_revoked" boolean DEFAULT false,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_jwt_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_jwt_tokens_jti" ON "jwt_tokens"("jti")`);
    await queryRunner.query(`CREATE INDEX "idx_jwt_tokens_user" ON "jwt_tokens"("user_id")`);

    // ==================
    // GST Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "gst_slabs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(50) NOT NULL,
        "percentage" decimal(5,2) NOT NULL,
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "chk_gst_percentage" CHECK (percentage IN (0, 5, 12, 18, 28))
      )
    `);

    // ==================
    // Seller Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "sellers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL UNIQUE,
        "business_name" varchar(200) NOT NULL UNIQUE,
        "business_type" varchar(50) NOT NULL,
        "status" varchar(50) DEFAULT 'PENDING_VERIFICATION',
        "verified_at" timestamp,
        "verified_by" uuid,
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_sellers_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_seller_status" CHECK (status IN ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'REJECTED'))
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_sellers_status" ON "sellers"("status")`);
    await queryRunner.query(`CREATE INDEX "idx_sellers_created_at" ON "sellers"("created_at" DESC)`);

    // Seller GSTIN (encrypted)
    await queryRunner.query(`
      CREATE TABLE "seller_gstin" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "gstin_encrypted" text NOT NULL,
        "gstin_iv" varchar(64) NOT NULL,
        "is_primary" boolean DEFAULT true,
        "is_verified" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_seller_gstin_seller" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE
      )
    `);

    // Seller bank accounts (encrypted)
    await queryRunner.query(`
      CREATE TABLE "seller_bank_accounts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "account_number_encrypted" text NOT NULL,
        "account_number_iv" varchar(64) NOT NULL,
        "ifsc_code" varchar(11) NOT NULL,
        "account_holder_name" varchar(200) NOT NULL,
        "is_primary" boolean DEFAULT false,
        "is_verified" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_seller_bank_seller" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE
      )
    `);

    // ==================
    // Product Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "sku" varchar(50) NOT NULL,
        "name" varchar(200) NOT NULL,
        "description" text NOT NULL,
        "base_price" decimal(12,2) NOT NULL,
        "gst_slab_id" uuid NOT NULL,
        "stock" integer DEFAULT 0,
        "is_active" boolean DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_products_seller" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_products_gst_slab" FOREIGN KEY ("gst_slab_id") REFERENCES "gst_slabs"("id"),
        CONSTRAINT "chk_product_price" CHECK (base_price >= 0),
        CONSTRAINT "chk_product_stock" CHECK (stock >= 0),
        UNIQUE("seller_id", "sku")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_products_seller" ON "products"("seller_id")`);
    await queryRunner.query(`CREATE INDEX "idx_products_sku" ON "products"("sku")`);
    await queryRunner.query(`CREATE INDEX "idx_products_active" ON "products"("is_active") WHERE is_active = true`);

    // ==================
    // Cart Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "shopping_carts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "session_id" varchar(255),
        "is_active" boolean DEFAULT true,
        "expires_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_shopping_carts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_cart_user_or_session" CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_carts_user" ON "shopping_carts"("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_carts_session" ON "shopping_carts"("session_id")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_carts_active_user" ON "shopping_carts"("user_id") WHERE is_active = true AND user_id IS NOT NULL`);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "cart_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "base_price" decimal(12,2) NOT NULL,
        "gst_percentage" decimal(5,2) NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_cart_items_cart" FOREIGN KEY ("cart_id") REFERENCES "shopping_carts"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cart_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_cart_item_quantity" CHECK (quantity > 0),
        UNIQUE("cart_id", "product_id")
      )
    `);

    // ==================
    // Order Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "order_number" varchar(50) NOT NULL UNIQUE,
        "order_status" varchar(50) DEFAULT 'PENDING',
        "payment_status" varchar(50) DEFAULT 'INITIATED',
        "subtotal" decimal(12,2) NOT NULL,
        "total_gst" decimal(12,2) NOT NULL,
        "total_amount" decimal(12,2) NOT NULL,
        "shipping_address" text NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id"),
        CONSTRAINT "chk_order_status" CHECK (order_status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
        CONSTRAINT "chk_payment_status" CHECK (payment_status IN ('INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'REFUNDED')),
        CONSTRAINT "chk_order_amounts" CHECK (subtotal >= 0 AND total_gst >= 0 AND total_amount >= 0)
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_orders_user" ON "orders"("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_number" ON "orders"("order_number")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_status" ON "orders"("order_status")`);
    await queryRunner.query(`CREATE INDEX "idx_orders_created_at" ON "orders"("created_at" DESC)`);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "seller_id" uuid NOT NULL,
        "product_name" varchar(200) NOT NULL,
        "sku" varchar(50) NOT NULL,
        "quantity" integer NOT NULL,
        "base_price" decimal(12,2) NOT NULL,
        "gst_percentage" decimal(5,2) NOT NULL,
        "gst_amount" decimal(12,2) NOT NULL,
        "item_total" decimal(12,2) NOT NULL,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_order_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id"),
        CONSTRAINT "fk_order_items_seller" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id"),
        CONSTRAINT "chk_order_item_quantity" CHECK (quantity > 0)
      )
    `);

    // ==================
    // Payment Tables
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "order_payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "gateway_transaction_id" varchar(255) NOT NULL UNIQUE,
        "payment_method" varchar(50),
        "amount" decimal(12,2) NOT NULL,
        "status" varchar(50) DEFAULT 'PENDING',
        "gateway_response" jsonb,
        "webhook_signature" varchar(255),
        "processed_at" timestamp,
        "created_at" timestamp DEFAULT now(),
        CONSTRAINT "fk_order_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_payment_status" CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'REFUNDED'))
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_payments_order" ON "order_payments"("order_id")`);
    await queryRunner.query(`CREATE INDEX "idx_payments_gateway_txn" ON "order_payments"("gateway_transaction_id")`);

    // ==================
    // Audit Log Table
    // ==================
    
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "timestamp" timestamp DEFAULT now(),
        "action" varchar(100) NOT NULL,
        "actor_id" uuid,
        "actor_email" varchar(255),
        "actor_role" varchar(50),
        "resource_type" varchar(100),
        "resource_id" uuid,
        "http_method" varchar(10),
        "endpoint" varchar(255),
        "ip_address" varchar(45),
        "user_agent" text,
        "request_body" jsonb,
        "response_status" integer,
        "is_impersonation" boolean DEFAULT false,
        "impersonator_id" uuid,
        "metadata" jsonb,
        CONSTRAINT "fk_audit_logs_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs"("timestamp" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_actor" ON "audit_logs"("actor_id")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_resource" ON "audit_logs"("resource_type", "resource_id")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_impersonation" ON "audit_logs"("is_impersonation") WHERE is_impersonation = true`);

    // Make audit logs immutable (no UPDATE or DELETE allowed)
    await queryRunner.query(`
      CREATE RULE audit_logs_no_update AS ON UPDATE TO "audit_logs" DO INSTEAD NOTHING;
    `);
    await queryRunner.query(`
      CREATE RULE audit_logs_no_delete AS ON DELETE TO "audit_logs" DO INSTEAD NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop rules
    await queryRunner.query(`DROP RULE IF EXISTS audit_logs_no_delete ON "audit_logs"`);
    await queryRunner.query(`DROP RULE IF EXISTS audit_logs_no_update ON "audit_logs"`);

    // Drop tables in reverse order (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "shopping_carts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_bank_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "seller_gstin"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sellers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "gst_slabs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "jwt_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_roles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_credentials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_pii"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);

    // Drop extensions
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
