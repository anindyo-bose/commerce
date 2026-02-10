import { DataSource, Repository } from 'typeorm';
import { Seller, SellerGSTIN, SellerStatus } from '../entities/seller.entity';

export class SellerRepository {
  private sellerRepo: Repository<any>;
  private gstinRepo: Repository<any>;

  constructor(private dataSource: DataSource) {
    this.sellerRepo = dataSource.getRepository('sellers');
    this.gstinRepo = dataSource.getRepository('seller_gstins');
  }

  /**
   * Create new seller
   */
  async create(data: {
    userId: string;
    businessName: string;
    businessType: string;
    gstin?: string;
    pan?: string;
    address?: string;
  }): Promise<Seller> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create seller record
      const result = await queryRunner.manager.insert('sellers', {
        user_id: data.userId,
        business_name: data.businessName,
        business_type: data.businessType,
        pan: data.pan,
        business_address: data.address,
        verification_status: SellerStatus.PENDING_VERIFICATION,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const sellerId = result.identifiers[0].id;

      // Add GSTIN if provided
      if (data.gstin) {
        await queryRunner.manager.insert('seller_gstins', {
          seller_id: sellerId,
          gstin: data.gstin,
          is_primary: true,
          is_verified: false,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Assign SELLER role to user
      const sellerRole = await queryRunner.manager.findOne('roles', {
        where: { name: 'SELLER' },
      });

      await queryRunner.manager.insert('user_roles', {
        user_id: data.userId,
        role_id: sellerRole.id,
        assigned_at: new Date(),
      });

      await queryRunner.commitTransaction();

      return this.findById(sellerId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Find seller by ID
   */
  async findById(id: string): Promise<Seller | null> {
    const seller = await this.sellerRepo.findOne({
      where: { id },
      relations: ['gstins', 'bank_accounts'],
    });

    if (!seller) return null;

    return this.mapToEntity(seller);
  }

  /**
   * Find seller by user ID
   */
  async findByUserId(userId: string): Promise<Seller | null> {
    const seller = await this.sellerRepo.findOne({
      where: { user_id: userId },
      relations: ['gstins', 'bank_accounts'],
    });

    if (!seller) return null;

    return this.mapToEntity(seller);
  }

  /**
   * Update seller profile
   */
  async update(
    sellerId: string,
    data: Partial<{
      businessName: string;
      businessType: string;
      address: string;
      pan: string;
    }>
  ): Promise<Seller> {
    const updateData: any = { updated_at: new Date() };

    if (data.businessName) updateData.business_name = data.businessName;
    if (data.businessType) updateData.business_type = data.businessType;
    if (data.address) updateData.business_address = data.address;
    if (data.pan) updateData.pan = data.pan;

    await this.sellerRepo.update({ id: sellerId }, updateData);

    return this.findById(sellerId);
  }

  /**
   * Add GSTIN
   */
  async addGSTIN(sellerId: string, gstin: string, isPrimary: boolean = false): Promise<void> {
    // If setting as primary, unset current primary
    if (isPrimary) {
      await this.gstinRepo.update(
        { seller_id: sellerId, is_primary: true },
        { is_primary: false, updated_at: new Date() }
      );
    }

    await this.gstinRepo.insert({
      seller_id: sellerId,
      gstin,
      is_primary: isPrimary,
      is_verified: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Verify GSTIN
   */
  async verifyGSTIN(gstinId: string): Promise<void> {
    await this.gstinRepo.update(
      { id: gstinId },
      { is_verified: true, verified_at: new Date(), updated_at: new Date() }
    );
  }

  /**
   * Update seller verification status
   */
  async updateVerificationStatus(
    sellerId: string,
    status: SellerStatus,
    rejectionReason?: string
  ): Promise<Seller> {
    const updateData: any = {
      verification_status: status,
      updated_at: new Date(),
    };

    if (status === SellerStatus.VERIFIED) {
      updateData.verified_at = new Date();
    }

    if (status === SellerStatus.REJECTED && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    await this.sellerRepo.update({ id: sellerId }, updateData);

    return this.findById(sellerId);
  }

  /**
   * List sellers with filters
   */
  async list(params: {
    page: number;
    limit: number;
    verificationStatus?: SellerStatus;
    search?: string;
  }): Promise<{ items: Seller[]; total: number }> {
    const offset = (params.page - 1) * params.limit;

    let query = this.sellerRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.gstins', 'g')
      .skip(offset)
      .take(params.limit);

    if (params.verificationStatus) {
      query = query.where('s.verification_status = :status', { status: params.verificationStatus });
    }

    if (params.search) {
      query = query.andWhere('s.business_name ILIKE :search', {
        search: `%${params.search}%`,
      });
    }

    const [items, total] = await query.getManyAndCount();

    return {
      items: items.map(s => this.mapToEntity(s)),
      total,
    };
  }

  /**
   * Get seller dashboard stats
   */
  async getDashboardStats(sellerId: string): Promise<{
    totalProducts: number;
    activeProducts: number;
    totalOrders: number;
    totalRevenue: number;
    pendingOrders: number;
  }> {
    const stats = await this.dataSource.query(
      `
      SELECT
        (SELECT COUNT(*) FROM products WHERE seller_id = $1) as total_products,
        (SELECT COUNT(*) FROM products WHERE seller_id = $1 AND is_active = true) as active_products,
        (SELECT COUNT(DISTINCT o.id)
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN products p ON oi.product_id = p.id
         WHERE p.seller_id = $1) as total_orders,
        (SELECT COALESCE(SUM(oi.item_total), 0)
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         JOIN orders o ON oi.order_id = o.id
         WHERE p.seller_id = $1 AND o.payment_status = 'SUCCESS') as total_revenue,
        (SELECT COUNT(DISTINCT o.id)
         FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         JOIN products p ON oi.product_id = p.id
         WHERE p.seller_id = $1 AND o.order_status IN ('PENDING', 'CONFIRMED')) as pending_orders
      `,
      [sellerId]
    );

    return {
      totalProducts: parseInt(stats[0].total_products) || 0,
      activeProducts: parseInt(stats[0].active_products) || 0,
      totalOrders: parseInt(stats[0].total_orders) || 0,
      totalRevenue: parseFloat(stats[0].total_revenue) || 0,
      pendingOrders: parseInt(stats[0].pending_orders) || 0,
    };
  }

  /**
   * Deactivate seller
   */
  async deactivate(sellerId: string): Promise<void> {
    await this.sellerRepo.update(
      { id: sellerId },
      { is_active: false, updated_at: new Date() }
    );
  }

  /**
   * Map database row to entity
   */
  private mapToEntity(row: any): Seller {
    const seller = new Seller(
      row.id,
      row.user_id,
      row.business_name,
      row.business_type,
      row.verification_status
    );

    if (row.gstins && row.gstins.length > 0) {
      seller.gstins = row.gstins.map(
        (g: any) =>
          new SellerGSTIN(g.id, g.seller_id, g.gstin, g.is_primary, g.is_verified)
      );
    }

    seller.pan = row.pan;
    seller.businessAddress = row.business_address;
    seller.isActive = row.is_active;
    seller.verifiedAt = row.verified_at;
    seller.createdAt = row.created_at;
    seller.updatedAt = row.updated_at;

    return seller;
  }
}
