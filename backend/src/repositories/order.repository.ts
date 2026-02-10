import { DataSource, Repository } from 'typeorm';
import { Order, OrderItem, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { ProductRepository } from './product.repository';
import { CartRepository } from './cart.repository';

export class OrderRepository {
  private orderRepo: Repository<any>;
  private orderItemRepo: Repository<any>;
  private productRepo: ProductRepository;
  private cartRepo: CartRepository;

  constructor(private dataSource: DataSource) {
    this.orderRepo = dataSource.getRepository('orders');
    this.orderItemRepo = dataSource.getRepository('order_items');
    this.productRepo = new ProductRepository(dataSource);
    this.cartRepo = new CartRepository(dataSource);
  }

  /**
   * Create order from cart
   */
  async createFromCart(
    userId: string,
    shippingAddress: string
  ): Promise<Order> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validate cart stock
      const stockValidation = await this.cartRepo.validateCartStock(userId);
      if (!stockValidation.valid) {
        throw new Error(`Insufficient stock: ${JSON.stringify(stockValidation.errors)}`);
      }

      // 2. Get cart summary
      const cartSummary = await this.cartRepo.getCartSummary(userId);
      if (cartSummary.cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // 3. Generate order number
      const orderNumber = await this.generateOrderNumber(queryRunner);

      // 4. Create order
      const orderResult = await queryRunner.manager.insert('orders', {
        user_id: userId,
        order_number: orderNumber,
        order_status: OrderStatus.PENDING,
        payment_status: PaymentStatus.INITIATED,
        shipping_address: shippingAddress,
        subtotal: cartSummary.subtotal,
        total_gst: cartSummary.totalGst,
        total_amount: cartSummary.totalAmount,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const orderId = orderResult.identifiers[0].id;

      // 5. Create order items (snapshot from cart)
      for (const cartItem of cartSummary.cart.items) {
        const product = await this.productRepo.findById(cartItem.productId);
        if (!product) throw new Error(`Product not found: ${cartItem.productId}`);

        await queryRunner.manager.insert('order_items', {
          order_id: orderId,
          product_id: cartItem.productId,
          product_name_snapshot: product.name,
          product_sku_snapshot: product.sku,
          quantity: cartItem.quantity,
          unit_base_price: cartItem.basePrice,
          gst_percentage: cartItem.gstPercentage,
          unit_gst_amount: cartItem.gstAmount,
          total_base_price: cartItem.basePrice * cartItem.quantity,
          total_gst_amount: cartItem.gstAmount * cartItem.quantity,
          item_total: cartItem.totalPrice * cartItem.quantity,
          created_at: new Date(),
        });

        // Commit stock reservation
        await this.productRepo.commitStock(cartItem.productId, cartItem.quantity);
      }

      // 6. Clear cart
      await this.cartRepo.clearCart(userId);

      await queryRunner.commitTransaction();

      return this.findById(orderId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Find order by ID
   */
  async findById(id: string): Promise<Order | null> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items'],
    });

    if (!order) return null;

    return this.mapToEntity(order);
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const order = await this.orderRepo.findOne({
      where: { order_number: orderNumber },
      relations: ['items'],
    });

    if (!order) return null;

    return this.mapToEntity(order);
  }

  /**
   * List user orders
   */
  async listUserOrders(
    userId: string,
    params: { page: number; limit: number }
  ): Promise<{ items: Order[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    const [items, total] = await this.orderRepo.findAndCount({
      where: { user_id: userId },
      relations: ['items'],
      order: { created_at: 'DESC' },
      skip: offset,
      take: params.limit,
    });

    return {
      items: items.map(o => this.mapToEntity(o)),
      total,
    };
  }

  /**
   * List seller orders (orders containing seller's products)
   */
  async listSellerOrders(
    sellerId: string,
    params: { page: number; limit: number }
  ): Promise<{ items: Order[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    const query = `
      SELECT DISTINCT o.*
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.seller_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const items = await this.dataSource.query(query, [sellerId, params.limit, offset]);

    const countQuery = `
      SELECT COUNT(DISTINCT o.id) as count
      FROM orders o
      JOIN order_items oi ON o.id = oi.order_id
      JOIN products p ON oi.product_id = p.id
      WHERE p.seller_id = $1
    `;

    const [{ count }] = await this.dataSource.query(countQuery, [sellerId]);

    // Load full order details
    const fullOrders = await Promise.all(
      items.map((o: any) => this.findById(o.id))
    );

    return {
      items: fullOrders,
      total: parseInt(count),
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    // Validate state transition
    const order = await this.findById(orderId);
    if (!order) throw new Error('Order not found');

    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
      [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
      [OrderStatus.CANCELLED]: [],
      [OrderStatus.RETURNED]: [],
    };

    if (!validTransitions[order.orderStatus]?.includes(status)) {
      throw new Error(`Invalid status transition: ${order.orderStatus} -> ${status}`);
    }

    await this.orderRepo.update(
      { id: orderId },
      { order_status: status, updated_at: new Date() }
    );

    return this.findById(orderId);
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(orderId: string, status: PaymentStatus): Promise<Order> {
    await this.orderRepo.update(
      { id: orderId },
      { payment_status: status, updated_at: new Date() }
    );

    return this.findById(orderId);
  }

  /**
   * Get order statistics
   */
  async getOrderStats(userId: string): Promise<{
    totalOrders: number;
    pendingOrders: number;
    completedOrders: number;
    totalSpent: number;
  }> {
    const stats = await this.dataSource.query(
      `
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN order_status IN ('PENDING', 'CONFIRMED', 'SHIPPED') THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN order_status = 'DELIVERED' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN payment_status = 'SUCCESS' THEN total_amount ELSE 0 END) as total_spent
      FROM orders
      WHERE user_id = $1
      `,
      [userId]
    );

    return {
      totalOrders: parseInt(stats[0].total_orders) || 0,
      pendingOrders: parseInt(stats[0].pending_orders) || 0,
      completedOrders: parseInt(stats[0].completed_orders) || 0,
      totalSpent: parseFloat(stats[0].total_spent) || 0,
    };
  }

  /**
   * Generate unique order number
   */
  private async generateOrderNumber(queryRunner: any): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Get count of orders today
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const count = await queryRunner.manager.count('orders', {
      where: {
        created_at: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `ORD${year}${month}${day}${sequence}`;
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: any): Order {
    const order = new Order(
      row.id,
      row.user_id,
      row.order_number,
      row.order_status,
      row.payment_status
    );

    if (row.items && row.items.length > 0) {
      order.items = row.items.map((item: any) => {
        const orderItem = new OrderItem(
          item.id,
          item.product_id,
          item.product_name_snapshot,
          item.product_sku_snapshot,
          item.quantity,
          item.unit_base_price,
          item.gst_percentage,
          item.unit_gst_amount
        );
        orderItem.totalBasePrice = item.total_base_price;
        orderItem.totalGstAmount = item.total_gst_amount;
        orderItem.itemTotal = item.item_total;
        return orderItem;
      });
    }

    order.shippingAddress = row.shipping_address;
    order.subtotal = row.subtotal;
    order.totalGst = row.total_gst;
    order.totalAmount = row.total_amount;
    order.createdAt = row.created_at;
    order.updatedAt = row.updated_at;

    return order;
  }
}
