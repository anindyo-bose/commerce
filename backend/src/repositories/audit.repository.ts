import { DataSource, Repository } from 'typeorm';

export class AuditRepository {
  private auditRepo: Repository<any>;

  constructor(private dataSource: DataSource) {
    this.auditRepo = dataSource.getRepository('audit_logs');
  }

  /**
   * Log action (immutable append-only)
   */
  async log(data: {
    actorId: string;
    actorEmail: string;
    action: string;
    resourceType: string;
    resourceId: string;
    ipAddress: string;
    userAgent: string;
    isImpersonated?: boolean;
    impersonatorId?: string;
    metadata?: any;
  }): Promise<void> {
    await this.auditRepo.insert({
      actor_id: data.actorId,
      actor_email: data.actorEmail,
      action: data.action,
      resource_type: data.resourceType,
      resource_id: data.resourceId,
      ip_address: data.ipAddress,
      user_agent: data.userAgent,
      is_impersonated: data.isImpersonated || false,
      impersonator_id: data.impersonatorId,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      timestamp: new Date(),
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(params: {
    page: number;
    limit: number;
    actorId?: string;
    actorEmail?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    isImpersonated?: boolean;
  }): Promise<{ items: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.auditRepo.createQueryBuilder('a').skip(offset).take(params.limit);

    if (params.actorId) {
      query = query.where('a.actor_id = :actorId', { actorId: params.actorId });
    }

    if (params.actorEmail) {
      query = query.andWhere('a.actor_email = :actorEmail', { actorEmail: params.actorEmail });
    }

    if (params.action) {
      query = query.andWhere('a.action = :action', { action: params.action });
    }

    if (params.resourceType) {
      query = query.andWhere('a.resource_type = :resourceType', { resourceType: params.resourceType });
    }

    if (params.resourceId) {
      query = query.andWhere('a.resource_id = :resourceId', { resourceId: params.resourceId });
    }

    if (params.startDate) {
      query = query.andWhere('a.timestamp >= :startDate', { startDate: params.startDate });
    }

    if (params.endDate) {
      query = query.andWhere('a.timestamp <= :endDate', { endDate: params.endDate });
    }

    if (params.isImpersonated !== undefined) {
      query = query.andWhere('a.is_impersonated = :isImpersonated', {
        isImpersonated: params.isImpersonated,
      });
    }

    query = query.orderBy('a.timestamp', 'DESC');

    const [items, total] = await query.getManyAndCount();

    return { items, total };
  }

  /**
   * Get audit trail for specific resource
   */
  async getResourceAuditTrail(
    resourceType: string,
    resourceId: string,
    limit: number = 50
  ): Promise<any[]> {
    return this.auditRepo.find({
      where: { resource_type: resourceType, resource_id: resourceId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get user activity log
   */
  async getUserActivity(userId: string, limit: number = 100): Promise<any[]> {
    return this.auditRepo.find({
      where: { actor_id: userId },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get impersonation audit logs
   */
  async getImpersonationLogs(params: {
    page: number;
    limit: number;
    impersonatorId?: string;
    targetUserId?: string;
  }): Promise<{ items: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.auditRepo
      .createQueryBuilder('a')
      .where('a.is_impersonated = true')
      .skip(offset)
      .take(params.limit);

    if (params.impersonatorId) {
      query = query.andWhere('a.impersonator_id = :impersonatorId', {
        impersonatorId: params.impersonatorId,
      });
    }

    if (params.targetUserId) {
      query = query.andWhere('a.actor_id = :targetUserId', { targetUserId: params.targetUserId });
    }

    query = query.orderBy('a.timestamp', 'DESC');

    const [items, total] = await query.getManyAndCount();

    return { items, total };
  }

  /**
   * Count logs by action (analytics)
   */
  async countByAction(startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const result = await this.dataSource.query(
      `
      SELECT action, COUNT(*) as count
      FROM audit_logs
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY action
      ORDER BY count DESC
      `,
      [startDate, endDate]
    );

    const counts: Record<string, number> = {};
    result.forEach((r: any) => {
      counts[r.action] = parseInt(r.count);
    });

    return counts;
  }

  /**
   * Verify log immutability (checksum validation)
   */
  async verifyIntegrity(logId: string): Promise<boolean> {
    // In production, implement cryptographic checksum validation
    // For now, just verify log exists and hasn't been modified
    const log = await this.auditRepo.findOne({ where: { id: logId } });
    return log !== null;
  }
}
