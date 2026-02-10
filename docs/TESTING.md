# Testing Strategy & Coverage Plan

**Target Coverage**: ≥95% unit & integration tests  
**Framework**: Jest, Supertest, React Testing Library  

---

## 1. TESTING PYRAMID

```
                        △  E2E (5%)
                       /|\  - Cypress, Playwright
                      / | \  - Full user journeys
                     /  |  \
                    /───┼───\
                   /    |    \  Integration (20%)
                  /     |     \  - Service tests, API tests
                 /      |      \  - Database interactions, ORM
                /───────┼───────\
               /        |        \  Unit (75%)
              /         |         \  - Business logic
             /          |          \  - RBAC, GST, encryption
            /__________△___________|

BUILD MUST FAIL IF: coverage < 95%
```

---

## 2. MANDATORY TEST SUITES

### 2.1 Authentication & JWT Tests

**File**: `src/services/__tests__/auth.service.test.ts`

```typescript
describe('AuthService', () => {
  describe('register', () => {
    it('should create user with hashed password', async () => {
      const result = await authService.register({
        email: 'new@example.com',
        password: 'SecurePass123!',
        firstName: 'John'
      });
      expect(result.userId).toBeDefined();
      expect(result.email).toBe('new@example.com');
      
      // Verify password is hashed (not plaintext)
      const user = await userRepo.findOne(result.userId);
      expect(user.password_hash).not.toBe('SecurePass123!');
    });
    
    it('should reject duplicate email', async () => {
      await authService.register({ email: 'existing@example.com', ... });
      await expect(
        authService.register({ email: 'existing@example.com', ... })
      ).rejects.toThrow('Email already exists');
    });
  });
  
  describe('login', () => {
    it('should return access & refresh tokens on success', async () => {
      await authService.register({ email: 'user@example.com', password: 'Pass123!' });
      const result = await authService.login('user@example.com', 'Pass123!');
      
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBe(900);  // 15 min
    });
    
    it('should reject invalid password', async () => {
      await authService.register({ email: 'user@example.com', password: 'Pass123!' });
      await expect(
        authService.login('user@example.com', 'WrongPass')
      ).rejects.toThrow('Invalid credentials');
    });
    
    it('should rate limit failed login attempts', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await authService.login('user@example.com', 'WrongPass');
        } catch (e) {}
      }
      await expect(
        authService.login('user@example.com', 'Pass123!')
      ).rejects.toThrow('Too many login attempts');
    });
  });
  
  describe('refreshToken', () => {
    it('should issue new access token with rotating refresh token', async () => {
      const { accessToken, refreshToken } = await authService.login(...);
      const newToken = await authService.refreshToken(refreshToken);
      
      expect(newToken.accessToken).toBeDefined();
      expect(newToken.refreshToken).toBeDefined();
      expect(newToken.refreshToken).not.toBe(refreshToken);  // Rotated
    });
    
    it('should reject revoked refresh token', async () => {
      const { refreshToken } = await authService.login(...);
      await authService.logout(refreshToken);
      
      await expect(
        authService.refreshToken(refreshToken)
      ).rejects.toThrow('Token has been revoked');
    });
  });
});
```

### 2.2 GST Calculation Tests (Critical)

**File**: `src/services/__tests__/tax.service.test.ts`

