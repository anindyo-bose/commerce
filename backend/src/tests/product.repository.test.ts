import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ProductRepository } from '../repositories/product.repository';

describe('ProductRepository', () => {
  let productRepo: ProductRepository;
  let dataSource: any;

  beforeEach(() => {
    dataSource = createMockDataSource();
    productRepo = new ProductRepository(dataSource);
  });

  describe('create', () => {
    it('should create product with inventory record', async () => {
      const productData = {
        sellerId: 'seller-123',
        name: 'Test Product',
        sku: 'SKU123',
        basePrice: 1000,
        gstPercentage: 18,
        initialStock: 100,
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.insert.mockResolvedValue({
        identifiers: [{ id: 'product-123' }],
      });
      queryRunner.manager.findOne.mockResolvedValue({
        id: 'gst-slab-18',
        percentage: 18,
      });

      const product = await productRepo.create(productData);

      // Verify GST slab validation
      expect(queryRunner.manager.findOne).toHaveBeenCalledWith(
        'gst_slabs',
        expect.objectContaining({ where: { percentage: 18 } })
      );

      // Verify product creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'products',
        expect.objectContaining({
          name: productData.name,
          sku: productData.sku,
        })
      );

      // Verify inventory creation
      expect(queryRunner.manager.insert).toHaveBeenCalledWith(
        'product_inventory',
        expect.objectContaining({
          product_id: 'product-123',
          stock_quantity: 100,
          reserved_quantity: 0,
        })
      );

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should throw error if GST slab not found', async () => {
      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValue(null);

      await expect(
        productRepo.create({
          sellerId: 'seller-123',
          name: 'Product',
          sku: 'SKU',
          basePrice: 100,
          gstPercentage: 99, // Invalid GST percentage
          initialStock: 10,
        })
      ).rejects.toThrow('GST slab not found');
    });
  });

  describe('reserveStock', () => {
    it('should reserve stock with pessimistic locking', async () => {
      const productId = 'product-123';
      const quantity = 5;

      const mockInventory = {
        product_id: productId,
        stock_quantity: 100,
        reserved_quantity: 10,
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValue(mockInventory);

      const result = await productRepo.reserveStock(productId, quantity);

      // Verify pessimistic lock was applied
      expect(queryRunner.manager.findOne).toHaveBeenCalledWith(
        'product_inventory',
        expect.objectContaining({
          lock: { mode: 'pessimistic_write' },
        })
      );

      // Verify reservation
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        'product_inventory',
        { product_id: productId },
        { reserved_quantity: 15 }
      );

      expect(result).toBe(true);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('should return false if insufficient stock', async () => {
      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValue({
        stock_quantity: 10,
        reserved_quantity: 8,
      });

      const result = await productRepo.reserveStock('product-123', 5);

      expect(result).toBe(false);
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should handle concurrent reservations correctly', async () => {
      const productId = 'product-123';

      // Simulate race condition
      const queryRunner1 = dataSource.createQueryRunner();
      const queryRunner2 = dataSource.createQueryRunner();

      queryRunner1.manager.findOne.mockResolvedValue({
        stock_quantity: 100,
        reserved_quantity: 95,
      });

      // First reservation should succeed
      const result1 = await productRepo.reserveStock(productId, 5);
      expect(result1).toBe(true);

      // Second concurrent reservation should fail (pessimistic lock prevents race)
      queryRunner2.manager.findOne.mockResolvedValue({
        stock_quantity: 100,
        reserved_quantity: 100, // Already fully reserved
      });

      const result2 = await productRepo.reserveStock(productId, 5);
      expect(result2).toBe(false);
    });
  });

  describe('commitStock', () => {
    it('should commit reserved stock', async () => {
      const productId = 'product-123';
      const quantity = 5;

      await productRepo.commitStock(productId, quantity);

      const inventoryRepo = dataSource.getRepository('product_inventory');
      expect(inventoryRepo.update).toHaveBeenCalledWith(
        { product_id: productId },
        expect.objectContaining({
          stock_quantity: expect.any(Function), // SQL: stock_quantity - 5
          reserved_quantity: expect.any(Function), // SQL: reserved_quantity - 5
        })
      );
    });
  });

  describe('releaseStock', () => {
    it('should release reserved stock', async () => {
      const productId = 'product-123';
      const quantity = 5;

      await productRepo.releaseStock(productId, quantity);

      const inventoryRepo = dataSource.getRepository('product_inventory');
      expect(inventoryRepo.update).toHaveBeenCalledWith(
        { product_id: productId },
        expect.objectContaining({
          reserved_quantity: expect.any(Function), // SQL: reserved_quantity - 5
        })
      );
    });
  });

  describe('getAvailableStock', () => {
    it('should calculate available stock correctly', async () => {
      const productId = 'product-123';
      const mockInventory = {
        stock_quantity: 100,
        reserved_quantity: 25,
      };

      const inventoryRepo = dataSource.getRepository('product_inventory');
      inventoryRepo.findOne.mockResolvedValue(mockInventory);

      const available = await productRepo.getAvailableStock(productId);

      expect(available).toBe(75); // 100 - 25
    });

    it('should return 0 if no inventory found', async () => {
      const inventoryRepo = dataSource.getRepository('product_inventory');
      inventoryRepo.findOne.mockResolvedValue(null);

      const available = await productRepo.getAvailableStock('nonexistent');

      expect(available).toBe(0);
    });
  });

  describe('list', () => {
    it('should list products with filters', async () => {
      const productRepo = dataSource.getRepository('products');
      const queryBuilder = productRepo.createQueryBuilder();

      queryBuilder.getManyAndCount.mockResolvedValue([
        [{ id: 'product-1' }, { id: 'product-2' }],
        2,
      ]);

      const result = await productRepo.list({
        page: 1,
        limit: 10,
        sellerId: 'seller-123',
        search: 'laptop',
        minPrice: 10000,
        maxPrice: 50000,
        inStockOnly: true,
      });

      expect(queryBuilder.where).toHaveBeenCalledWith(
        expect.stringContaining('seller_id'),
        expect.any(Object)
      );
      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.any(Object)
      );
      expect(result.total).toBe(2);
    });
  });

  describe('update', () => {
    it('should update product and inventory atomically', async () => {
      const productId = 'product-123';
      const updateData = {
        name: 'Updated Product',
        basePrice: 1200,
        stock: 150,
      };

      const queryRunner = dataSource.createQueryRunner();

      await productRepo.update(productId, updateData);

      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        'products',
        { id: productId },
        expect.objectContaining({ name: updateData.name })
      );

      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        'product_inventory',
        { product_id: productId },
        expect.objectContaining({ stock_quantity: updateData.stock })
      );

      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('should soft delete product', async () => {
      const productId = 'product-123';

      await productRepo.deactivate(productId);

      const productRepoMock = dataSource.getRepository('products');
      expect(productRepoMock.update).toHaveBeenCalledWith(
        { id: productId },
        expect.objectContaining({ is_active: false })
      );
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
  };

  return {
    getRepository: jest.fn(() => mockRepository),
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };
}
