/**
 * Product Domain Entity
 * Clean Architecture: No framework dependencies
 */

export class Product {
  constructor(
    public readonly id: string,
    public readonly sellerId: string,
    public sku: string,
    public name: string,
    public description: string,
    public basePrice: number,
    public gstSlabId: string,
    public stock: number,
    public isActive: boolean = true,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {
    if (basePrice < 0) {
      throw new Error('Base price cannot be negative');
    }
    if (stock < 0) {
      throw new Error('Stock cannot be negative');
    }
  }

  updatePrice(newPrice: number): void {
    if (newPrice < 0) {
      throw new Error('Price cannot be negative');
    }
    this.basePrice = newPrice;
    this.updatedAt = new Date();
  }

  addStock(quantity: number): void {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    this.stock += quantity;
    this.updatedAt = new Date();
  }

  reduceStock(quantity: number): void {
    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    if (this.stock < quantity) {
      throw new Error('Insufficient stock');
    }
    this.stock -= quantity;
    this.updatedAt = new Date();
  }

  deactivate(): void {
    this.isActive = false;
    this.updatedAt = new Date();
  }

  activate(): void {
    this.isActive = true;
    this.updatedAt = new Date();
  }
}

export class GSTSlab {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly percentage: number,
    public readonly isActive: boolean = true
  ) {
    const validPercentages = [0, 5, 12, 18, 28];
    if (!validPercentages.includes(percentage)) {
      throw new Error(`Invalid GST percentage. Must be one of: ${validPercentages.join(', ')}`);
    }
  }

  calculateTax(baseAmount: number): number {
    return (baseAmount * this.percentage) / 100;
  }

  calculateTotalWithTax(baseAmount: number): number {
    return baseAmount + this.calculateTax(baseAmount);
  }
}