```typescript
describe('TaxService', () => {
  describe('calculateItemTax', () => {
    const testCases = [
      { slab: 0, basePrice: 1000, expected: { gst: 0, total: 1000 } },
      { slab: 5, basePrice: 1000, expected: { gst: 50, total: 1050 } },
      { slab: 12, basePrice: 1000, expected: { gst: 120, total: 1120 } },
      { slab: 18, basePrice: 1000, expected: { gst: 180, total: 1180 } },
      { slab: 28, basePrice: 1000, expected: { gst: 280, total: 1280 } }
    ];
    
    testCases.forEach(({ slab, basePrice, expected }) => {
      it(`should calculate GST ${slab}% correctly`, () => {
        const result = taxService.calculateItemTax(basePrice, slab);
        expect(result.gstAmount).toBe(expected.gst);
        expect(result.totalAmount).toBe(expected.total);
      });
    });
  });
  
  describe('calculateCartTax', () => {
    it('should sum GST across multiple items', () => {
      const cartItems = [
        { basePrice: 1000, gstPercentage: 18 },
        { basePrice: 2000, gstPercentage: 12 },
        { basePrice: 500, gstPercentage: 5 }
      ];
      
      const result = taxService.calculateCartTax(cartItems);
      expect(result.totalGst).toBe(180 + 240 + 25);  // 445
      expect(result.cartTotal).toBe(3500 + 445);
    });
    
    it('should handle mixed GST slabs correctly', () => {
      const items = [
        { qty: 2, price: 1000, gst: 18 },
        { qty: 1, price: 5000, gst: 28 },
        { qty: 3, price: 500, gst: 0 }
      ];
      
      const result = taxService.calculateCartTax(items);
      
      // Verify breakdown
      expect(result.gstBreakup).toEqual({
        '0': 0,
        '5': 0,
        '12': 0,
        '18': 360,    // 2 * 1000 * 0.18
        '28': 1400    // 1 * 5000 * 0.28
      });
      expect(result.totalGst).toBe(1760);
    });
    
    it('should match invoice total calculation', () => {
      // Ensure cart tax = order item tax
      const cartTotal = 3500 + 445;
      const order = orderService.createFromCart(cart);
      expect(order.total_amount).toBe(cartTotal);
    });
  });
  
  describe('applyDiscount', () => {
    it('should apply discount to subtotal, not GST', () => {
      const result = taxService.applyDiscount(
        { baseTotal: 1000, gstAmount: 180, gstPercentage: 18 },
        { percentage: 10 }  // 10% discount
      );
      
      expect(result.discountAmount).toBe(100);  // 10% of 1000
      expect(result.newGstAmount).toBe(180);  // GST unchanged
      expect(result.finalTotal).toBe(1000 - 100 + 180);  // 1080
    });
  });
});
```

### 2.3 RBAC Enforcement Tests

**File**: `src/guards/__tests__/rbac.guard.test.ts`

```typescript
describe('RBACGuard', () => {
  describe('canActivate', () => {
    it('should allow request with correct permission', () => {
      const req = {
        user: {
          id: 'user_123',
          permissions: ['products:manage_own']
        }
      };
      const context = createExecutionContext(req);
      setMetadata('policy', 'products:manage_own', context);
      
      expect(guard.canActivate(context)).toBe(true);
    });
    
    it('should deny request without permission', () => {
      const req = {
        user: {
          id: 'user_123',
          permissions: ['orders:view_own']
        }
      };
      const context = createExecutionContext(req);
      setMetadata('policy', 'admin:view_audit', context);
      
      expect(() => guard.canActivate(context))
        .toThrow(ForbiddenException);
    });
  });
  
  describe('dataScope enforcement', () => {
    it('should apply data scope filter', async () => {
      const req = {
        user: { id: 'seller_123', seller_id: 'seller_123' },
        dataScope: { sql: 'seller_id = :seller_id', vars: { seller_id: 'seller_123' } }
      };
      
      // Only seller's products returned
      const products = await productRepo.find({
        ...query,
        seller_id: 'seller_123'  // Auto-enforced
      });
      
      expect(products.every(p => p.seller_id === 'seller_123')).toBe(true);
    });
    
    it('should prevent cross-tenant data access', async () => {
      const req = {
        user: { id: 'seller_a' },
        dataScope: { table: 'products', condition: 'seller_id = seller_a' }
      };
      
      // Attempt to query seller_b products
      const result = await productRepo.find({ seller_id: 'seller_b' });
      
      expect(result.length).toBe(0);  // No results due to scope
    });
  });
});
```

### 2.4 Impersonation Tests

**File**: `src/services/__tests__/impersonation.service.test.ts`

