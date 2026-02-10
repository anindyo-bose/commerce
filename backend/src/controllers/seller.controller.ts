import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RBACGuard } from '../guards/rbac.guard';
import { SellerRepository } from '../repositories/seller.repository';
import { OrderRepository } from '../repositories/order.repository';
import { ProductRepository } from '../repositories/product.repository';
import { Permissions } from '../decorators/permissions.decorator';

@Controller('api/v1/seller')
@UseGuards(JwtAuthGuard, RBACGuard)
export class SellerController {
  constructor(
    private sellerRepo: SellerRepository,
    private orderRepo: OrderRepository,
    private productRepo: ProductRepository
  ) {}

  /**
   * GET /api/v1/seller/dashboard
   * Get seller dashboard statistics
   */
  @Get('dashboard')
  @Permissions('seller:read')
  async getDashboard(@Req() req: any) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    const stats = await this.sellerRepo.getDashboardStats(seller.id);

    return {
      success: true,
      data: {
        sellerId: seller.id,
        businessName: seller.businessName,
        verificationStatus: seller.verificationStatus,
        stats,
      },
    };
  }

  /**
   * GET /api/v1/seller/products
   * Get seller's products
   */
  @Get('products')
  @Permissions('seller:read')
  async getProducts(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string
  ) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    const result = await this.productRepo.list({
      page: parseInt(page),
      limit: parseInt(limit),
      sellerId: seller.id,
      search,
    });

    return {
      success: true,
      data: {
        products: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * GET /api/v1/seller/orders
   * Get orders containing seller's products
   */
  @Get('orders')
  @Permissions('seller:read')
  async getOrders(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string
  ) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    const result = await this.orderRepo.listSellerOrders(seller.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    return {
      success: true,
      data: {
        orders: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * PUT /api/v1/seller/settings
   * Update seller settings
   */
  @Put('settings')
  @Permissions('seller:write')
  async updateSettings(
    @Req() req: any,
    @Body()
    body: {
      businessName?: string;
      businessType?: string;
      address?: string;
      pan?: string;
    }
  ) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    const updated = await this.sellerRepo.update(seller.id, body);

    return {
      success: true,
      message: 'Settings updated',
      data: {
        sellerId: updated.id,
        businessName: updated.businessName,
        businessType: updated.businessType,
      },
    };
  }

  /**
   * POST /api/v1/seller/gstin
   * Add GSTIN
   */
  @Post('gstin')
  @Permissions('seller:write')
  async addGSTIN(
    @Req() req: any,
    @Body() body: { gstin: string; isPrimary?: boolean }
  ) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    await this.sellerRepo.addGSTIN(seller.id, body.gstin, body.isPrimary);

    return {
      success: true,
      message: 'GSTIN added successfully',
    };
  }

  /**
   * GET /api/v1/seller/profile
   * Get seller profile
   */
  @Get('profile')
  @Permissions('seller:read')
  async getProfile(@Req() req: any) {
    const userId = req.user.id;

    const seller = await this.sellerRepo.findByUserId(userId);

    if (!seller) {
      return {
        success: false,
        error: 'Seller profile not found',
      };
    }

    return {
      success: true,
      data: seller,
    };
  }
}
