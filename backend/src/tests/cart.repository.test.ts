import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CartRepository } from '../repositories/cart.repository';
import { ProductRepository } from '../repositories/product.repository';

describe('CartRepository', () => {
  let cartRepo: CartRepository;
  let productRepo: jest.Mocked<ProductRepository>;
  let dataSource: any;

  beforeEach(() => {
    dataSource = createMockDataSource();
    productRepo = {
      findById: jest.fn(),
      getAvailableStock: jest.fn(),
    } as any;

    cartRepo = new CartRepository(dataSource, productRepo);
  });

  describe('getOrCreateCart', () => {
    it('should return existing cart', async () => {
      const userId = 'user-123';
      const existingCart = { id: 'cart-123', user_id: userId };

      const cartRepoMock = dataSource.getRepository('shopping_carts');
      cartRepoMock.findOne.mockResolvedValue(existingCart);

      const cart = await cartRepo.getOrCreateCart(userId);

      expect(cart.id).toBe('cart-123');
      expect(cartRepoMock.insert).not.toHaveBeenCalled();
    });

    it('should create new cart if none exists', async () => {
      const userId = 'user-123';

      const cartRepoMock = dataSource.getRepository('shopping_carts');
      cartRepoMock.findOne.mockResolvedValue(null);
      cartRepoMock.insert.mockResolvedValue({
        identifiers: [{ id: 'new-cart-123' }],
      });

      const cart = await cartRepo.getOrCreateCart(userId);

      expect(cartRepoMock.insert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: userId })
      );
    });
  });

  describe('addItem', () => {
    it('should add new item to cart', async () => {
      const userId = 'user-123';
      const productId = 'product-456';
      const quantity = 2;

      const mockCart = { id: 'cart-123', user_id: userId };
      const mockProduct = {
        id: productId,
        base_price: 1000,
        gst_percentage: 18,
      };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);
      dataSource.getRepository('cart_items').findOne.mockResolvedValue(null);
      productRepo.findById.mockResolvedValue(mockProduct as any);

      await cartRepo.addItem(userId, productId, quantity);

      const itemRepo = dataSource.getRepository('cart_items');
      expect(itemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          cart_id: 'cart-123',
          product_id: productId,
          quantity,
          base_price: 1000,
          gst_percentage: 18,
          gst_amount: 180, // (1000 * 18) / 100
          total_price: 1180,
        })
      );
    });

    it('should increment quantity if item already exists', async () => {
      const userId = 'user-123';
      const productId = 'product-456';

      const mockCart = { id: 'cart-123', user_id: userId };
      const existingItem = {
        id: 'item-789',
        cart_id: 'cart-123',
        product_id: productId,
        quantity: 2,
      };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);
      dataSource.getRepository('cart_items').findOne.mockResolvedValue(existingItem);

      await cartRepo.addItem(userId, productId, 3);

      const itemRepo = dataSource.getRepository('cart_items');
      expect(itemRepo.update).toHaveBeenCalledWith(
        { id: 'item-789' },
        expect.objectContaining({ quantity: 5 }) // 2 + 3
      );
    });
  });

  describe('updateItemQuantity', () => {
    it('should update item quantity if stock available', async () => {
      const userId = 'user-123';
      const itemId = 'item-789';
      const newQuantity = 10;

      const mockItem = {
        id: itemId,
        cart_id: 'cart-123',
        product_id: 'product-456',
        quantity: 5,
      };

      dataSource.getRepository('cart_items').findOne.mockResolvedValue(mockItem);
      productRepo.getAvailableStock.mockResolvedValue(50);

      await cartRepo.updateItemQuantity(userId, itemId, newQuantity);

      const itemRepo = dataSource.getRepository('cart_items');
      expect(itemRepo.update).toHaveBeenCalledWith(
        { id: itemId },
        expect.objectContaining({ quantity: newQuantity })
      );
    });

    it('should throw error if insufficient stock', async () => {
      const mockItem = {
        id: 'item-789',
        product_id: 'product-456',
        quantity: 5,
      };

      dataSource.getRepository('cart_items').findOne.mockResolvedValue(mockItem);
      productRepo.getAvailableStock.mockResolvedValue(5);

      await expect(
        cartRepo.updateItemQuantity('user-123', 'item-789', 10)
      ).rejects.toThrow('Only 5 units available');
    });
  });

  describe('getCartSummary', () => {
    it('should calculate cart summary with GST breakdown', async () => {
      const userId = 'user-123';
      const mockCart = {
        id: 'cart-123',
        user_id: userId,
        items: [
          {
            product_id: 'product-1',
            quantity: 2,
            base_price: 1000,
            gst_percentage: 18,
            gst_amount: 180,
            total_price: 1180,
          },
          {
            product_id: 'product-2',
            quantity: 1,
            base_price: 500,
            gst_percentage: 5,
            gst_amount: 25,
            total_price: 525,
          },
        ],
      };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);

      const summary = await cartRepo.getCartSummary(userId);

      expect(summary.subtotal).toBe(2500); // (1000*2) + (500*1)
      expect(summary.totalGst).toBe(385); // (180*2) + (25*1)
      expect(summary.totalAmount).toBe(2885); // 2500 + 385
      expect(summary.itemCount).toBe(3); // 2 + 1
      expect(summary.gstBreakup).toEqual({
        5: 25,
        18: 360,
      });
    });
  });

  describe('validateCartStock', () => {
    it('should return valid if all items in stock', async () => {
      const mockCart = {
        items: [
          { product_id: 'product-1', quantity: 2 },
          { product_id: 'product-2', quantity: 5 },
        ],
      };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);
      productRepo.getAvailableStock.mockResolvedValueOnce(10);
      productRepo.getAvailableStock.mockResolvedValueOnce(10);

      const result = await cartRepo.validateCartStock('user-123');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors if items out of stock', async () => {
      const mockCart = {
        items: [
          { product_id: 'product-1', quantity: 10, product_name: 'Product 1' },
          { product_id: 'product-2', quantity: 5, product_name: 'Product 2' },
        ],
      };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);
      productRepo.getAvailableStock.mockResolvedValueOnce(5); // Insufficient
      productRepo.getAvailableStock.mockResolvedValueOnce(10); // Sufficient

      const result = await cartRepo.validateCartStock('user-123');

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Product 1');
    });
  });

  describe('clearCart', () => {
    it('should delete all cart items', async () => {
      const userId = 'user-123';
      const mockCart = { id: 'cart-123', user_id: userId };

      dataSource.getRepository('shopping_carts').findOne.mockResolvedValue(mockCart);

      await cartRepo.clearCart(userId);

      const itemRepo = dataSource.getRepository('cart_items');
      expect(itemRepo.delete).toHaveBeenCalledWith({ cart_id: 'cart-123' });
    });
  });
});

function createMockDataSource() {
  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  return {
    getRepository: jest.fn(() => mockRepository),
  };
}