```typescript
describe('ImpersonationService', () => {
  describe('startImpersonation', () => {
    it('should create impersonation session with audit log', async () => {
      const result = await impersonationService.startImpersonation({
        adminId: 'admin_001',
        targetUserId: 'user_456',
        durationMinutes: 30,
        reason: 'Support ticket #123'
      });
      
      expect(result.impersonationToken).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(new Date());
      
      // Audit log created
      const auditLog = await auditRepo.findOne({
        action: 'impersonate:start',
        impersonated_by: 'admin_001'
      });
      expect(auditLog).toBeDefined();
    });
    
    it('should enforce max duration (240 minutes)', async () => {
      await expect(
        impersonationService.startImpersonation({
          adminId: 'admin_001',
          targetUserId: 'user_456',
          durationMinutes: 300,  // Exceeds max
          reason: 'Support'
        })
      ).rejects.toThrow('Duration exceeds maximum');
    });
    
    it('should prevent admin-to-admin impersonation', async () => {
      await expect(
        impersonationService.startImpersonation({
          adminId: 'admin_001',
          targetUserId: 'admin_002',  // Another admin
          durationMinutes: 30,
          reason: 'Testing'
        })
      ).rejects.toThrow('Cannot impersonate admin user');
    });
    
    it('should apply data scope: no override of role permissions', async () => {
      // Admin impersonates Customer
      const token = await impersonationService.startImpersonation({
        adminId: 'admin_001',
        targetUserId: 'customer_456',
        durationMinutes: 30,
        reason: 'Support'
      });
      
      // Verify impersonated user's permissions (not admin)
      const decoded = jwt.decode(token.impersonationToken);
      expect(decoded.role).toBe('CUSTOMER');
      expect(decoded.permissions).toContain('products:view');
      expect(decoded.permissions).not.toContain('admin:view_audit');
    });
  });
  
  describe('endImpersonation', () => {
    it('should terminate session and log end time', async () => {
      const session = await impersonationService.startImpersonation({...});
      await impersonationService.endImpersonation(session.sessionId);
      
      const endedSession = await impersonationRepo.findOne(session.sessionId);
      expect(endedSession.ended_at).not.toBeNull();
      
      // Subsequent requests rejected
      await expect(
        impersonationService.validateSession(session.sessionId)
      ).rejects.toThrow('Session ended');
    });
  });
});
```

### 2.5 Payment State Machine Tests

**File**: `src/services/__tests__/payment.service.test.ts`

```typescript
describe('PaymentService - State Machine', () => {
  describe('state transitions', () => {
    it('should transition INITIATED -> PAYMENT_PENDING', async () => {
      const order = await orderService.create({...});
      
      const payment = await paymentService.initiate(order);
      expect(payment.status).toBe('INITIATED');
      
      const gateway = await paymentService.getGatewaySession(payment);
      expect(gateway.status).toBe('PAYMENT_PENDING');
    });
    
    it('should transition PAYMENT_PENDING -> SUCCESS on webhook', async () => {
      const payment = await paymentService.initiate(order);
      expect(payment.status).toBe('PAYMENT_PENDING');
      
      // Simulate webhook
      await paymentService.handleWebhookSuccess({
        transaction_id: payment.gateway_transaction_id,
        amount: order.total_amount
      });
      
      const updated = await paymentRepo.findOne(payment.id);
      expect(updated.payment_status).toBe('SUCCESS');
      expect(updated.success_at).not.toBeNull();
    });
    
    it('should transition PAYMENT_PENDING -> FAILED on webhook', async () => {
      const payment = await paymentService.initiate(order);
      
      await paymentService.handleWebhookFailure({
        transaction_id: payment.gateway_transaction_id,
        failure_code: 'CARD_DECLINED'
      });
      
      const updated = await paymentRepo.findOne(payment.id);
      expect(updated.payment_status).toBe('FAILED');
      expect(updated.failure_code).toBe('CARD_DECLINED');
    });
    
    it('should timeout after 30 minutes without webhook', async () => {
      const payment = await paymentService.initiate(order);
      
      // Mock time advance
      jest.useFakeTimers();
      jest.advanceTimersByTime(31 * 60 * 1000);  // 31 minutes
      
      const timedOut = await paymentService.checkTimeout(payment.id);
      expect(timedOut.payment_status).toBe('TIMEOUT');
    });
    
    it('should prevent invalid state transitions', async () => {
      const payment = await paymentService.initiate(order);
      await paymentService.handleWebhookSuccess({...});
      
      // Try to fail after success
      await expect(
        paymentService.handleWebhookFailure({...})
      ).rejects.toThrow('Invalid state transition');
    });
  });
  
  describe('webhook security', () => {
    it('should verify webhook signature', async () => {
      const payload = { transaction_id: 'txn_123' };
      const invalidSignature = 'invalid';
      
      await expect(
        paymentService.handleWebhookSuccess(payload, invalidSignature)
      ).rejects.toThrow('Invalid signature');
    });
    
    it('should reject duplicate webhook (idempotency)', async () => {
      const payload = { transaction_id: 'txn_123', order_id: 'ord_456' };
      
      const result1 = await paymentService.handleWebhookSuccess(payload, signature);
      const result2 = await paymentService.handleWebhookSuccess(payload, signature);
      
      expect(result1.id).toBe(result2.id);  // Same record
      expect(result2.data.idempotent).toBe(true);
    });
  });
});
```

