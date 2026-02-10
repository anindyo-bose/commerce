import { DataSource, Repository } from 'typeorm';
import { Product, GSTSlab } from '../entities/product.entity';

export class ProductRepository {
  private productRepo: Repository<any>;
  private gstRepo: Repository<any>;

  constructor(private dataSource: DataSource) {
    this.productRepo = dataSource.getRepository('products');
    this.gstRepo = dataSource.getRepository('gst_slabs');
  }

  /**
   * Create new product
   */
  async create(data: {
    sellerId: string;
    sku: string;
    name: string;
    description: string;
    basePrice: number;
    gstPercentage: number;
    stock: number;
    categoryId?: string;
  }): Promise<Product> {
    // Validate GST slab exists
    const gstSlab = await this.gstRepo.findOne({
      where: { percentage: data.gstPercentage },
    });

    if (!gstSlab) {
      throw new Error(`Invalid GST percentage: ${data.gstPercentage}`);
    }

    const result = await this.productRepo.insert({
      seller_id: data.sellerId,
      sku: data.sku,
      name: data.name,
      description: data.description,
      base_price: data.basePrice,
      gst_slab_id: gstSlab.id,
      category_id: data.categoryId,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const productId = result.identifiers[0].id;

    // Create inventory record
    await this.dataSource.manager.insert('product_inventory', {
      product_id: productId,
      stock_quantity: data.stock,
      reserved_quantity: 0,
      updated_at: new Date(),
    });

    return this.findById(productId);
  }

  /**
   * Find product by ID
   */
  async findById(id: string): Promise<Product | null> {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['gst_slab', 'inventory', 'seller'],
    });

    if (!product) return null;

    return this.mapToEntity(product);
  }

  /**
   * Find product by SKU
   */
  async findBySKU(sku: string): Promise<Product | null> {
    const product = await this.productRepo.findOne({
      where: { sku },
      relations: ['gst_slab', 'inventory'],
    });

    if (!product) return null;

    return this.mapToEntity(product);
  }

  /**
   * List products with filters and pagination
   */
  async list(params: {
    page: number;
    limit: number;
    sellerId?: string;
    categoryId?: string;
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    inStockOnly?: boolean;
  }): Promise<{ items: Product[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.gst_slab', 'g')
      .leftJoinAndSelect('p.inventory', 'i')
      .where('p.is_active = :active', { active: true })
      .skip(offset)
      .take(params.limit);

    if (params.sellerId) {
      query = query.andWhere('p.seller_id = :sellerId', { sellerId: params.sellerId });
    }

    if (params.categoryId) {
      query = query.andWhere('p.category_id = :categoryId', { categoryId: params.categoryId });
    }

    if (params.search) {
      query = query.andWhere('(p.name ILIKE :search OR p.description ILIKE :search)', {
        search: `%${params.search}%`,
      });
    }

    if (params.minPrice) {
      query = query.andWhere('p.base_price >= :minPrice', { minPrice: params.minPrice });
    }

    if (params.maxPrice) {
      query = query.andWhere('p.base_price <= :maxPrice', { maxPrice: params.maxPrice });
    }

    if (params.inStockOnly) {
      query = query.andWhere('i.stock_quantity > 0');
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: items.map(p => this.mapToEntity(p)),
      total,
    };
  }

  /**
   * Update product
   */
  async update(
    productId: string,
    data: Partial<{
      name: string;
      description: string;
      basePrice: number;
      gstPercentage: number;
      stock: number;
    }>
  ): Promise<Product> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const updateData: any = { updated_at: new Date() };

      if (data.name) updateData.name = data.name;
      if (data.description) updateData.description = data.description;
      if (data.basePrice) updateData.base_price = data.basePrice;

      if (data.gstPercentage) {
        const gstSlab = await this.gstRepo.findOne({
          where: { percentage: data.gstPercentage },
        });
        if (!gstSlab) throw new Error(`Invalid GST percentage: ${data.gstPercentage}`);
        updateData.gst_slab_id = gstSlab.id;
      }

      await queryRunner.manager.update('products', { id: productId }, updateData);

      if (data.stock !== undefined) {
        await queryRunner.manager.update(
          'product_inventory',
          { product_id: productId },
          { stock_quantity: data.stock, updated_at: new Date() }
        );
      }

      await queryRunner.commitTransaction();
      return this.findById(productId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Deactivate product (soft delete)
   */
  async deactivate(productId: string): Promise<void> {
    await this.productRepo.update({ id: productId }, { is_active: false, updated_at: new Date() });
  }

  /**
   * Check and reserve stock
   */
  async reserveStock(productId: string, quantity: number): Promise<boolean> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const inventory = await queryRunner.manager.findOne('product_inventory', {
        where: { product_id: productId },
        lock: { mode: 'pessimistic_write' }, // Row-level lock
      });

      if (!inventory) throw new Error('Product not found');

      const availableStock = inventory.stock_quantity - inventory.reserved_quantity;
      if (availableStock < quantity) {
        await queryRunner.rollbackTransaction();
        return false;
      }

      await queryRunner.manager.update(
        'product_inventory',
        { product_id: productId },
        {
          reserved_quantity: inventory.reserved_quantity + quantity,
          updated_at: new Date(),
        }
      );

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Commit reserved stock (after order placement)
   */
  async commitStock(productId: string, quantity: number): Promise<void> {
    await this.dataSource.manager.query(
      `
      UPDATE product_inventory
      SET stock_quantity = stock_quantity - $1,
          reserved_quantity = reserved_quantity - $1,
          updated_at = NOW()
      WHERE product_id = $2
      `,
      [quantity, productId]
    );
  }

  /**
   * Release reserved stock (on cart abandonment)
   */
  async releaseStock(productId: string, quantity: number): Promise<void> {
    await this.dataSource.manager.query(
      `
      UPDATE product_inventory
      SET reserved_quantity = reserved_quantity - $1,
          updated_at = NOW()
      WHERE product_id = $2
      `,
      [quantity, productId]
    );
  }

  /**
   * Get available stock (not reserved)
   */
  async getAvailableStock(productId: string): Promise<number> {
    const inventory = await this.dataSource.manager.findOne('product_inventory', {
      where: { product_id: productId },
    });

    if (!inventory) return 0;

    return inventory.stock_quantity - inventory.reserved_quantity;
  }

  /**
   * Get all GST slabs
   */
  async getGSTSlabs(): Promise<GSTSlab[]> {
    const slabs = await this.gstRepo.find({ order: { percentage: 'ASC' } });
    return slabs.map(s => new GSTSlab(s.id, s.percentage, s.description));
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: any): Product {
    const gstSlab = row.gst_slab
      ? new GSTSlab(row.gst_slab.id, row.gst_slab.percentage, row.gst_slab.description)
      : null;

    const product = new Product(
      row.id,
      row.seller_id,
      row.sku,
      row.name,
      row.description,
      row.base_price,
      gstSlab
    );

    if (row.inventory) {
      product.stock = row.inventory.stock_quantity;
    }

    product.isActive = row.is_active;
    product.createdAt = row.created_at;
    product.updatedAt = row.updated_at;

    return product;
  }
}
