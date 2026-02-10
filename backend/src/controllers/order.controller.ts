import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RBACGuard } from '../guards/rbac.guard';
import { OrderRepository } from '../repositories/order.repository';
import { Permissions } from '../decorators/permissions.decorator';
import { Response } from 'express';

@Controller('api/v1/orders')
@UseGuards(JwtAuthGuard, RBACGuard)
export class OrderController {
  constructor(private orderRepo: OrderRepository) {}

  /**
   * POST /api/v1/orders
   * Create order from cart (checkout)
   */
  @Post()
  @Permissions('order:write')
  async createOrder(
    @Req() req: any,
    @Body() body: { shippingAddress: any }
  ) {
    const userId = req.user.id;

    const order = await this.orderRepo.createFromCart(
      userId,
      body.shippingAddress
    );

    return {
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      },
    };
  }

  /**
   * GET /api/v1/orders
   * Get user's order history
   */
  @Get()
  @Permissions('order:read')
  async listOrders(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string
  ) {
    const userId = req.user.id;

    const result = await this.orderRepo.listUserOrders(userId, {
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
   * GET /api/v1/orders/:id
   * Get order detail
   */
  @Get(':id')
  @Permissions('order:read')
  async getOrder(@Req() req: any, @Param('id') orderId: string) {
    const userId = req.user.id;

    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      return {
        success: false,
        error: 'Order not found',
      };
    }

    // Verify ownership
    if (order.userId !== userId) {
      return {
        success: false,
        error: 'Access denied',
      };
    }

    return {
      success: true,
      data: order,
    };
  }

  /**
   * GET /api/v1/orders/:id/invoice
   * Download invoice PDF
   */
  @Get(':id/invoice')
  @Permissions('order:read')
  async downloadInvoice(
    @Req() req: any,
    @Param('id') orderId: string,
    @Res() res: Response
  ) {
    const userId = req.user.id;

    const order = await this.orderRepo.findById(orderId);

    if (!order || order.userId !== userId) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    // TODO: Integrate with PDF generation service
    // For now, return JSON
    res.json({
      success: true,
      message: 'Invoice generation not yet implemented',
      data: order,
    });
  }

  /**
   * PATCH /api/v1/orders/:id/status
   * Update order status (seller/admin only)
   */
  @Patch(':id/status')
  @Permissions('order:manage')
  async updateOrderStatus(
    @Param('id') orderId: string,
    @Body() body: { status: string }
  ) {
    const order = await this.orderRepo.updateOrderStatus(orderId, body.status);

    return {
      success: true,
      message: 'Order status updated',
      data: {
        orderId: order.id,
        orderStatus: order.orderStatus,
      },
    };
  }

  /**
   * GET /api/v1/orders/stats
   * Get user order statistics
   */
  @Get('stats/summary')
  @Permissions('order:read')
  async getOrderStats(@Req() req: any) {
    const userId = req.user.id;

    const stats = await this.orderRepo.getOrderStats(userId);

    return {
      success: true,
      data: stats,
    };
  }
}
