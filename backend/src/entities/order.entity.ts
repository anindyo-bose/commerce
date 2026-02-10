/**
 * Order Domain Entity
 * Clean Architecture: No framework dependencies
 */

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  RETURNED = 'RETURNED',
}

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  REFUNDED = 'REFUNDED',
}

export class Order {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly orderNumber: string,
    public orderStatus: OrderStatus,
    public paymentStatus: PaymentStatus,
    public subtotal: number,
    public totalGst: number,
    public totalAmount: number,
    public shippingAddress: string,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (subtotal < 0 || totalGst < 0 || totalAmount < 0) {
      throw new Error('Order amounts cannot be negative');
    }
    
    const calculatedTotal = subtotal + totalGst;
    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      throw new Error('Order total mismatch: subtotal + GST must equal total amount');
    }
  }

  confirm(): void {
    if (this.orderStatus !== OrderStatus.PENDING) {
      throw new Error('Only pending orders can be confirmed');
    }
    this.orderStatus = OrderStatus.CONFIRMED;
    this.updatedAt = new Date();
  }

  ship(): void {
    if (this.orderStatus !== OrderStatus.CONFIRMED) {
      throw new Error('Only confirmed orders can be shipped');
    }
    this.orderStatus = OrderStatus.SHIPPED;
    this.updatedAt = new Date();
  }

  deliver(): void {
    if (this.orderStatus !== OrderStatus.SHIPPED) {
      throw new Error('Only shipped orders can be delivered');
    }
    this.orderStatus = OrderStatus.DELIVERED;
    this.updatedAt = new Date();
  }

  cancel(): void {
    if (![OrderStatus.PENDING, OrderStatus.CONFIRMED].includes(this.orderStatus)) {
      throw new Error('Cannot cancel order in current status');
    }
    this.orderStatus = OrderStatus.CANCELLED;
    this.updatedAt = new Date();
  }

  markPaymentSuccess(): void {
    this.paymentStatus = PaymentStatus.SUCCESS;
    this.updatedAt = new Date();
  }

  markPaymentFailed(): void {
    this.paymentStatus = PaymentStatus.FAILED;
    this.updatedAt = new Date();
  }
}

export class OrderItem {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly productId: string,
    public readonly sellerId: string,
    public readonly productName: string,
    public readonly sku: string,
    public readonly quantity: number,
    public readonly basePrice: number,
    public readonly gstPercentage: number,
    public readonly gstAmount: number,
    public readonly itemTotal: number
  ) {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    if (basePrice < 0 || gstAmount < 0 || itemTotal < 0) {
      throw new Error('Prices cannot be negative');
    }

    // Validate calculations
    const expectedSubtotal = basePrice * quantity;
    const expectedGst = (expectedSubtotal * gstPercentage) / 100;
    const expectedTotal = expectedSubtotal + expectedGst;

    if (Math.abs(expectedGst - gstAmount) > 0.01) {
      throw new Error('GST calculation mismatch');
    }
    if (Math.abs(expectedTotal - itemTotal) > 0.01) {
      throw new Error('Item total calculation mismatch');
    }
  }

  getSubtotal(): number {
    return this.basePrice * this.quantity;
  }
}
