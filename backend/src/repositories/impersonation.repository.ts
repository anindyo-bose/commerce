import { DataSource, Repository } from 'typeorm';

export class ImpersonationRepository {
  private sessionRepo: Repository<any>;

  constructor(private dataSource: DataSource) {
    this.sessionRepo = dataSource.getRepository('impersonation_sessions');
  }

  /**
   * Start impersonation session
   */
  async startSession(data: {
    impersonatorId: string;
    targetUserId: string;
    reason: string;
    durationMinutes: number;
  }): Promise<string> {
    const expiresAt = new Date(Date.now() + data.durationMinutes * 60 * 1000);

    const result = await this.sessionRepo.insert({
      impersonator_id: data.impersonatorId,
      target_user_id: data.targetUserId,
      reason: data.reason,
      started_at: new Date(),
      expires_at: expiresAt,
      is_active: true,
    });

    return result.identifiers[0].id;
  }

  /**
   * End impersonation session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.sessionRepo.update(
      { id: sessionId },
      { is_active: false, ended_at: new Date() }
    );
  }

  /**
   * Get active session
   */
  async getActiveSession(sessionId: string): Promise<any | null> {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, is_active: true },
    });

    if (!session) return null;

    // Check expiration
    if (new Date() > new Date(session.expires_at)) {
      await this.endSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get user's active impersonation session (if being impersonated)
   */
  async getUserActiveSession(targetUserId: string): Promise<any | null> {
    const session = await this.sessionRepo.findOne({
      where: { target_user_id: targetUserId, is_active: true },
      order: { started_at: 'DESC' },
    });

    if (!session) return null;

    // Check expiration
    if (new Date() > new Date(session.expires_at)) {
      await this.endSession(session.id);
      return null;
    }

    return session;
  }

  /**
   * List impersonation sessions
   */
  async listSessions(params: {
    page: number;
    limit: number;
    impersonatorId?: string;
    targetUserId?: string;
    isActive?: boolean;
  }): Promise<{ items: any[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.sessionRepo.createQueryBuilder('s').skip(offset).take(params.limit);

    if (params.impersonatorId) {
      query = query.where('s.impersonator_id = :impersonatorId', {
        impersonatorId: params.impersonatorId,
      });
    }

    if (params.targetUserId) {
      query = query.andWhere('s.target_user_id = :targetUserId', {
        targetUserId: params.targetUserId,
      });
    }

    if (params.isActive !== undefined) {
      query = query.andWhere('s.is_active = :isActive', { isActive: params.isActive });
    }

    query = query.orderBy('s.started_at', 'DESC');

    const [items, total] = await query.getManyAndCount();

    return { items, total };
  }

  /**
   * Auto-expire old sessions (cron job)
   */
  async expireSessions(): Promise<number> {
    const result = await this.sessionRepo.update(
      {
        is_active: true,
        expires_at: { $lt: new Date() } as any,
      },
      { is_active: false, ended_at: new Date() }
    );

    return result.affected || 0;
  }
}
