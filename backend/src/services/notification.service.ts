import { Injectable } from '@nestjs/common';

export interface PushNotification {
  userId: string;
  title: string;
  body: string;
  data?: any;
}

export interface SmsNotification {
  phoneNumber: string;
  message: string;
}

@Injectable()
export class NotificationService {
  /**
   * Send push notification
   */
  async sendPushNotification(notification: PushNotification): Promise<void> {
    // In production, integrate with Firebase Cloud Messaging (FCM) or OneSignal
    console.log('Push notification sent:', {
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
    });

    // Mock implementation
    // const fcmToken = await this.getUserFcmToken(notification.userId);
    // await admin.messaging().send({
    //   token: fcmToken,
    //   notification: {
    //     title: notification.title,
    //     body: notification.body,
    //   },
    //   data: notification.data,
    // });
  }

  /**
   * Send SMS notification
   */
  async sendSms(notification: SmsNotification): Promise<void> {
    // In production, integrate with Twilio, AWS SNS, or similar
    console.log('SMS sent:', {
      to: notification.phoneNumber,
      message: notification.message,
    });

    // Mock implementation
    // const client = new Twilio(accountSid, authToken);
    // await client.messages.create({
    //   body: notification.message,
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: notification.phoneNumber,
    // });
  }

  /**
   * Send order confirmation notification
   */
  async sendOrderConfirmationNotification(
    userId: string,
    orderNumber: string,
    phoneNumber?: string
  ): Promise<void> {
    // Push notification
    await this.sendPushNotification({
      userId,
      title: 'Order Confirmed',
      body: `Your order ${orderNumber} has been confirmed and is being processed.`,
      data: { orderNumber, type: 'order_confirmation' },
    });

    // SMS notification (if phone number provided)
    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: `Your order ${orderNumber} has been confirmed. Track your order at ${process.env.FRONTEND_URL}/orders/${orderNumber}`,
      });
    }
  }

  /**
   * Send order shipped notification
   */
  async sendOrderShippedNotification(
    userId: string,
    orderNumber: string,
    trackingNumber: string,
    phoneNumber?: string
  ): Promise<void> {
    await this.sendPushNotification({
      userId,
      title: 'Order Shipped',
      body: `Your order ${orderNumber} has been shipped. Tracking: ${trackingNumber}`,
      data: { orderNumber, trackingNumber, type: 'order_shipped' },
    });

    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: `Your order ${orderNumber} has been shipped. Track at: ${trackingNumber}`,
      });
    }
  }

  /**
   * Send order delivered notification
   */
  async sendOrderDeliveredNotification(
    userId: string,
    orderNumber: string,
    phoneNumber?: string
  ): Promise<void> {
    await this.sendPushNotification({
      userId,
      title: 'Order Delivered',
      body: `Your order ${orderNumber} has been delivered. Thank you for shopping with us!`,
      data: { orderNumber, type: 'order_delivered' },
    });

    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: `Your order ${orderNumber} has been delivered. Thank you for shopping with us!`,
      });
    }
  }

  /**
   * Send payment failed notification
   */
  async sendPaymentFailedNotification(
    userId: string,
    orderNumber: string,
    phoneNumber?: string
  ): Promise<void> {
    await this.sendPushNotification({
      userId,
      title: 'Payment Failed',
      body: `Payment for order ${orderNumber} failed. Please try again.`,
      data: { orderNumber, type: 'payment_failed' },
    });

    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: `Payment for order ${orderNumber} failed. Please retry payment.`,
      });
    }
  }

  /**
   * Send low stock alert to seller
   */
  async sendLowStockAlert(
    sellerId: string,
    productName: string,
    currentStock: number,
    phoneNumber?: string
  ): Promise<void> {
    await this.sendPushNotification({
      userId: sellerId,
      title: 'Low Stock Alert',
      body: `${productName} is running low on stock (${currentStock} remaining).`,
      data: { productName, currentStock, type: 'low_stock' },
    });

    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: `Low stock alert: ${productName} has only ${currentStock} units remaining.`,
      });
    }
  }

  /**
   * Send seller verification notification
   */
  async sendSellerVerificationNotification(
    userId: string,
    status: 'approved' | 'rejected',
    phoneNumber?: string
  ): Promise<void> {
    const title = status === 'approved' ? 'Seller Approved' : 'Seller Application Rejected';
    const body =
      status === 'approved'
        ? 'Congratulations! Your seller application has been approved.'
        : 'Your seller application has been rejected. Please contact support for details.';

    await this.sendPushNotification({
      userId,
      title,
      body,
      data: { type: 'seller_verification', status },
    });

    if (phoneNumber) {
      await this.sendSms({
        phoneNumber,
        message: body,
      });
    }
  }

  /**
   * Send promotional notification
   */
  async sendPromotionalNotification(
    userIds: string[],
    title: string,
    message: string
  ): Promise<void> {
    // Batch send push notifications
    const promises = userIds.map((userId) =>
      this.sendPushNotification({
        userId,
        title,
        body: message,
        data: { type: 'promotional' },
      })
    );

    await Promise.allSettled(promises);
  }
}
