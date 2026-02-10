/**
 * Product Controller
 * Handles product management endpoints
 * Per API_CONTRACTS.md - /api/v1/products
 */

import { Response } from 'express';
import { AuthenticatedRequest } from '../guards/rbac.guard';
import { TaxService } from '../services/tax.service';
import { ErrorFactory } from '../middleware/error-handler.middleware';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductFilterInput,
} from '../utils/validation.schemas';

export class ProductController {
  constructor(private readonly taxService: TaxService) {}

  /**
   * GET /api/v1/products
   * List products with filters
   */
  async listProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const filters: ProductFilterInput = req.query as any;

    // TODO: Fetch products from repository
    // const products = await productRepository.findAll(filters);
    // const total = await productRepository.count(filters);

    // Mock response
    const mockProducts = [
      {
        id: 'prod-1',
        sellerId: 'seller-1',
        sku: 'LAPTOP-001',
        name: 'Gaming Laptop',
        description: 'High-performance gaming laptop',
        basePrice: 80000,
        gstPercentage: 18,
        stock: 10,
        isActive: true,
      },
    ];

    // Calculate tax for each product
    const productsWithTax = mockProducts.map((product) => {
      const taxCalc = this.taxService.calculateItemTax(product.basePrice, product.gstPercentage, 1);
      
      return {
        ...product,
        gstAmount: taxCalc.gstAmount,
        totalPrice: taxCalc.totalAmount,
      };
    });

    res.json({
      success: true,
      data: {
        products: productsWithTax,
        pagination: {
          page: filters.page || 1,
          limit: filters.limit || 20,
          total: 1,
          pages: 1,
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      links: {
        self: '/api/v1/products',
        next: null,
        prev: null,
      },
    });
  }

  /**
   * GET /api/v1/products/:id
   * Get product details
   */
  async getProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { id } = req.params;

    // TODO: Fetch product from repository
    // const product = await productRepository.findById(id);
    // if (!product) throw ErrorFactory.notFound('Product');

    const mockProduct = {
      id,
      sellerId: 'seller-1',
      sku: 'LAPTOP-001',
      name: 'Gaming Laptop',
      description: 'High-performance gaming laptop with RTX 4090',
      basePrice: 80000,
      gstPercentage: 18,
      stock: 10,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const taxCalc = this.taxService.calculateItemTax(mockProduct.basePrice, mockProduct.gstPercentage, 1);

    res.json({
      success: true,
      data: {
        product: {
          ...mockProduct,
          gstAmount: taxCalc.gstAmount,
          totalPrice: taxCalc.totalAmount,
          taxBreakup: {
            basePrice: mockProduct.basePrice,
            gstPercentage: mockProduct.gstPercentage,
            gstAmount: taxCalc.gstAmount,
            totalPrice: taxCalc.totalAmount,
          },
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      links: {
        self: `/api/v1/products/${id}`,
      },
    });
  }

  /**
   * POST /api/v1/products
   * Create new product (Seller only)
   */
  async createProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      throw ErrorFactory.unauthorized();
    }

    const input: CreateProductInput = req.body;

    // Seller ID comes from authenticated user
    const sellerId = req.user.userId;

    // TODO: Verify GST slab exists
    // const gstSlab = await gstSlabRepository.findById(input.gstSlabId);
    // if (!gstSlab) throw ErrorFactory.notFound('GST Slab');

    // TODO: Create product via repository
    // const product = await productRepository.create({
    //   sellerId,
    //   ...input,
    // });

    const mockProduct = {
      id: 'prod-new',
      sellerId,
      ...input,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    res.status(201).json({
      success: true,
      data: {
        product: mockProduct,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      links: {
        self: `/api/v1/products/${mockProduct.id}`,
      },
    });
  }

  /**
   * PUT /api/v1/products/:id
   * Update product (Seller only - own products)
   */
  async updateProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      throw ErrorFactory.unauthorized();
    }

    const { id } = req.params;
    const input: UpdateProductInput = req.body;

    // TODO: Fetch product and verify ownership
    // const product = await productRepository.findById(id);
    // if (!product) throw ErrorFactory.notFound('Product');
    
    // if (product.sellerId !== req.user.userId && req.user.role !== 'ADMIN') {
    //   throw ErrorFactory.forbidden('Cannot update another seller\'s product');
    // }

    // TODO: Update product
    // const updated = await productRepository.update(id, input);

    res.json({
      success: true,
      data: {
        product: {
          id,
          ...input,
          updatedAt: new Date().toISOString(),
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
      links: {
        self: `/api/v1/products/${id}`,
      },
    });
  }

  /**
   * DELETE /api/v1/products/:id
   * Deactivate product (soft delete)
   */
  async deleteProduct(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      throw ErrorFactory.unauthorized();
    }

    const { id } = req.params;

    // TODO: Fetch product and verify ownership
    // const product = await productRepository.findById(id);
    // if (!product) throw ErrorFactory.notFound('Product');
    
    // if (product.sellerId !== req.user.userId && req.user.role !== 'ADMIN') {
    //   throw ErrorFactory.forbidden();
    // }

    // TODO: Soft delete (deactivate)
    // await productRepository.deactivate(id);

    res.json({
      success: true,
      data: {
        message: 'Product deactivated successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  }
}
