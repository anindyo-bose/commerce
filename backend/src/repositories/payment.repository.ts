import { DataSource, Repository } from 'typeorm';

export class PaymentRepository {
  private paymentRepo: Repository<any>;

  constructor(private dataSource: DataSource) {
    this.paymentRepo = dataSource.getRepository('payments');
  }

  /**
   * Create payment record
   */
  async create(data: {
    orderId: string;
    amount: number;
    paymentMethod: string;
    gatewayTransactionId?: string;
  }): Promise<any> {
    const result = await this.paymentRepo.insert({
      order_id: data.orderId,
      amount: data.amount,
      payment_method: data.paymentMethod,
      status: 'INITIATED',
      gateway_transaction_id: data.gatewayTransactionId,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return this.findById(result.identifiers[0].id);
  }

  /**
   * Find payment by ID
   */
  async findById(id: string): Promise<any | null> {
    return this.paymentRepo.findOne({ where: { id } });
  }

  /**
   * Find payment by order ID
   */
  async findByOrderId(orderId: string): Promise<any | null> {
    return this.paymentRepo.findOne({
      where: { order_id: orderId },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Find payment by gateway transaction ID
   */
  async findByGatewayTransactionId(transactionId: string): Promise<any | null> {
    return this.paymentRepo.findOne({
      where: { gateway_transaction_id: transactionId },
    });
  }

  /**
   * Update payment status
   */
  async updateStatus(
    paymentId: string,
    status: string,
    gatewayResponse?: any
  ): Promise<any> {
    await this.paymentRepo.update(
      { id: paymentId },
      {
        status,
        gateway_response: gatewayResponse ? JSON.stringify(gatewayResponse) : null,
        updated_at: new Date(),
        ...(status === 'SUCCESS' && { completed_at: new Date() }),
        ...(status === 'FAILED' && { failed_at: new Date() }),
      }
    );

    return this.findById(paymentId);
  }

  /**
   * Record webhook event (idempotency check)
   */
  async recordWebhookEvent(webhookId: string, payload: any): Promise<boolean> {
    try {
      await this.dataSource.manager.insert('webhook_events', {
        webhook_id: webhookId,
        payload: JSON.stringify(payload),
        processed_at: new Date(),
      });
      return true;
    } catch (error) {
      // Duplicate webhook_id (already processed)
      return false;
    }
  }

  /**
   * List payments
   */
  async list(params: {
    page: number;
    limit: number;
    orderId?: string;
    status?: string;
  }): Promise<{ items: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.paymentRepo.createQueryBuilder('p').skip(offset).take(params.limit);

    if (params.orderId) {
      query = query.where('p.order_id = :orderId', { orderId: params.orderId });
    }

    if (params.status) {
      query = query.andWhere('p.status = :status', { status: params.status });
    }

    query = query.orderBy('p.created_at', 'DESC');

    const [items, total] = await query.getManyAndCount();

    return { items, total };
  }
}
