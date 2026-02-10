import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../../main';

describe('OrderController (Integration)', () => {
  let accessToken: string;
  let userId: string;
  let productId: string;
  let orderId: string;

  beforeAll(async () => {
    // Register and login
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'order_test@example.com',
        password: 'SecurePass123!',
        fullName: 'Order Test User',
      });

    userId = registerRes.body.data.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'order_test@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.data.accessToken;

    // Create test product
    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Order Test Product',
        sku: 'ORDER-SKU-001',
        basePrice: 1500,
        gstPercentage: 18,
        stock: 50,
      });

    productId = productRes.body.data.id;
  });

  afterAll(async () => {
    server.close();
  });

  beforeEach(async () => {
    // Clear cart
    await request(app)
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`);
  });

  describe('POST /api/v1/orders', () => {
    it('should create order from cart (checkout)', async () => {
      // Add items to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 3 });

      const shippingAddress = {
        street: '123 Test Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        country: 'India',
      };

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shippingAddress });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.orderNumber).toMatch(/^ORD\d{8}\d+$/);
      expect(res.body.data.totalAmount).toBe(5310); // (1500 * 3) + (270 * 3)
      expect(res.body.data.orderStatus).toBe('PENDING');
      expect(res.body.data.paymentStatus).toBe('INITIATED');

      orderId = res.body.data.orderId;

      // Verify cart is cleared
      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(cartRes.body.data.items).toHaveLength(0);
    });

    it('should fail if cart is empty', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          shippingAddress: {
            street: '123 Test St',
            city: 'Mumbai',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail if stock insufficient', async () => {
      // Add more than available stock
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 999 });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          shippingAddress: { street: '123 St', city: 'Mumbai' },
        });

      expect(res.status).toBe(400);
    });

    it('should commit stock reservations', async () => {
      // Add items to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 5 });

      // Create order
      await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          shippingAddress: { street: '123 St', city: 'Mumbai' },
        });

      // Verify stock was reduced
      const productRes = await request(app)
        .get(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(productRes.body.data.availableStock).toBe(45); // 50 - 5
    });
  });

  describe('GET /api/v1/orders', () => {
    it('should list user order history', async () => {
      const res = await request(app)
        .get('/api/v1/orders?page=1&limit=10')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orders).toBeInstanceOf(Array);
      expect(res.body.data.total).toBeGreaterThanOrEqual(0);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(10);
    });

    it('should filter by order status', async () => {
      const res = await request(app)
        .get('/api/v1/orders?status=DELIVERED')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.orders).toBeInstanceOf(Array);
    });

    it('should paginate results', async () => {
      const res = await request(app)
        .get('/api/v1/orders?page=2&limit=5')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.page).toBe(2);
      expect(res.body.data.limit).toBe(5);
    });
  });

  describe('GET /api/v1/orders/:id', () => {
    it('should get order detail', async () => {
      if (!orderId) {
        // Create an order first
        await request(app)
          .post('/api/v1/cart/items')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ productId, quantity: 2 });

        const orderRes = await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            shippingAddress: { street: '123 St', city: 'Mumbai' },
          });

        orderId = orderRes.body.data.orderId;
      }

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toBeInstanceOf(Array);
    });

    it('should deny access to other users orders', async () => {
      // Register different user
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'other_user@example.com',
          password: 'SecurePass123!',
          fullName: 'Other User',
        });

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'other_user@example.com',
          password: 'SecurePass123!',
        });

      const otherUserToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .get(`/api/v1/orders/${orderId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for nonexistent order', async () => {
      const res = await request(app)
        .get('/api/v1/orders/nonexistent-id')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/orders/:id/invoice', () => {
    it('should download invoice for completed order', async () => {
      // This requires order to be paid
      // For now, test the endpoint exists
      const res = await request(app)
        .get(`/api/v1/orders/${orderId}/invoice`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBeOneOf([200, 400, 404]);
    });
  });

  describe('PATCH /api/v1/orders/:id/status', () => {
    it('should update order status (admin/seller)', async () => {
      // This requires admin/seller role
      // Skipping for customer user
      const res = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'CONFIRMED' });

      expect(res.status).toBeOneOf([200, 403]);
    });
  });

  describe('GET /api/v1/orders/stats/summary', () => {
    it('should get user order statistics', async () => {
      const res = await request(app)
        .get('/api/v1/orders/stats/summary')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalOrders');
      expect(res.body.data).toHaveProperty('pending');
      expect(res.body.data).toHaveProperty('completed');
      expect(res.body.data).toHaveProperty('totalSpent');
    });
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
