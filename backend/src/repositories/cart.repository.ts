import { DataSource, Repository } from 'typeorm';
import { ShoppingCart, CartItem } from '../entities/cart.entity';
import { ProductRepository } from './product.repository';

export class CartRepository {
  private cartRepo: Repository<any>;
  private cartItemRepo: Repository<any>;
  private productRepo: ProductRepository;

  constructor(private dataSource: DataSource) {
    this.cartRepo = dataSource.getRepository('shopping_carts');
    this.cartItemRepo = dataSource.getRepository('cart_items');
    this.productRepo = new ProductRepository(dataSource);
  }

  /**
   * Get or create cart for user
   */
  async getOrCreateCart(userId: string): Promise<ShoppingCart> {
    let cart = await this.cartRepo.findOne({
      where: { user_id: userId },
      relations: ['items', 'items.product'],
    });

    if (!cart) {
      const result = await this.cartRepo.insert({
        user_id: userId,
        created_at: new Date(),
        updated_at: new Date(),
      });
      const cartId = result.identifiers[0].id;
      cart = await this.cartRepo.findOne({
        where: { id: cartId },
        relations: ['items'],
      });
    }

    return this.mapToEntity(cart);
  }

  /**
   * Add item to cart
   */
  async addItem(
    userId: string,
    productId: string,
    quantity: number
  ): Promise<ShoppingCart> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get or create cart
      const cart = await this.getOrCreateCart(userId);

      // Check if item already exists
      const existingItem = await queryRunner.manager.findOne('cart_items', {
        where: { cart_id: cart.id, product_id: productId },
      });

      if (existingItem) {
        // Update quantity
        await queryRunner.manager.update(
          'cart_items',
          { id: existingItem.id },
          {
            quantity: existingItem.quantity + quantity,
            updated_at: new Date(),
          }
        );
      } else {
        // Get product details
        const product = await this.productRepo.findById(productId);
        if (!product) throw new Error('Product not found');

        // Calculate prices
        const basePrice = product.basePrice;
        const gstPercentage = product.gstSlab.percentage;
        const gstAmount = (basePrice * gstPercentage) / 100;
        const totalPrice = basePrice + gstAmount;

        // Insert new item
        await queryRunner.manager.insert('cart_items', {
          cart_id: cart.id,
          product_id: productId,
          quantity,
          base_price: basePrice,
          gst_percentage: gstPercentage,
          gst_amount: gstAmount,
          total_price: totalPrice,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Update cart timestamp
      await queryRunner.manager.update(
        'shopping_carts',
        { id: cart.id },
        { updated_at: new Date() }
      );

      await queryRunner.commitTransaction();
      return this.getOrCreateCart(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Update cart item quantity
   */
  async updateItemQuantity(
    userId: string,
    itemId: string,
    quantity: number
  ): Promise<ShoppingCart> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const cart = await this.getOrCreateCart(userId);

      // Verify item belongs to user's cart
      const item = await queryRunner.manager.findOne('cart_items', {
        where: { id: itemId, cart_id: cart.id },
      });

      if (!item) throw new Error('Cart item not found');

      // Check stock availability
      const availableStock = await this.productRepo.getAvailableStock(item.product_id);
      if (quantity > availableStock) {
        throw new Error(`Only ${availableStock} units available`);
      }

      await queryRunner.manager.update(
        'cart_items',
        { id: itemId },
        { quantity, updated_at: new Date() }
      );

      await queryRunner.manager.update(
        'shopping_carts',
        { id: cart.id },
        { updated_at: new Date() }
      );

      await queryRunner.commitTransaction();
      return this.getOrCreateCart(userId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Remove item from cart
   */
  async removeItem(userId: string, itemId: string): Promise<ShoppingCart> {
    const cart = await this.getOrCreateCart(userId);

    await this.cartItemRepo.delete({
      id: itemId,
      cart_id: cart.id,
    });

    await this.cartRepo.update({ id: cart.id }, { updated_at: new Date() });

    return this.getOrCreateCart(userId);
  }

  /**
   * Clear cart (after order placement)
   */
  async clearCart(userId: string): Promise<void> {
    const cart = await this.getOrCreateCart(userId);
    await this.cartItemRepo.delete({ cart_id: cart.id });
    await this.cartRepo.update({ id: cart.id }, { updated_at: new Date() });
  }

  /**
   * Get cart with calculated totals
   */
  async getCartSummary(userId: string): Promise<{
    cart: ShoppingCart;
    subtotal: number;
    totalGst: number;
    totalAmount: number;
    itemCount: number;
    gstBreakup: Record<number, number>;
  }> {
    const cart = await this.getOrCreateCart(userId);

    let subtotal = 0;
    let totalGst = 0;
    const gstBreakup: Record<number, number> = {};

    for (const item of cart.items) {
      const itemSubtotal = item.basePrice * item.quantity;
      const itemGst = item.gstAmount * item.quantity;

      subtotal += itemSubtotal;
      totalGst += itemGst;

      if (!gstBreakup[item.gstPercentage]) {
        gstBreakup[item.gstPercentage] = 0;
      }
      gstBreakup[item.gstPercentage] += itemGst;
    }

    return {
      cart,
      subtotal,
      totalGst,
      totalAmount: subtotal + totalGst,
      itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
      gstBreakup,
    };
  }

  /**
   * Validate cart stock before checkout
   */
  async validateCartStock(userId: string): Promise<{
    valid: boolean;
    errors: Array<{ productId: string; productName: string; requested: number; available: number }>;
  }> {
    const cart = await this.getOrCreateCart(userId);
    const errors: Array<{ productId: string; productName: string; requested: number; available: number }> = [];

    for (const item of cart.items) {
      const availableStock = await this.productRepo.getAvailableStock(item.productId);
      if (item.quantity > availableStock) {
        const product = await this.productRepo.findById(item.productId);
        errors.push({
          productId: item.productId,
          productName: product?.name || 'Unknown',
          requested: item.quantity,
          available: availableStock,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: any): ShoppingCart {
    const cart = new ShoppingCart(row.id, row.user_id);

    if (row.items && row.items.length > 0) {
      cart.items = row.items.map((item: any) => {
        const cartItem = new CartItem(
          item.id,
          item.product_id,
          item.quantity,
          item.base_price,
          item.gst_percentage,
          item.gst_amount
        );
        cartItem.totalPrice = item.total_price;
        return cartItem;
      });
    }

    cart.createdAt = row.created_at;
    cart.updatedAt = row.updated_at;

    return cart;
  }
}
