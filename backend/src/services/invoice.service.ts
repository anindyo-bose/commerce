import { Injectable } from '@nestjs/common';
import { OrderRepository } from '../repositories/order.repository';
import { UserRepository } from '../repositories/user.repository';

export interface InvoiceData {
  orderNumber: string;
  invoiceNumber: string;
  invoiceDate: Date;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: any;
  };
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    gstPercentage: number;
    gstAmount: number;
    totalPrice: number;
  }>;
  subtotal: number;
  gstBreakup: Array<{
    percentage: number;
    taxableAmount: number;
    gstAmount: number;
  }>;
  totalGst: number;
  totalAmount: number;
}

@Injectable()
export class InvoiceService {
  constructor(
    private orderRepo: OrderRepository,
    private userRepo: UserRepository
  ) {}

  /**
   * Generate invoice data for order
   */
  async generateInvoiceData(orderId: string): Promise<InvoiceData> {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.paymentStatus !== 'SUCCESS') {
      throw new Error('Cannot generate invoice for unpaid order');
    }

    // Get customer details
    const user = await this.userRepo.findById(order.userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Generate invoice number
    const invoiceNumber = this.generateInvoiceNumber(order.orderNumber);

    // Calculate GST breakup
    const gstBreakup = this.calculateGstBreakup(order.items);

    return {
      orderNumber: order.orderNumber,
      invoiceNumber,
      invoiceDate: new Date(),
      customer: {
        name: user.fullName || user.email,
        email: user.email,
        phone: user.phoneNumber || '',
        address: order.shippingAddress,
      },
      items: order.items.map((item) => ({
        name: item.productNameSnapshot,
        sku: item.productSkuSnapshot,
        quantity: item.quantity,
        unitPrice: item.unitBasePrice,
        gstPercentage: item.gstPercentage,
        gstAmount: item.unitGstAmount * item.quantity,
        totalPrice: item.itemTotal,
      })),
      subtotal: order.subtotal,
      gstBreakup,
      totalGst: order.totalGst,
      totalAmount: order.totalAmount,
    };
  }

  /**
   * Generate HTML invoice
   */
  async generateHtmlInvoice(orderId: string): Promise<string> {
    const data = await this.generateInvoiceData(orderId);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${data.invoiceNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; margin-bottom: 30px; }
    .invoice-details { margin-bottom: 20px; }
    .customer-details { margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #f2f2f2; }
    .text-right { text-align: right; }
    .total-row { font-weight: bold; background-color: #f9f9f9; }
    .gst-breakup { margin-top: 20px; }
    .footer { margin-top: 40px; text-align: center; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>TAX INVOICE</h1>
    <p>E-Commerce Platform</p>
  </div>

  <div class="invoice-details">
    <p><strong>Invoice Number:</strong> ${data.invoiceNumber}</p>
    <p><strong>Invoice Date:</strong> ${data.invoiceDate.toLocaleDateString()}</p>
    <p><strong>Order Number:</strong> ${data.orderNumber}</p>
  </div>

  <div class="customer-details">
    <h3>Bill To:</h3>
    <p><strong>${data.customer.name}</strong></p>
    <p>${data.customer.email}</p>
    <p>${data.customer.phone}</p>
    <p>${this.formatAddress(data.customer.address)}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>SKU</th>
        <th class="text-right">Qty</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">GST %</th>
        <th class="text-right">GST Amount</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.items
        .map(
          (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.sku}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">₹${item.unitPrice.toFixed(2)}</td>
          <td class="text-right">${item.gstPercentage}%</td>
          <td class="text-right">₹${item.gstAmount.toFixed(2)}</td>
          <td class="text-right">₹${item.totalPrice.toFixed(2)}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="gst-breakup">
    <h3>GST Breakup</h3>
    <table style="width: 50%; margin-left: auto;">
      <thead>
        <tr>
          <th>GST %</th>
          <th class="text-right">Taxable Amount</th>
          <th class="text-right">GST Amount</th>
        </tr>
      </thead>
      <tbody>
        ${data.gstBreakup
          .map(
            (gst) => `
          <tr>
            <td>${gst.percentage}%</td>
            <td class="text-right">₹${gst.taxableAmount.toFixed(2)}</td>
            <td class="text-right">₹${gst.gstAmount.toFixed(2)}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  </div>

  <table style="width: 50%; margin-left: auto; margin-top: 20px;">
    <tr>
      <td><strong>Subtotal:</strong></td>
      <td class="text-right">₹${data.subtotal.toFixed(2)}</td>
    </tr>
    <tr>
      <td><strong>Total GST:</strong></td>
      <td class="text-right">₹${data.totalGst.toFixed(2)}</td>
    </tr>
    <tr class="total-row">
      <td><strong>TOTAL:</strong></td>
      <td class="text-right">₹${data.totalAmount.toFixed(2)}</td>
    </tr>
  </table>

  <div class="footer">
    <p>Thank you for your business!</p>
    <p>This is a computer-generated invoice and does not require a signature.</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate PDF invoice (requires PDF library)
   */
  async generatePdfInvoice(orderId: string): Promise<Buffer> {
    // In production, use library like puppeteer, pdfkit, or jsPDF
    // For now, return HTML as buffer
    const html = await this.generateHtmlInvoice(orderId);
    return Buffer.from(html, 'utf-8');
  }

  /**
   * Generate invoice number from order number
   */
  private generateInvoiceNumber(orderNumber: string): string {
    // Convert ORD20260210001 to INV20260210001
    return orderNumber.replace('ORD', 'INV');
  }

  /**
   * Calculate GST breakup by percentage
   */
  private calculateGstBreakup(
    items: any[]
  ): Array<{ percentage: number; taxableAmount: number; gstAmount: number }> {
    const breakupMap: Map<
      number,
      { taxableAmount: number; gstAmount: number }
    > = new Map();

    items.forEach((item) => {
      const existing = breakupMap.get(item.gstPercentage) || {
        taxableAmount: 0,
        gstAmount: 0,
      };

      const itemBaseTotal = item.unitBasePrice * item.quantity;
      const itemGstTotal = item.unitGstAmount * item.quantity;

      breakupMap.set(item.gstPercentage, {
        taxableAmount: existing.taxableAmount + itemBaseTotal,
        gstAmount: existing.gstAmount + itemGstTotal,
      });
    });

    return Array.from(breakupMap.entries())
      .map(([percentage, amounts]) => ({
        percentage,
        taxableAmount: amounts.taxableAmount,
        gstAmount: amounts.gstAmount,
      }))
      .sort((a, b) => a.percentage - b.percentage);
  }

  /**
   * Format address for display
   */
  private formatAddress(address: any): string {
    if (!address) return '';

    const parts = [
      address.street,
      address.city,
      address.state,
      address.pincode,
      address.country,
    ].filter(Boolean);

    return parts.join(', ');
  }
}
