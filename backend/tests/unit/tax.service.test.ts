/**
 * Tax Service Tests
 * Per TESTING.md - Mandatory 100% coverage for business logic
 * Tests all 5 GST slabs (0%, 5%, 12%, 18%, 28%)
 */

import { TaxService } from '../src/services/tax.service';

describe('TaxService', () => {
  let taxService: TaxService;

  beforeEach(() => {
    taxService = new TaxService();
  });

  describe('calculateItemTax', () => {
    it('should calculate tax for 0% GST slab', () => {
      const result = taxService.calculateItemTax(100, 0, 1);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(0);
      expect(result.totalAmount).toBe(100);
      expect(result.gstPercentage).toBe(0);
    });

    it('should calculate tax for 5% GST slab', () => {
      const result = taxService.calculateItemTax(100, 5, 1);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(5);
      expect(result.totalAmount).toBe(105);
      expect(result.gstPercentage).toBe(5);
    });

    it('should calculate tax for 12% GST slab', () => {
      const result = taxService.calculateItemTax(100, 12, 1);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(12);
      expect(result.totalAmount).toBe(112);
      expect(result.gstPercentage).toBe(12);
    });

    it('should calculate tax for 18% GST slab', () => {
      const result = taxService.calculateItemTax(100, 18, 1);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(18);
      expect(result.totalAmount).toBe(118);
      expect(result.gstPercentage).toBe(18);
    });

    it('should calculate tax for 28% GST slab', () => {
      const result = taxService.calculateItemTax(100, 28, 1);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(28);
      expect(result.totalAmount).toBe(128);
      expect(result.gstPercentage).toBe(28);
    });

    it('should handle multiple quantities', () => {
      const result = taxService.calculateItemTax(100, 18, 3);
      
      expect(result.subtotal).toBe(300);
      expect(result.gstAmount).toBe(54);
      expect(result.totalAmount).toBe(354);
    });

    it('should handle decimal prices', () => {
      const result = taxService.calculateItemTax(99.99, 18, 2);
      
      expect(result.subtotal).toBe(199.98);
      expect(result.gstAmount).toBe(35.99); // Rounded
      expect(result.totalAmount).toBe(235.97);
    });

    it('should throw error for invalid GST percentage', () => {
      expect(() => {
        taxService.calculateItemTax(100, 10, 1); // Invalid: only 0,5,12,18,28 allowed
      }).toThrow('Invalid GST percentage');
    });

    it('should throw error for negative price', () => {
      expect(() => {
        taxService.calculateItemTax(-100, 18, 1);
      }).toThrow('Base price cannot be negative');
    });

    it('should throw error for zero quantity', () => {
      expect(() => {
        taxService.calculateItemTax(100, 18, 0);
      }).toThrow('Quantity must be positive');
    });

    it('should throw error for negative quantity', () => {
      expect(() => {
        taxService.calculateItemTax(100, 18, -1);
      }).toThrow('Quantity must be positive');
    });
  });

  describe('calculateCartTax', () => {
    it('should calculate tax for empty cart', () => {
      const result = taxService.calculateCartTax([]);
      
      expect(result.subtotal).toBe(0);
      expect(result.totalGst).toBe(0);
      expect(result.totalAmount).toBe(0);
      expect(result.gstBreakup).toEqual([]);
    });

    it('should calculate tax for single item cart', () => {
      const items = [
        { basePrice: 100, quantity: 1, gstPercentage: 18, subtotal: 100, gstAmount: 18, itemTotal: 118 },
      ];
      
      const result = taxService.calculateCartTax(items);
      
      expect(result.subtotal).toBe(100);
      expect(result.totalGst).toBe(18);
      expect(result.totalAmount).toBe(118);
      expect(result.gstBreakup).toHaveLength(1);
      expect(result.gstBreakup[0]).toEqual({
        slabPercentage: 18,
        taxableAmount: 100,
        gstAmount: 18,
      });
    });

    it('should calculate tax for mixed GST slabs cart', () => {
      const items = [
        { basePrice: 100, quantity: 1, gstPercentage: 5, subtotal: 100, gstAmount: 5, itemTotal: 105 },
        { basePrice: 200, quantity: 2, gstPercentage: 18, subtotal: 400, gstAmount: 72, itemTotal: 472 },
        { basePrice: 50, quantity: 3, gstPercentage: 28, subtotal: 150, gstAmount: 42, itemTotal: 192 },
      ];
      
      const result = taxService.calculateCartTax(items);
      
      expect(result.subtotal).toBe(650);
      expect(result.totalGst).toBe(119);
      expect(result.totalAmount).toBe(769);
      expect(result.gstBreakup).toHaveLength(3);
      
      // Verify breakup is sorted by percentage
      expect(result.gstBreakup[0].slabPercentage).toBe(5);
      expect(result.gstBreakup[1].slabPercentage).toBe(18);
      expect(result.gstBreakup[2].slabPercentage).toBe(28);
    });

    it('should aggregate items with same GST slab', () => {
      const items = [
        { basePrice: 100, quantity: 1, gstPercentage: 18, subtotal: 100, gstAmount: 18, itemTotal: 118 },
        { basePrice: 200, quantity: 1, gstPercentage: 18, subtotal: 200, gstAmount: 36, itemTotal: 236 },
      ];
      
      const result = taxService.calculateCartTax(items);
      
      expect(result.gstBreakup).toHaveLength(1);
      expect(result.gstBreakup[0]).toEqual({
        slabPercentage: 18,
        taxableAmount: 300,
        gstAmount: 54,
      });
    });
  });

  describe('calculateWithDiscount', () => {
    it('should apply discount before tax calculation', () => {
      const result = taxService.calculateWithDiscount(100, 18, 1, 10);
      
      expect(result.subtotal).toBe(90); // 10% discount
      expect(result.gstAmount).toBe(16.2);
      expect(result.totalAmount).toBe(106.2);
    });

    it('should handle 0% discount', () => {
      const result = taxService.calculateWithDiscount(100, 18, 1, 0);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(18);
      expect(result.totalAmount).toBe(118);
    });

    it('should handle 100% discount', () => {
      const result = taxService.calculateWithDiscount(100, 18, 1, 100);
      
      expect(result.subtotal).toBe(0);
      expect(result.gstAmount).toBe(0);
      expect(result.totalAmount).toBe(0);
    });

    it('should throw error for invalid discount percentage', () => {
      expect(() => {
        taxService.calculateWithDiscount(100, 18, 1, 101);
      }).toThrow('Discount percentage must be between 0 and 100');
      
      expect(() => {
        taxService.calculateWithDiscount(100, 18, 1, -5);
      }).toThrow('Discount percentage must be between 0 and 100');
    });
  });

  describe('reverseCalculate', () => {
    it('should reverse calculate base price from total', () => {
      const result = taxService.reverseCalculate(118, 18);
      
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(18);
      expect(result.totalAmount).toBe(118);
    });

    it('should work for all GST slabs', () => {
      const slabs = [
        { percentage: 0, total: 100, expectedBase: 100 },
        { percentage: 5, total: 105, expectedBase: 100 },
        { percentage: 12, total: 112, expectedBase: 100 },
        { percentage: 18, total: 118, expectedBase: 100 },
        { percentage: 28, total: 128, expectedBase: 100 },
      ];

      slabs.forEach(({ percentage, total, expectedBase }) => {
        const result = taxService.reverseCalculate(total, percentage);
        expect(result.subtotal).toBeCloseTo(expectedBase, 2);
      });
    });

    it('should throw error for invalid GST percentage', () => {
      expect(() => {
        taxService.reverseCalculate(118, 10);
      }).toThrow('Invalid GST percentage');
    });

    it('should throw error for negative total', () => {
      expect(() => {
        taxService.reverseCalculate(-100, 18);
      }).toThrow('Total amount cannot be negative');
    });
  });

  describe('validateTaxCalculation', () => {
    it('should validate correct tax calculation', () => {
      const isValid = taxService.validateTaxCalculation(100, 18, 1, 18, 118);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect GST amount', () => {
      const isValid = taxService.validateTaxCalculation(100, 18, 1, 20, 120);
      expect(isValid).toBe(false);
    });

    it('should reject incorrect total amount', () => {
      const isValid = taxService.validateTaxCalculation(100, 18, 1, 18, 120);
      expect(isValid).toBe(false);
    });

    it('should allow small rounding differences (< 0.01)', () => {
      const isValid = taxService.validateTaxCalculation(100, 18, 1, 18.001, 118.001);
      expect(isValid).toBe(true);
    });
  });
});
