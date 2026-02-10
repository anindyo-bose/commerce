import { Injectable } from '@nestjs/common';
import { PaymentRepository } from '../repositories/payment.repository';
import { OrderRepository } from '../repositories/order.repository';
import * as crypto from 'crypto';

export interface PaymentInitiationResult {
  paymentId: string;
  gatewayUrl: string;
  transactionId: string;
  amount: number;
}

@Injectable()
export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository,
    private orderRepo: OrderRepository
  ) {}

  /**
   * Initiate payment for order
   */
  async initiatePayment(
    orderId: string,
    paymentMethod: string = 'RAZORPAY'
  ): Promise<PaymentInitiationResult> {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.paymentStatus !== 'INITIATED') {
      throw new Error(`Order payment already ${order.paymentStatus}`);
    }

    // Generate gateway transaction ID
    const transactionId = this.generateTransactionId();

    // Create payment record
    const payment = await this.paymentRepo.create({
      orderId,
      amount: order.totalAmount,
      paymentMethod,
      gatewayTransactionId: transactionId,
    });

    // In production, integrate with actual payment gateway
    // For now, return mock gateway URL
    const gatewayUrl = this.buildGatewayUrl(transactionId, order.totalAmount);

    return {
      paymentId: payment.id,
      gatewayUrl,
      transactionId,
      amount: order.totalAmount,
    };
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: any, signature: string): boolean {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('PAYMENT_WEBHOOK_SECRET not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process payment webhook
   */
  async processWebhook(payload: any): Promise<void> {
    const webhookId = payload.id || payload.event_id;
    const gatewayTransactionId = payload.transaction_id || payload.payment_id;

    // Check idempotency
    const alreadyProcessed = await this.paymentRepo.recordWebhookEvent(
      webhookId,
      payload
    );

    if (!alreadyProcessed) {
      // Already processed, skip
      return;
    }

    // Find payment
    const payment = await this.paymentRepo.findByGatewayTransactionId(
      gatewayTransactionId
    );

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Update payment status
    const status = this.mapGatewayStatus(payload.status);
    await this.paymentRepo.updateStatus(payment.id, status, payload);

    // Update order status
    if (status === 'SUCCESS') {
      await this.orderRepo.updatePaymentStatus(payment.order_id, 'SUCCESS');
      await this.orderRepo.updateOrderStatus(payment.order_id, 'CONFIRMED');
    } else if (status === 'FAILED') {
      await this.orderRepo.updatePaymentStatus(payment.order_id, 'FAILED');
    }
  }

  /**
   * Initiate refund
   */
  async initiateRefund(
    paymentId: string,
    amount: number,
    reason: string
  ): Promise<any> {
    const payment = await this.paymentRepo.findById(paymentId);

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'SUCCESS') {
      throw new Error('Can only refund successful payments');
    }

    if (amount > payment.amount) {
      throw new Error('Refund amount exceeds payment amount');
    }

    // In production, call payment gateway refund API
    // For now, return mock refund ID
    const refundId = `RFD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    return {
      refundId,
      paymentId,
      amount,
      status: 'PENDING',
      reason,
    };
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `TXN${timestamp}${random}`;
  }

  /**
   * Build payment gateway URL
   */
  private buildGatewayUrl(transactionId: string, amount: number): string {
    const baseUrl = process.env.PAYMENT_GATEWAY_URL || 'https://gateway.example.com';
    const merchantId = process.env.PAYMENT_MERCHANT_ID || 'MERCHANT123';

    return `${baseUrl}/checkout?merchant=${merchantId}&txn=${transactionId}&amount=${amount}`;
  }

  /**
   * Map gateway status to internal status
   */
  private mapGatewayStatus(gatewayStatus: string): string {
    const statusMap: Record<string, string> = {
      success: 'SUCCESS',
      completed: 'SUCCESS',
      captured: 'SUCCESS',
      failed: 'FAILED',
      error: 'FAILED',
      declined: 'FAILED',
      pending: 'PENDING',
      processing: 'PENDING',
    };

    return statusMap[gatewayStatus.toLowerCase()] || 'PENDING';
  }

  /**
   * Verify payment status from gateway
   */
  async verifyPaymentStatus(transactionId: string): Promise<string> {
    // In production, call payment gateway API to verify status
    // For now, return mock status
    const payment = await this.paymentRepo.findByGatewayTransactionId(
      transactionId
    );

    if (!payment) {
      throw new Error('Payment not found');
    }

    return payment.status;
  }
}
