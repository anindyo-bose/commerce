/**
 * Shopping Cart Domain Entity
 * Clean Architecture: No framework dependencies
 */

export class ShoppingCart {
  constructor(
    public readonly id: string,
    public readonly userId: string | null, // null for guest carts
    public readonly sessionId: string | null, // for guest users
    public isActive: boolean = true,
    public expiresAt: Date | null = null,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (!userId && !sessionId) {
      throw new Error('Cart must have either userId or sessionId');
    }
  }

  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  extendExpiry(days: number = 7): void {
    this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    this.updatedAt = new Date();
  }
}

export class CartItem {
  constructor(
    public readonly id: string,
    public readonly cartId: string,
    public readonly productId: string,
    public quantity: number,
    public basePrice: number, // Snapshot at time of add
    public gstPercentage: number, // Snapshot at time of add
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    if (basePrice < 0) {
      throw new Error('Price cannot be negative');
    }
  }

  updateQuantity(newQuantity: number): void {
    if (newQuantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    this.quantity = newQuantity;
    this.updatedAt = new Date();
  }

  getSubtotal(): number {
    return this.basePrice * this.quantity;
  }

  getGstAmount(): number {
    return (this.getSubtotal() * this.gstPercentage) / 100;
  }

  getTotal(): number {
    return this.getSubtotal() + this.getGstAmount();
  }
}
