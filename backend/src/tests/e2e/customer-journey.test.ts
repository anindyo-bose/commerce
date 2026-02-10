import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../../main';

/**
 * End-to-End Test: Complete Customer Journey
 * 
 * This test simulates a full customer workflow:
 * 1. Register new account
 * 2. Login
 * 3. Browse products
 * 4. Add items to cart
 * 5. Update cart quantities
 * 6. Validate cart before checkout
 * 7. Create order (checkout)
 * 8. View order history
 * 9. Get order details
 * 10. Download invoice
 */
describe('E2E: Customer Journey', () => {
  let customerToken: string;
  let customerId: string;
  let productId1: string;
  let productId2: string;
  let orderId: string;
  let orderNumber: string;

  beforeAll(async () => {
    // Setup: Create test products
    const sellerRegRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'seller_e2e@example.com',
        password: 'SellerPass123!',
        fullName: 'E2E Seller',
      });

    const sellerToken = sellerRegRes.body.data.accessToken;

    const product1Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Laptop Dell XPS 13',
        sku: 'LAPTOP-DELL-001',
        basePrice: 90000,
        gstPercentage: 18,
        stock: 50,
        description: 'High-performance ultrabook',
        category: 'Electronics',
      });

    productId1 = product1Res.body.data.id;

    const product2Res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        name: 'Wireless Mouse Logitech',
        sku: 'MOUSE-LOG-001',
        basePrice: 1200,
        gstPercentage: 18,
        stock: 100,
        description: 'Ergonomic wireless mouse',
        category: 'Accessories',
      });

    productId2 = product2Res.body.data.id;
  });

  afterAll(async () => {
    server.close();
  });

  it('Step 1: Customer registers new account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'customer_e2e@example.com',
        password: 'CustomerPass123!',
        fullName: 'John Doe',
        phoneNumber: '+919876543210',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe('customer_e2e@example.com');

    customerId = res.body.data.id;
  });

  it('Step 2: Customer logs in', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'customer_e2e@example.com',
        password: 'CustomerPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.id).toBe(customerId);

    customerToken = res.body.data.accessToken;
  });

  it('Step 3: Customer browses products', async () => {
    const res = await request(app)
      .get('/api/v1/products?page=1&limit=10&search=laptop')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.products).toBeInstanceOf(Array);
    expect(res.body.data.products.length).toBeGreaterThan(0);

    const laptop = res.body.data.products.find(
      (p: any) => p.id === productId1
    );
    expect(laptop.name).toBe('Laptop Dell XPS 13');
    expect(laptop.basePrice).toBe(90000);
    expect(laptop.gstPercentage).toBe(18);
  });

  it('Step 4: Customer views product details', async () => {
    const res = await request(app)
      .get(`/api/v1/products/${productId1}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Laptop Dell XPS 13');
    expect(res.body.data.description).toBe('High-performance ultrabook');
    expect(res.body.data.availableStock).toBe(50);
  });

  it('Step 5: Customer adds laptop to cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: productId1,
        quantity: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.itemCount).toBe(1);
  });

  it('Step 6: Customer adds mouse to cart', async () => {
    const res = await request(app)
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId: productId2,
        quantity: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.itemCount).toBe(3); // 1 laptop + 2 mice
  });

  it('Step 7: Customer views cart summary', async () => {
    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);

    // Verify totals
    // Laptop: 90000 base, 16200 GST (18%), total 106200
    // Mouse: 1200 * 2 = 2400 base, 432 GST, total 2832
    // Grand total: 92400 base, 16632 GST, 109032 total

    expect(res.body.data.subtotal).toBe(92400);
    expect(res.body.data.totalGst).toBe(16632);
    expect(res.body.data.totalAmount).toBe(109032);

    // Verify GST breakup
    expect(res.body.data.gstBreakup).toHaveProperty('18');
    expect(res.body.data.gstBreakup['18']).toBe(16632);
  });

  it('Step 8: Customer updates mouse quantity', async () => {
    // Get cart to find mouse item ID
    const cartRes = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    const mouseItem = cartRes.body.data.items.find(
      (item: any) => item.productId === productId2
    );

    // Update quantity to 3
    const res = await request(app)
      .put(`/api/v1/cart/items/${mouseItem.id}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body.data.itemCount).toBe(4); // 1 laptop + 3 mice
  });

  it('Step 9: Customer validates cart before checkout', async () => {
    const res = await request(app)
      .post('/api/v1/cart/validate')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.errors).toHaveLength(0);
  });

  it('Step 10: Customer proceeds to checkout', async () => {
    const shippingAddress = {
      street: '42 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400020',
      country: 'India',
    };

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.orderId).toBeDefined();
    expect(res.body.data.orderNumber).toMatch(/^ORD\d{8}\d+$/);
    expect(res.body.data.orderStatus).toBe('PENDING');
    expect(res.body.data.paymentStatus).toBe('INITIATED');

    // New total: 1 laptop + 3 mice
    // 90000 + (1200 * 3) = 93600 base
    // (16200 + 648) = 16848 GST
    // Total: 110448
    expect(res.body.data.totalAmount).toBe(110448);

    orderId = res.body.data.orderId;
    orderNumber = res.body.data.orderNumber;
  });

  it('Step 11: Cart should be empty after checkout', async () => {
    const res = await request(app)
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.totalAmount).toBe(0);
  });

  it('Step 12: Customer views order history', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders).toBeInstanceOf(Array);
    expect(res.body.data.orders.length).toBeGreaterThan(0);

    const recentOrder = res.body.data.orders[0];
    expect(recentOrder.id).toBe(orderId);
    expect(recentOrder.orderNumber).toBe(orderNumber);
  });

  it('Step 13: Customer views order details', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(orderId);
    expect(res.body.data.orderNumber).toBe(orderNumber);
    expect(res.body.data.items).toHaveLength(2); // Laptop + Mouse

    // Verify order items have immutable snapshots
    const laptopItem = res.body.data.items.find(
      (item: any) => item.productNameSnapshot === 'Laptop Dell XPS 13'
    );
    expect(laptopItem.quantity).toBe(1);
    expect(laptopItem.unitBasePrice).toBe(90000);
    expect(laptopItem.gstPercentage).toBe(18);

    const mouseItem = res.body.data.items.find(
      (item: any) => item.productNameSnapshot === 'Wireless Mouse Logitech'
    );
    expect(mouseItem.quantity).toBe(3);
  });

  it('Step 14: Customer attempts to download invoice (should fail - not paid yet)', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}/invoice`)
      .set('Authorization', `Bearer ${customerToken}`);

    // Should fail since payment not completed
    expect(res.status).toBeOneOf([400, 403]);
  });

  it('Step 15: Customer views order statistics', async () => {
    const res = await request(app)
      .get('/api/v1/orders/stats/summary')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalOrders).toBeGreaterThan(0);
    expect(res.body.data.pending).toBeGreaterThan(0);
    expect(res.body.data.totalSpent).toBeGreaterThanOrEqual(0);
  });

  it('Step 16: Product stock should be reduced after order', async () => {
    const laptop = await request(app)
      .get(`/api/v1/products/${productId1}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(laptop.body.data.availableStock).toBe(49); // 50 - 1

    const mouse = await request(app)
      .get(`/api/v1/products/${productId2}`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(mouse.body.data.availableStock).toBe(97); // 100 - 3
  });

  it('Step 17: Customer refreshes access token', async () => {
    // Get refresh token from login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'customer_e2e@example.com',
        password: 'CustomerPass123!',
      });

    const refreshToken = loginRes.body.data.refreshToken;

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('Step 18: Customer cannot access another users order', async () => {
    // Register different customer
    await request(app).post('/api/v1/auth/register').send({
      email: 'other_customer@example.com',
      password: 'OtherPass123!',
      fullName: 'Jane Smith',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'other_customer@example.com',
      password: 'OtherPass123!',
    });

    const otherToken = loginRes.body.data.accessToken;

    // Try to access first customer's order
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Access denied');
  });
});

// Custom matcher
expect.extend({
  toBeOneOf(received: any, expected: any[]) {
    const pass = expected.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be one of ${expected.join(', ')}`
          : `expected ${received} to be one of ${expected.join(', ')}`,
    };
  },
});
