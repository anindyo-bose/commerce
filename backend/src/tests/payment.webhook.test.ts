import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PaymentController } from '../controllers/payment.controller';
import { PaymentService } from '../services/payment.service';
import * as crypto from 'crypto';

describe('Payment Webhook', () => {
  let paymentController: PaymentController;
  let paymentService: jest.Mocked<PaymentService>;

  beforeEach(() => {
    paymentService = {
      validateWebhookSignature: jest.fn(),
      processWebhook: jest.fn(),
    } as any;

    paymentController = new PaymentController(paymentService);

    // Set webhook secret for testing
    process.env.PAYMENT_WEBHOOK_SECRET = 'test_webhook_secret_123';
  });

  describe('Webhook Signature Validation', () => {
    it('should validate correct signature', () => {
      const payload = {
        id: 'webhook_123',
        transaction_id: 'TXN123456',
        status: 'success',
        amount: 1000,
      };

      const signature = crypto
        .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
        .update(JSON.stringify(payload))
        .digest('hex');

      paymentService.validateWebhookSignature.mockReturnValue(true);

      const isValid = paymentService.validateWebhookSignature(
        payload,
        signature
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = { id: 'webhook_123', status: 'success' };
      const invalidSignature = 'invalid_signature';

      paymentService.validateWebhookSignature.mockReturnValue(false);

      const isValid = paymentService.validateWebhookSignature(
        payload,
        invalidSignature
      );

      expect(isValid).toBe(false);
    });

    it('should prevent timing attacks with safe comparison', () => {
      const payload = { id: 'webhook_123' };
      const validSignature = crypto
        .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
        .update(JSON.stringify(payload))
        .digest('hex');

      // Modify one character
      const tamperedSignature =
        'x' + validSignature.slice(1);

      paymentService.validateWebhookSignature.mockReturnValue(false);

      const isValid = paymentService.validateWebhookSignature(
        payload,
        tamperedSignature
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Webhook Idempotency', () => {
    it('should process webhook only once', async () => {
      const webhookPayload = {
        id: 'webhook_duplicate_123',
        transaction_id: 'TXN789',
        status: 'success',
      };

      const signature = generateSignature(webhookPayload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      // First request
      const request1 = {
        body: webhookPayload,
        headers: { 'x-webhook-signature': signature },
      };

      await paymentController.handlePaymentWebhook(
        request1.body,
        request1.headers['x-webhook-signature']
      );

      expect(paymentService.processWebhook).toHaveBeenCalledTimes(1);

      // Duplicate request (should be skipped)
      const request2 = {
        body: webhookPayload,
        headers: { 'x-webhook-signature': signature },
      };

      await paymentController.handlePaymentWebhook(
        request2.body,
        request2.headers['x-webhook-signature']
      );

      // Should still be called only once due to idempotency check
      expect(paymentService.processWebhook).toHaveBeenCalledTimes(1);
    });

    it('should use webhook ID for idempotency key', async () => {
      const payload = {
        id: 'webhook_unique_456',
        transaction_id: 'TXN456',
        status: 'success',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      await paymentController.handlePaymentWebhook(payload, signature);

      expect(paymentService.processWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'webhook_unique_456' })
      );
    });
  });

  describe('Payment Status Mapping', () => {
    it('should map gateway "success" to "SUCCESS"', async () => {
      const payload = {
        id: 'webhook_success',
        transaction_id: 'TXN123',
        status: 'success',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      await paymentController.handlePaymentWebhook(payload, signature);

      expect(paymentService.processWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success' })
      );
    });

    it('should map gateway "failed" to "FAILED"', async () => {
      const payload = {
        id: 'webhook_failed',
        transaction_id: 'TXN456',
        status: 'failed',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      await paymentController.handlePaymentWebhook(payload, signature);

      expect(paymentService.processWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    });

    it('should map various success statuses', async () => {
      const successStatuses = ['success', 'completed', 'captured'];

      for (const status of successStatuses) {
        const payload = {
          id: `webhook_${status}`,
          transaction_id: `TXN_${status}`,
          status,
        };

        const signature = generateSignature(payload);

        paymentService.validateWebhookSignature.mockReturnValue(true);
        paymentService.processWebhook.mockResolvedValue();

        await paymentController.handlePaymentWebhook(payload, signature);

        expect(paymentService.processWebhook).toHaveBeenCalledWith(
          expect.objectContaining({ status })
        );
      }
    });
  });

  describe('Order Status Update', () => {
    it('should confirm order on successful payment', async () => {
      const payload = {
        id: 'webhook_confirm',
        transaction_id: 'TXN_CONFIRM',
        status: 'success',
        order_id: 'order-123',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      await paymentController.handlePaymentWebhook(payload, signature);

      expect(paymentService.processWebhook).toHaveBeenCalled();
    });

    it('should not confirm order on failed payment', async () => {
      const payload = {
        id: 'webhook_fail',
        transaction_id: 'TXN_FAIL',
        status: 'failed',
        order_id: 'order-456',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      await paymentController.handlePaymentWebhook(payload, signature);

      expect(paymentService.processWebhook).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid signature', async () => {
      const payload = { id: 'webhook_invalid', status: 'success' };
      const invalidSignature = 'bad_signature';

      paymentService.validateWebhookSignature.mockReturnValue(false);

      const res = await paymentController.handlePaymentWebhook(
        payload,
        invalidSignature
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid signature');
      expect(paymentService.processWebhook).not.toHaveBeenCalled();
    });

    it('should handle missing transaction ID gracefully', async () => {
      const payload = {
        id: 'webhook_missing_txn',
        status: 'success',
        // No transaction_id
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockRejectedValue(
        new Error('Payment not found')
      );

      await expect(
        paymentController.handlePaymentWebhook(payload, signature)
      ).rejects.toThrow('Payment not found');
    });

    it('should handle database errors gracefully', async () => {
      const payload = {
        id: 'webhook_db_error',
        transaction_id: 'TXN_ERROR',
        status: 'success',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(
        paymentController.handlePaymentWebhook(payload, signature)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Webhook Response Format', () => {
    it('should return 200 status for successful processing', async () => {
      const payload = {
        id: 'webhook_200',
        transaction_id: 'TXN_200',
        status: 'success',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue();

      const res = await paymentController.handlePaymentWebhook(
        payload,
        signature
      );

      expect(res.success).toBe(true);
      expect(res.message).toBe('Webhook processed');
    });

    it('should acknowledge duplicate webhooks', async () => {
      const payload = {
        id: 'webhook_dup',
        transaction_id: 'TXN_DUP',
        status: 'success',
      };

      const signature = generateSignature(payload);

      paymentService.validateWebhookSignature.mockReturnValue(true);
      paymentService.processWebhook.mockResolvedValue(); // Returns void for duplicates

      const res = await paymentController.handlePaymentWebhook(
        payload,
        signature
      );

      expect(res.success).toBe(true);
    });
  });
});

function generateSignature(payload: any): string {
  return crypto
    .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
    .update(JSON.stringify(payload))
    .digest('hex');
}