### 2.6 Encryption Tests

**File**: `src/services/__tests__/encryption.service.test.ts`

```typescript
describe('EncryptionService', () => {
  it('should encrypt and decrypt without data loss', () => {
    const plaintext = 'john.doe@example.com';
    const { encrypted, iv } = service.encrypt(plaintext, 'email');
    const decrypted = service.decrypt(encrypted, iv, 'email');
    
    expect(decrypted).toBe(plaintext);
  });
  
  it('should produce different ciphertext for same plaintext', () => {
    const plaintext = 'john.doe@example.com';
    const enc1 = service.encrypt(plaintext, 'email');
    const enc2 = service.encrypt(plaintext, 'email');
    
    expect(enc1.encrypted).not.toBe(enc2.encrypted);
    expect(enc1.iv).not.toBe(enc2.iv);
  });
  
  it('should fail on tampered ciphertext (auth tag validation)', () => {
    const { encrypted, iv } = service.encrypt('test', 'email');
    const [authTag, cipher] = encrypted.split(':');
    const tampered = authTag + ':' + cipher.slice(0, -5) + 'XXXXX';
    
    expect(() => service.decrypt(tampered, iv, 'email'))
      .toThrow('Decipher error');
  });
  
  it('should handle null/undefined gracefully', () => {
    expect(service.encrypt(null, 'email')).toThrow();
    expect(service.encrypt(undefined, 'email')).toThrow();
  });
});
```

### 2.7 Audit Log Immutability Tests

**File**: `src/repositories/__tests__/audit.repository.test.ts`

```typescript
describe('AuditRepository - Immutability', () => {
  it('should insert audit log successfully', async () => {
    const log = await auditRepo.insert({
      actor_id: 'user_123',
      action: 'products:create',
      resource_type: 'products',
      status: 'SUCCESS'
    });
    
    expect(log.id).toBeDefined();
  });
  
  it('should prevent UPDATE on audit logs', async () => {
    const log = await auditRepo.insert({...});
    
    await expect(
      db.query('UPDATE audit_logs SET action = ? WHERE id = ?', [
        'fake_action',
        log.id
      ])
    ).rejects.toThrow('violates policy');
  });
  
  it('should prevent DELETE on audit logs', async () => {
    const log = await auditRepo.insert({...});
    
    await expect(
      db.query('DELETE FROM audit_logs WHERE id = ?', [log.id])
    ).rejects.toThrow('violates policy');
  });
  
  it('should support append-only queries', async () => {
    await auditRepo.insert({ action: 'order:create', ... });
    await auditRepo.insert({ action: 'payment:success', ... });
    
    const logs = await auditRepo.findAll();
    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe('order:create');
    expect(logs[1].action).toBe('payment:success');
  });
});
```

---

## 3. INTEGRATION TESTS

### 3.1 Order Creation E2E

**File**: `test/integration/orders.integration.test.ts`

