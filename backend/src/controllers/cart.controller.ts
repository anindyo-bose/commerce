import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RBACGuard } from '../guards/rbac.guard';
import { CartRepository } from '../repositories/cart.repository';
import { Permissions } from '../decorators/permissions.decorator';

@Controller('api/v1/cart')
@UseGuards(JwtAuthGuard, RBACGuard)
export class CartController {
  constructor(private cartRepo: CartRepository) {}

  /**
   * GET /api/v1/cart
   * Get user's cart with summary
   */
  @Get()
  @Permissions('cart:read')
  async getCart(@Req() req: any) {
    const userId = req.user.id;
    const summary = await this.cartRepo.getCartSummary(userId);

    return {
      success: true,
      data: {
        items: summary.cart.items,
        subtotal: summary.subtotal,
        totalGst: summary.totalGst,
        totalAmount: summary.totalAmount,
        itemCount: summary.itemCount,
        gstBreakup: summary.gstBreakup,
      },
    };
  }

  /**
   * POST /api/v1/cart/items
   * Add item to cart
   */
  @Post('items')
  @Permissions('cart:write')
  async addItem(
    @Req() req: any,
    @Body() body: { productId: string; quantity: number }
  ) {
    const userId = req.user.id;

    await this.cartRepo.addItem(userId, body.productId, body.quantity);

    const summary = await this.cartRepo.getCartSummary(userId);

    return {
      success: true,
      message: 'Item added to cart',
      data: {
        itemCount: summary.itemCount,
        totalAmount: summary.totalAmount,
      },
    };
  }

  /**
   * PUT /api/v1/cart/items/:itemId
   * Update item quantity
   */
  @Put('items/:itemId')
  @Permissions('cart:write')
  async updateItemQuantity(
    @Req() req: any,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number }
  ) {
    const userId = req.user.id;

    await this.cartRepo.updateItemQuantity(userId, itemId, body.quantity);

    const summary = await this.cartRepo.getCartSummary(userId);

    return {
      success: true,
      message: 'Cart updated',
      data: {
        itemCount: summary.itemCount,
        totalAmount: summary.totalAmount,
      },
    };
  }

  /**
   * DELETE /api/v1/cart/items/:itemId
   * Remove item from cart
   */
  @Delete('items/:itemId')
  @Permissions('cart:write')
  async removeItem(@Req() req: any, @Param('itemId') itemId: string) {
    const userId = req.user.id;

    await this.cartRepo.removeItem(userId, itemId);

    const summary = await this.cartRepo.getCartSummary(userId);

    return {
      success: true,
      message: 'Item removed from cart',
      data: {
        itemCount: summary.itemCount,
        totalAmount: summary.totalAmount,
      },
    };
  }

  /**
   * POST /api/v1/cart/validate
   * Validate cart stock before checkout
   */
  @Post('validate')
  @Permissions('cart:read')
  async validateCart(@Req() req: any) {
    const userId = req.user.id;

    const validation = await this.cartRepo.validateCartStock(userId);

    return {
      success: validation.valid,
      data: {
        valid: validation.valid,
        errors: validation.errors,
      },
    };
  }

  /**
   * DELETE /api/v1/cart
   * Clear cart
   */
  @Delete()
  @Permissions('cart:write')
  async clearCart(@Req() req: any) {
    const userId = req.user.id;

    await this.cartRepo.clearCart(userId);

    return {
      success: true,
      message: 'Cart cleared',
    };
  }
}
