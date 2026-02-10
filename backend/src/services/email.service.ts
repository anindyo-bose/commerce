import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { InvoiceService } from './invoice.service';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private invoiceService: InvoiceService) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"E-Commerce" <noreply@example.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      // In production, implement retry logic or queue
      throw error;
    }
  }

  /**
   * Send order confirmation email
   */
  async sendOrderConfirmation(
    email: string,
    orderData: {
      orderNumber: string;
      customerName: string;
      totalAmount: number;
      items: Array<{ name: string; quantity: number; price: number }>;
    }
  ): Promise<void> {
    const itemsHtml = orderData.items
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>₹${item.price.toFixed(2)}</td>
      </tr>
    `
      )
      .join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f2f2f2; }
    .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Order Confirmed!</h1>
    </div>
    <div class="content">
      <p>Dear ${orderData.customerName},</p>
      <p>Thank you for your order. We've received your payment and your order is being processed.</p>
      
      <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
      
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <p class="total">Total: ₹${orderData.totalAmount.toFixed(2)}</p>
      
      <p>You will receive a shipping confirmation email once your order is dispatched.</p>
      
      <p>If you have any questions, please contact our support team.</p>
      
      <p>Best regards,<br>E-Commerce Team</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Order Confirmation - ${orderData.orderNumber}`,
      html,
    });
  }

  /**
   * Send invoice email with PDF attachment
   */
  async sendInvoiceEmail(
    email: string,
    orderId: string,
    customerName: string,
    orderNumber: string
  ): Promise<void> {
    // Generate invoice PDF
    const invoiceData = await this.invoiceService.generateInvoiceData(orderId);
    const pdfBuffer = await this.invoiceService.generatePdfInvoice(orderId);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Invoice</h1>
    </div>
    <div class="content">
      <p>Dear ${customerName},</p>
      <p>Please find attached the invoice for your order ${orderNumber}.</p>
      
      <p><strong>Invoice Number:</strong> ${invoiceData.invoiceNumber}</p>
      <p><strong>Amount:</strong> ₹${invoiceData.totalAmount.toFixed(2)}</p>
      
      <p>Thank you for your business!</p>
      
      <p>Best regards,<br>E-Commerce Team</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject: `Invoice ${invoiceData.invoiceNumber}`,
      html,
      attachments: [
        {
          filename: `invoice_${invoiceData.invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    userName: string
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .button { display: inline-block; padding: 12px 24px; background-color: #FF9800; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>We received a request to reset your password. Click the button below to reset it:</p>
      
      <a href="${resetUrl}" class="button">Reset Password</a>
      
      <p>If you didn't request a password reset, please ignore this email.</p>
      
      <p>This link will expire in 1 hour.</p>
      
      <p>Best regards,<br>E-Commerce Team</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Password Reset Request',
      html,
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email: string, userName: string): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to E-Commerce!</h1>
    </div>
    <div class="content">
      <p>Hi ${userName},</p>
      <p>Welcome to our platform! We're excited to have you on board.</p>
      
      <p>You can now:</p>
      <ul>
        <li>Browse thousands of products</li>
        <li>Track your orders</li>
        <li>Manage your profile</li>
        <li>Get exclusive deals</li>
      </ul>
      
      <p>If you have any questions, feel free to contact our support team.</p>
      
      <p>Happy shopping!</p>
      
      <p>Best regards,<br>E-Commerce Team</p>
    </div>
    <div class="footer">
      <p>This is an automated email. Please do not reply to this message.</p>
    </div>
  </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject: 'Welcome to E-Commerce!',
      html,
    });
  }
}