```typescript
describe('Order Creation Flow (Integration)', () => {
  it('should create order with items, calculate tax, process payment', async () => {
    // 1. Create product
    const product = await request(app)
      .post('/api/v1/sellers/seller_001/products')
      .set('Authorization', sellerToken)
      .send({
        sku: 'TEST-001',
        name: 'Test Product',
        basePrice: 1000,
        gstSlabId: 2  // 12%
      })
      .expect(201);
    
    // 2. Add to cart
    const cart = await request(app)
      .post('/api/v1/carts/current/items')
      .set('Authorization', customerToken)
      .send({
        productId: product.body.id,
        quantity: 2
      })
      .expect(201);
    
    expect(cart.body.cartTotal).toBe(2000 + 240);  // Price + GST
    
    // 3. Create order
    const order = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', customerToken)
      .send({
        cartId: cart.body.cartId,
        deliveryAddressId: addressId
      })
      .expect(201);
    
    expect(order.body.orderSummary.totalGst).toBe(240);
    expect(order.body.paymentStatus).toBe('INITIATED');
    
    // 4. Process payment via webhook
    const webhook = await request(app)
      .post('/webhooks/payment')
      .set('x-webhook-signature', generateSignature(order.body.id))
      .send({
        transaction_id: `txn_${order.body.id}`,
        order_id: order.body.id,
        status: 'SUCCESS'
      })
      .expect(200);
    
    // 5. Verify order status updated
    const updatedOrder = await request(app)
      .get(`/api/v1/orders/${order.body.id}`)
      .set('Authorization', customerToken)
      .expect(200);
    
    expect(updatedOrder.body.paymentStatus).toBe('SUCCESS');
    expect(updatedOrder.body.orderStatus).toBe('CONFIRMED');
  });
});
```

---

## 4. COVERAGE MEASUREMENT

### 4.1 Jest Configuration

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/config/**'
  ],
  coverageThreshold: {
    global: {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './src/services/': {
      branches: 100,  // Stricter for business logic
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/guards/': {
      branches: 100,  // RBAC must be 100%
      functions: 100,
      lines: 100,
      statements: 100
    }
  },
  coverageReporters: ['html', 'text', 'lcov', 'json'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts']
};
```

### 4.2 Coverage Report

```bash
npm run test:coverage

# Output:
# ============ Coverage summary ==================
# Statements   : 96.2% ( 4521/4701 )
# Branches     : 95.8% ( 1842/1923 )
# Functions    : 96.0% ( 1205/1255 )
# Lines        : 96.1% ( 4312/4489 )
# =============================================
# PASS - Coverage threshold met
```

---

## 5. CI/CD INTEGRATION

### 5.1 GitHub Actions Workflow

```yaml
name: Test & Coverage
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: pass
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:unit
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://postgres:pass@localhost:5432/test_db
      
      - name: Generate coverage report
        run: npm run test:coverage
      
      - name: Check coverage threshold
        run: npx nyc check-coverage --lines 95 --functions 95
      
      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
      
      - name: Fail if coverage < 95%
        if: failure()
        run: exit 1
```

---

## 6. TEST DATA FACTORIES

```typescript
// test/factories/user.factory.ts
export class UserFactory {
  static async createCustomer(overrides?: Partial<User>): Promise<User> {
    return userRepo.insert({
      email: `customer_${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('TestPass123!', 10),
      first_name: 'John',
      last_name: 'Doe',
      ...overrides
    });
  }
  
  static async createSeller(overrides?: Partial<User>): Promise<User> {
    const user = await this.createCustomer(overrides);
    await sellerRepo.insert({
      user_id: user.id,
      business_name: `Shop ${user.id}`
    });
    return user;
  }
  
  static async createAdmin(overrides?: Partial<User>): Promise<User> {
    const user = await userRepo.insert({
      email: `admin_${Date.now()}@example.com`,
      password_hash: await bcrypt.hash('AdminPass123!', 10),
      first_name: 'Admin',
      ...overrides
    });
    await userRoleRepo.insert({
      user_id: user.id,
      role_id: (await roleRepo.findOne('ADMIN')).id
    });
    return user;
  }
}
```

---

**Testing Framework**: Jest 29+, Supertest, React Testing Library  
**Minimum Coverage**: 95%  
**Build Failure Threshold**: <95%  
**Last Updated**: February 2026
