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
} from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RBACGuard } from '../guards/rbac.guard';
import { UserRepository } from '../repositories/user.repository';
import { SellerRepository } from '../repositories/seller.repository';
import { AuditRepository } from '../repositories/audit.repository';
import { ImpersonationRepository } from '../repositories/impersonation.repository';
import { AuthService } from '../services/auth.service';
import { Permissions } from '../decorators/permissions.decorator';

@Controller('api/v1/admin')
@UseGuards(JwtAuthGuard, RBACGuard)
export class AdminController {
  constructor(
    private userRepo: UserRepository,
    private sellerRepo: SellerRepository,
    private auditRepo: AuditRepository,
    private impersonationRepo: ImpersonationRepository,
    private authService: AuthService
  ) {}

  /**
   * GET /api/v1/admin/users
   * List all users
   */
  @Get('users')
  @Permissions('admin:users:list')
  async listUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
    @Query('role') roleId?: string
  ) {
    const result = await this.userRepo.list({
      page: parseInt(page),
      limit: parseInt(limit),
      search,
      roleId,
    });

    return {
      success: true,
      data: {
        users: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * PATCH /api/v1/admin/users/:id/status
   * Activate/deactivate user
   */
  @Patch('users/:id/status')
  @Permissions('admin:users:manage')
  async updateUserStatus(
    @Param('id') userId: string,
    @Body() body: { isActive: boolean },
    @Req() req: any
  ) {
    // Log action
    await this.auditRepo.log({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'USER_STATUS_UPDATE',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { isActive: body.isActive },
    });

    // Update user (implement in UserRepository)
    // await this.userRepo.updateStatus(userId, body.isActive);

    return {
      success: true,
      message: `User ${body.isActive ? 'activated' : 'deactivated'}`,
    };
  }

  /**
   * GET /api/v1/admin/sellers
   * List sellers with filters
   */
  @Get('sellers')
  @Permissions('admin:sellers:list')
  async listSellers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') verificationStatus?: string
  ) {
    const result = await this.sellerRepo.list({
      page: parseInt(page),
      limit: parseInt(limit),
      verificationStatus: verificationStatus as any,
    });

    return {
      success: true,
      data: {
        sellers: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * PATCH /api/v1/admin/sellers/:id/verification
   * Approve/reject seller verification
   */
  @Patch('sellers/:id/verification')
  @Permissions('admin:sellers:manage')
  async updateSellerVerification(
    @Param('id') sellerId: string,
    @Body() body: { status: string; rejectionReason?: string },
    @Req() req: any
  ) {
    await this.auditRepo.log({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'SELLER_VERIFICATION_UPDATE',
      resourceType: 'seller',
      resourceId: sellerId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { status: body.status, rejectionReason: body.rejectionReason },
    });

    const seller = await this.sellerRepo.updateVerificationStatus(
      sellerId,
      body.status as any,
      body.rejectionReason
    );

    return {
      success: true,
      message: 'Seller verification status updated',
      data: {
        sellerId: seller.id,
        verificationStatus: seller.verificationStatus,
      },
    };
  }

  /**
   * GET /api/v1/admin/audit-logs
   * Query audit logs
   */
  @Get('audit-logs')
  @Permissions('admin:audit:read')
  async getAuditLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const result = await this.auditRepo.query({
      page: parseInt(page),
      limit: parseInt(limit),
      actorId,
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    return {
      success: true,
      data: {
        logs: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }

  /**
   * POST /api/v1/admin/impersonate
   * Start user impersonation
   */
  @Post('impersonate')
  @Permissions('admin:impersonate')
  async startImpersonation(
    @Req() req: any,
    @Body()
    body: {
      targetUserId: string;
      reason: string;
      durationMinutes: number;
    }
  ) {
    const impersonatorId = req.user.id;

    // Start impersonation session
    const sessionId = await this.impersonationRepo.startSession({
      impersonatorId,
      targetUserId: body.targetUserId,
      reason: body.reason,
      durationMinutes: body.durationMinutes,
    });

    // Log action
    await this.auditRepo.log({
      actorId: body.targetUserId,
      actorEmail: req.user.email,
      action: 'IMPERSONATION_START',
      resourceType: 'user',
      resourceId: body.targetUserId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      isImpersonated: true,
      impersonatorId,
      metadata: { sessionId, reason: body.reason },
    });

    // Generate impersonation token
    const targetUser = await this.userRepo.findById(body.targetUserId);
    const permissions = await this.userRepo.getPermissions(body.targetUserId);

    const token = await this.authService.generateImpersonationToken(
      targetUser,
      permissions,
      sessionId,
      impersonatorId
    );

    return {
      success: true,
      message: 'Impersonation session started',
      data: {
        sessionId,
        token,
        expiresIn: body.durationMinutes * 60,
      },
    };
  }

  /**
   * POST /api/v1/admin/impersonate/end
   * End impersonation session
   */
  @Post('impersonate/end')
  @Permissions('admin:impersonate')
  async endImpersonation(@Req() req: any) {
    const sessionId = req.user.impersonationSessionId;

    if (!sessionId) {
      return {
        success: false,
        error: 'Not in impersonation session',
      };
    }

    await this.impersonationRepo.endSession(sessionId);

    await this.auditRepo.log({
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'IMPERSONATION_END',
      resourceType: 'user',
      resourceId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      isImpersonated: true,
      impersonatorId: req.user.impersonatorId,
      metadata: { sessionId },
    });

    return {
      success: true,
      message: 'Impersonation session ended',
    };
  }

  /**
   * GET /api/v1/admin/impersonation-logs
   * Get impersonation session logs
   */
  @Get('impersonation-logs')
  @Permissions('admin:audit:read')
  async getImpersonationLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('impersonatorId') impersonatorId?: string,
    @Query('targetUserId') targetUserId?: string
  ) {
    const result = await this.impersonationRepo.listSessions({
      page: parseInt(page),
      limit: parseInt(limit),
      impersonatorId,
      targetUserId,
    });

    return {
      success: true,
      data: {
        sessions: result.items,
        total: result.total,
        page: parseInt(page),
        limit: parseInt(limit),
      },
    };
  }
}
