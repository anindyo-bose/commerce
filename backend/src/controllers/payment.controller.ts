import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { PaymentRepository } from '../repositories/payment.repository';
import { OrderRepository } from '../repositories/order.repository';
import * as crypto from 'crypto';

@Controller('webhooks')
export class PaymentController {
  constructor(
    private paymentRepo: PaymentRepository,
    private orderRepo: OrderRepository
  ) {}

  /**
   * POST /webhooks/payment
   * Payment gateway webhook handler
   */
  @Post('payment')
  @HttpCode(200)
  async handlePaymentWebhook(
    @Body() body: any,
    @Headers('x-webhook-signature') signature: string
  ) {
    // Validate webhook signature
    const isValid = this.validateSignature(body, signature);
    if (!isValid) {
      return {
        success: false,
        error: 'Invalid signature',
      };
    }

    // Idempotency check (prevent duplicate processing)
    const webhookId = body.id || body.event_id;
    const alreadyProcessed = await this.paymentRepo.recordWebhookEvent(
      webhookId,
      body
    );

    if (!alreadyProcessed) {
      return {
        success: true,
        message: 'Webhook already processed',
      };
    }

    // Process payment event
    const gatewayTransactionId = body.transaction_id || body.payment_id;
    const payment = await this.paymentRepo.findByGatewayTransactionId(
      gatewayTransactionId
    );

    if (!payment) {
      return {
        success: false,
        error: 'Payment not found',
      };
    }

    // Update payment status
    const newStatus = this.mapGatewayStatus(body.status);
    await this.paymentRepo.updateStatus(payment.id, newStatus, body);

    // Update order payment status
    if (newStatus === 'SUCCESS') {
      await this.orderRepo.updatePaymentStatus(payment.order_id, 'SUCCESS');
      await this.orderRepo.updateOrderStatus(payment.order_id, 'CONFIRMED');
    } else if (newStatus === 'FAILED') {
      await this.orderRepo.updatePaymentStatus(payment.order_id, 'FAILED');
    }

    return {
      success: true,
      message: 'Webhook processed',
    };
  }

  /**
   * Validate webhook signature
   */
  private validateSignature(payload: any, signature: string): boolean {
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('PAYMENT_WEBHOOK_SECRET not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Map gateway status to internal status
   */
  private mapGatewayStatus(gatewayStatus: string): string {
    const statusMap: Record<string, string> = {
      success: 'SUCCESS',
      completed: 'SUCCESS',
      failed: 'FAILED',
      error: 'FAILED',
      pending: 'PENDING',
    };

    return statusMap[gatewayStatus.toLowerCase()] || 'PENDING';
  }
}
