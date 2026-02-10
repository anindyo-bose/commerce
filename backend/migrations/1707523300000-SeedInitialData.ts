import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedInitialData1707523300000 implements MigrationInterface {
  name = 'SeedInitialData1707523300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ==================
    // Seed Roles
    // ==================
    await queryRunner.query(`
      INSERT INTO "roles" ("id", "name", "description", "is_system") VALUES
        (uuid_generate_v4(), 'SUPER_ADMIN', 'Super administrator with full system access', true),
        (uuid_generate_v4(), 'ADMIN', 'Administrator with management access', true),
        (uuid_generate_v4(), 'SELLER', 'Seller account for managing products and orders', true),
        (uuid_generate_v4(), 'CUSTOMER', 'Customer account for shopping', true)
      ON CONFLICT (name) DO NOTHING
    `);

    // ==================
    // Seed Permissions
    // ==================
    await queryRunner.query(`
      INSERT INTO "permissions" ("resource", "action", "description") VALUES
        ('users', 'read', 'View user information'),
        ('users', 'write', 'Create or update users'),
        ('users', 'delete', 'Delete users'),
        ('sellers', 'read', 'View seller information'),
        ('sellers', 'write', 'Create or update sellers'),
        ('sellers', 'verify', 'Verify seller accounts'),
        ('products', 'read', 'View products'),
        ('products', 'write', 'Create or update products'),
        ('products', 'delete', 'Delete products'),
        ('orders', 'read', 'View orders'),
        ('orders', 'write', 'Create or update orders'),
        ('cart', 'write', 'Manage shopping cart'),
        ('audit', 'read', 'View audit logs'),
        ('impersonate', 'start', 'Start impersonation session'),
        ('profile', 'write', 'Update own profile')
      ON CONFLICT (resource, action) DO NOTHING
    `);

    // ==================
    // Assign Permissions to Roles
    // ==================
    
    // SUPER_ADMIN gets all permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'SUPER_ADMIN'
      ON CONFLICT DO NOTHING
    `);

    // ADMIN permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.resource IN ('users', 'sellers', 'products', 'orders', 'audit')
        AND p.action IN ('read', 'verify')
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'ADMIN'
        AND p.resource = 'impersonate'
        AND p.action = 'start'
      ON CONFLICT DO NOTHING
    `);

    // SELLER permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'SELLER'
        AND (
          (p.resource = 'products' AND p.action IN ('read', 'write'))
          OR (p.resource = 'orders' AND p.action = 'read')
          OR (p.resource = 'profile' AND p.action = 'write')
        )
      ON CONFLICT DO NOTHING
    `);

    // CUSTOMER permissions
    await queryRunner.query(`
      INSERT INTO "role_permissions" ("role_id", "permission_id")
      SELECT r.id, p.id
      FROM "roles" r
      CROSS JOIN "permissions" p
      WHERE r.name = 'CUSTOMER'
        AND (
          (p.resource = 'products' AND p.action = 'read')
          OR (p.resource = 'cart' AND p.action = 'write')
          OR (p.resource = 'orders' AND p.action IN ('read', 'write'))
          OR (p.resource = 'profile' AND p.action = 'write')
        )
      ON CONFLICT DO NOTHING
    `);

    // ==================
    // Seed GST Slabs
    // ==================
    await queryRunner.query(`
      INSERT INTO "gst_slabs" ("name", "percentage", "is_active") VALUES
        ('GST 0%', 0, true),
        ('GST 5%', 5, true),
        ('GST 12%', 12, true),
        ('GST 18%', 18, true),
        ('GST 28%', 28, true)
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove seed data (in reverse order)
    await queryRunner.query(`DELETE FROM "gst_slabs"`);
    await queryRunner.query(`DELETE FROM "role_permissions"`);
    await queryRunner.query(`DELETE FROM "permissions"`);
    await queryRunner.query(`DELETE FROM "roles"`);
  }
}
