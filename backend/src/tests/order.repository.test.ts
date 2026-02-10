import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OrderRepository } from '../repositories/order.repository';
import { CartRepository } from '../repositories/cart.repository';
import { ProductRepository } from '../repositories/product.repository';

describe('OrderRepository', () => {
  let orderRepo: OrderRepository;
  let cartRepo: jest.Mocked<CartRepository>;
  let productRepo: jest.Mocked<ProductRepository>;
  let dataSource: any;

  beforeEach(() => {
    dataSource = createMockDataSource();
    cartRepo = {
      getCartSummary: jest.fn(),
      validateCartStock: jest.fn(),
      clearCart: jest.fn(),
    } as any;
    productRepo = {
      commitStock: jest.fn(),
    } as any;

    orderRepo = new OrderRepository(dataSource, cartRepo, productRepo);
  });

  describe('createFromCart', () => {
    it('should create order from cart successfully', async () => {
      const userId = 'user-123';
      const shippingAddress = {
        street: '123 Main St',
        city: 'Mumbai',
        pincode: '400001',
      };

      const cartSummary = {
        cart: {
          items: [
            {
              product_id: 'product-1',
              quantity: 2,
              base_price: 1000,
              gst_percentage: 18,
              gst_amount: 180,
            },
          ],
        },
        subtotal: 2000,
        totalGst: 360,
        totalAmount: 2360,
      };

      cartRepo.validateCartStock.mockResolvedValue({ valid: true, errors: [] });
      cartRepo.getCartSummary.mockResolvedValue(cartSummary as any);

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.insert.mockResolvedValue({
        identifiers: [{ id: 'order-123' }],
      });

      const order = await orderRepo.createFromCart(userId, shippingAddress);

      // Verify stock validation
      expect(cartRepo.validateCartStock).toHaveBeenCalledWith(userId);

      // Verify order creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'orders',
        expect.objectContaining({
          user_id: userId,
          order_status: 'PENDING',
          payment_status: 'INITIATED',
          subtotal: 2000,
          total_gst: 360,
          total_amount: 2360,
        })
      );

      // Verify order items creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'order_items',
        expect.any(Array)
      );

      // Verify stock commitment
      expect(productRepo.commitStock).toHaveBeenCalledWith('product-1', 2);

      // Verify cart cleared
      expect(cartRepo.clearCart).toHaveBeenCalledWith(userId);

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw error if cart stock invalid', async () => {
      cartRepo.validateCartStock.mockResolvedValue({
        valid: false,
        errors: ['Product 1: Only 5 units available'],
      });

      await expect(
        orderRepo.createFromCart('user-123', {})
      ).rejects.toThrow('Insufficient stock');
    });

    it('should rollback on error', async () => {
      cartRepo.validateCartStock.mockResolvedValue({ valid: true, errors: [] });
      cartRepo.getCartSummary.mockResolvedValue({
        cart: { items: [] },
        subtotal: 0,
        totalGst: 0,
        totalAmount: 0,
      } as any);

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.insert.mockRejectedValue(new Error('DB error'));

      await expect(
        orderRepo.createFromCart('user-123', {})
      ).rejects.toThrow('DB error');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });

  describe('updateOrderStatus', () => {
    it('should update status with valid transition', async () => {
      const orderId = 'order-123';
      const currentOrder = {
        id: orderId,
        order_status: 'PENDING',
      };

      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await orderRepo.updateOrderStatus(orderId, 'CONFIRMED');

      const orderRepoMock = dataSource.getRepository('orders');
      expect(orderRepoMock.update).toHaveBeenCalledWith(
        { id: orderId },
        expect.objectContaining({ order_status: 'CONFIRMED' })
      );
    });

    it('should throw error for invalid transition', async () => {
      const currentOrder = {
        id: 'order-123',
        order_status: 'DELIVERED',
      };

      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await expect(
        orderRepo.updateOrderStatus('order-123', 'PENDING')
      ).rejects.toThrow('Invalid status transition');
    });

    it('should allow PENDING -> CONFIRMED transition', async () => {
      const currentOrder = { id: 'order-123', order_status: 'PENDING' };
      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await orderRepo.updateOrderStatus('order-123', 'CONFIRMED');

      expect(dataSource.getRepository('orders').update).toHaveBeenCalled();
    });

    it('should allow CONFIRMED -> SHIPPED transition', async () => {
      const currentOrder = { id: 'order-123', order_status: 'CONFIRMED' };
      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await orderRepo.updateOrderStatus('order-123', 'SHIPPED');

      expect(dataSource.getRepository('orders').update).toHaveBeenCalled();
    });

    it('should allow SHIPPED -> DELIVERED transition', async () => {
      const currentOrder = { id: 'order-123', order_status: 'SHIPPED' };
      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await orderRepo.updateOrderStatus('order-123', 'DELIVERED');

      expect(dataSource.getRepository('orders').update).toHaveBeenCalled();
    });

    it('should prevent CANCELLED -> CONFIRMED transition', async () => {
      const currentOrder = { id: 'order-123', order_status: 'CANCELLED' };
      dataSource.getRepository('orders').findOne.mockResolvedValue(currentOrder);

      await expect(
        orderRepo.updateOrderStatus('order-123', 'CONFIRMED')
      ).rejects.toThrow();
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate unique order number', async () => {
      const queryRunner = dataSource.createQueryRunner();
      queryRunner.query.mockResolvedValue([{ max_sequence: 5 }]);

      const orderNumber = await orderRepo.generateOrderNumber(queryRunner);

      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const expectedPrefix = `ORD${dateStr}`;

      expect(orderNumber).toContain(expectedPrefix);
      expect(orderNumber).toMatch(/ORD\d{8}\d{3,}$/);
    });

    it('should start sequence at 1 for new day', async () => {
      const queryRunner = dataSource.createQueryRunner();
      queryRunner.query.mockResolvedValue([{ max_sequence: null }]);

      const orderNumber = await orderRepo.generateOrderNumber(queryRunner);

      expect(orderNumber).toMatch(/001$/);
    });
  });

  describe('listUserOrders', () => {
    it('should list user orders with pagination', async () => {
      const userId = 'user-123';
      const mockOrders = [
        { id: 'order-1', order_number: 'ORD20260210001' },
        { id: 'order-2', order_number: 'ORD20260210002' },
      ];

      const orderRepoMock = dataSource.getRepository('orders');
      const queryBuilder = orderRepoMock.createQueryBuilder();
      queryBuilder.getManyAndCount.mockResolvedValue([mockOrders, 2]);

      const result = await orderRepo.listUserOrders(userId, {
        page: 1,
        limit: 10,
      });

      expect(queryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('user_id'),
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by order status', async () => {
      const orderRepoMock = dataSource.getRepository('orders');
      const queryBuilder = orderRepoMock.createQueryBuilder();

      await orderRepo.listUserOrders('user-123', {
        page: 1,
        limit: 10,
        status: 'DELIVERED',
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('order_status'),
        expect.any(Object)
      );
    });
  });

  describe('listSellerOrders', () => {
    it('should query orders containing seller products', async () => {
      const sellerId = 'seller-123';

      dataSource.query.mockResolvedValue([
        [
          { id: 'order-1', order_number: 'ORD20260210001' },
          { id: 'order-2', order_number: 'ORD20260210002' },
        ],
        2,
      ]);

      const result = await orderRepo.listSellerOrders(sellerId, {
        page: 1,
        limit: 10,
      });

      // Verify SQL join query was executed
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN order_items'),
        expect.arrayContaining([sellerId])
      );

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('getOrderStats', () => {
    it('should aggregate order statistics', async () => {
      const userId = 'user-123';
      const mockStats = [
        {
          total_orders: '10',
          pending_count: '3',
          completed_count: '7',
          total_spent: '25000.50',
        },
      ];

      dataSource.query.mockResolvedValue(mockStats);

      const stats = await orderRepo.getOrderStats(userId);

      expect(stats.totalOrders).toBe(10);
      expect(stats.pending).toBe(3);
      expect(stats.completed).toBe(7);
      expect(stats.totalSpent).toBe(25000.5);
    });
  });
});

function createMockDataSource() {
  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    })),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      insert: jest.fn(),
      update: jest.fn(),
      findOne: jest.fn(),
    },
    query: jest.fn(),
  };

  return {
    getRepository: jest.fn(() => mockRepository),
    createQueryRunner: jest.fn(() => mockQueryRunner),
    query: jest.fn(),
  };
}
