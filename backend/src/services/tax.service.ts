/**
 * Tax Calculation Service
 * Implements GST calculation with all 5 slabs
 * Per ARCHITECTURE.md - Mandatory 100% test coverage
 */

export interface TaxCalculationResult {
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  gstPercentage: number;
}

export interface CartTaxBreakup {
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  gstBreakup: Array<{
    slabPercentage: number;
    taxableAmount: number;
    gstAmount: number;
  }>;
}

export interface OrderItemTax {
  basePrice: number;
  quantity: number;
  gstPercentage: number;
  subtotal: number;
  gstAmount: number;
  itemTotal: number;
}

export class TaxService {
  /**
   * Calculate tax for a single item
   * @param basePrice - Price before tax
   * @param gstPercentage - GST percentage (0, 5, 12, 18, 28)
   * @param quantity - Item quantity
   */
  calculateItemTax(
    basePrice: number,
    gstPercentage: number,
    quantity: number = 1
  ): TaxCalculationResult {
    // Validate GST percentage
    const validPercentages = [0, 5, 12, 18, 28];
    if (!validPercentages.includes(gstPercentage)) {
      throw new Error(`Invalid GST percentage: ${gstPercentage}. Must be one of: ${validPercentages.join(', ')}`);
    }

    if (basePrice < 0) {
      throw new Error('Base price cannot be negative');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    const subtotal = this.roundToTwoDecimals(basePrice * quantity);
    const gstAmount = this.roundToTwoDecimals((subtotal * gstPercentage) / 100);
    const totalAmount = this.roundToTwoDecimals(subtotal + gstAmount);

    return {
      subtotal,
      gstAmount,
      totalAmount,
      gstPercentage,
    };
  }

  /**
   * Calculate tax for entire cart
   * Groups items by GST slab and provides breakup
   */
  calculateCartTax(items: OrderItemTax[]): CartTaxBreakup {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        totalGst: 0,
        totalAmount: 0,
        gstBreakup: [],
      };
    }

    let subtotal = 0;
    let totalGst = 0;

    // Group by GST slab
    const slabMap = new Map<number, { taxableAmount: number; gstAmount: number }>();

    for (const item of items) {
      const itemSubtotal = this.roundToTwoDecimals(item.basePrice * item.quantity);
      const itemGst = this.roundToTwoDecimals((itemSubtotal * item.gstPercentage) / 100);

      subtotal += itemSubtotal;
      totalGst += itemGst;

      // Aggregate by slab
      const existing = slabMap.get(item.gstPercentage) || { taxableAmount: 0, gstAmount: 0 };
      slabMap.set(item.gstPercentage, {
        taxableAmount: this.roundToTwoDecimals(existing.taxableAmount + itemSubtotal),
        gstAmount: this.roundToTwoDecimals(existing.gstAmount + itemGst),
      });
    }

    // Convert map to array
    const gstBreakup = Array.from(slabMap.entries())
      .map(([slabPercentage, data]) => ({
        slabPercentage,
        ...data,
      }))
      .sort((a, b) => a.slabPercentage - b.slabPercentage);

    return {
      subtotal: this.roundToTwoDecimals(subtotal),
      totalGst: this.roundToTwoDecimals(totalGst),
      totalAmount: this.roundToTwoDecimals(subtotal + totalGst),
      gstBreakup,
    };
  }

  /**
   * Calculate tax with discount applied
   * Discount is applied before tax calculation
   */
  calculateWithDiscount(
    basePrice: number,
    gstPercentage: number,
    quantity: number,
    discountPercentage: number = 0
  ): TaxCalculationResult {
    if (discountPercentage < 0 || discountPercentage > 100) {
      throw new Error('Discount percentage must be between 0 and 100');
    }

    const discountedPrice = this.roundToTwoDecimals(
      basePrice * (1 - discountPercentage / 100)
    );

    return this.calculateItemTax(discountedPrice, gstPercentage, quantity);
  }

  /**
   * Reverse calculate base price from total (including tax)
   * Useful for invoice reconciliation
   */
  reverseCalculate(totalAmount: number, gstPercentage: number): TaxCalculationResult {
    const validPercentages = [0, 5, 12, 18, 28];
    if (!validPercentages.includes(gstPercentage)) {
      throw new Error(`Invalid GST percentage: ${gstPercentage}`);
    }

    if (totalAmount < 0) {
      throw new Error('Total amount cannot be negative');
    }

    // Formula: basePrice = totalAmount / (1 + gstRate)
    const subtotal = this.roundToTwoDecimals(totalAmount / (1 + gstPercentage / 100));
    const gstAmount = this.roundToTwoDecimals(totalAmount - subtotal);

    return {
      subtotal,
      gstAmount,
      totalAmount: this.roundToTwoDecimals(totalAmount),
      gstPercentage,
    };
  }

  /**
   * Validate tax calculation matches expected values
   * Used in order processing to prevent tampering
   */
  validateTaxCalculation(
    basePrice: number,
    gstPercentage: number,
    quantity: number,
    providedGstAmount: number,
    providedTotal: number
  ): boolean {
    const calculated = this.calculateItemTax(basePrice, gstPercentage, quantity);
    
    const gstMatch = Math.abs(calculated.gstAmount - providedGstAmount) < 0.01;
    const totalMatch = Math.abs(calculated.totalAmount - providedTotal) < 0.01;

    return gstMatch && totalMatch;
  }

  /**
   * Helper: Round to 2 decimal places (money precision)
   */
  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
