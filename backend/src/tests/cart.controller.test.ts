import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app, server } from '../../main';

describe('CartController (Integration)', () => {
  let accessToken: string;
  let userId: string;
  let productId: string;

  beforeAll(async () => {
    // Register and login test user
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'cart_test@example.com',
        password: 'SecurePass123!',
        fullName: 'Cart Test User',
      });

    userId = registerRes.body.data.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'cart_test@example.com',
        password: 'SecurePass123!',
      });

    accessToken = loginRes.body.data.accessToken;

    // Create a test product
    const productRes = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Product',
        sku: 'TEST-SKU-001',
        basePrice: 1000,
        gstPercentage: 18,
        stock: 100,
      });

    productId = productRes.body.data.id;
  });

  afterAll(async () => {
    server.close();
  });

  beforeEach(async () => {
    // Clear cart before each test
    await request(app)
      .delete('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`);
  });

  describe('POST /api/v1/cart/items', () => {
    it('should add item to cart', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          productId,
          quantity: 2,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.itemCount).toBe(2);
    });

    it('should return 401 without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .send({ productId, quantity: 2 });

      expect(res.status).toBe(401);
    });

    it('should increment quantity if item already exists', async () => {
      // Add first time
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      // Add again
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 3 });

      expect(res.status).toBe(200);
      expect(res.body.data.itemCount).toBe(5); // 2 + 3
    });

    it('should validate stock availability', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          productId,
          quantity: 999, // More than available stock
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/cart', () => {
    it('should get cart with summary', async () => {
      // Add items to cart
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.subtotal).toBe(2000); // 1000 * 2
      expect(res.body.data.totalGst).toBe(360); // (1000 * 18%) * 2
      expect(res.body.data.totalAmount).toBe(2360);
      expect(res.body.data.gstBreakup).toHaveProperty('18');
    });

    it('should return empty cart for new user', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.totalAmount).toBe(0);
    });
  });

  describe('PUT /api/v1/cart/items/:itemId', () => {
    it('should update item quantity', async () => {
      // Add item
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      // Get cart to find item ID
      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      const itemId = cartRes.body.data.items[0].id;

      // Update quantity
      const res = await request(app)
        .put(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.itemCount).toBe(5);
    });

    it('should validate stock on quantity update', async () => {
      // Add item
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      const itemId = cartRes.body.data.items[0].id;

      // Try to exceed stock
      const res = await request(app)
        .put(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ quantity: 999 });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/cart/items/:itemId', () => {
    it('should remove item from cart', async () => {
      // Add item
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      const itemId = cartRes.body.data.items[0].id;

      // Remove item
      const res = await request(app)
        .delete(`/api/v1/cart/items/${itemId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.itemCount).toBe(0);
    });
  });

  describe('POST /api/v1/cart/validate', () => {
    it('should validate cart stock before checkout', async () => {
      // Add item
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      const res = await request(app)
        .post('/api/v1/cart/validate')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.errors).toHaveLength(0);
    });
  });

  describe('DELETE /api/v1/cart', () => {
    it('should clear entire cart', async () => {
      // Add items
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId, quantity: 2 });

      // Clear cart
      const res = await request(app)
        .delete('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);

      // Verify cart is empty
      const cartRes = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(cartRes.body.data.items).toHaveLength(0);
    });
  });
});
