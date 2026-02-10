/**
 * Seller Domain Entity
 * Clean Architecture: No framework dependencies
 */

export enum SellerStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
}

export class Seller {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public businessName: string,
    public businessType: string,
    public status: SellerStatus,
    public isActive: boolean = true,
    public createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  verify(): void {
    if (this.status !== SellerStatus.PENDING_VERIFICATION) {
      throw new Error('Only pending sellers can be verified');
    }
    this.status = SellerStatus.VERIFIED;
    this.updatedAt = new Date();
  }

  reject(): void {
    if (this.status !== SellerStatus.PENDING_VERIFICATION) {
      throw new Error('Only pending sellers can be rejected');
    }
    this.status = SellerStatus.REJECTED;
    this.isActive = false;
    this.updatedAt = new Date();
  }

  suspend(): void {
    if (this.status !== SellerStatus.VERIFIED) {
      throw new Error('Only verified sellers can be suspended');
    }
    this.status = SellerStatus.SUSPENDED;
    this.isActive = false;
    this.updatedAt = new Date();
  }

  reactivate(): void {
    if (this.status !== SellerStatus.SUSPENDED) {
      throw new Error('Only suspended sellers can be reactivated');
    }
    this.status = SellerStatus.VERIFIED;
    this.isActive = true;
    this.updatedAt = new Date();
  }

  updateBusinessInfo(businessName: string, businessType: string): void {
    this.businessName = businessName;
    this.businessType = businessType;
    this.updatedAt = new Date();
  }
}

export class SellerGSTIN {
  constructor(
    public readonly sellerId: string,
    public gstinEncrypted: string,
    public gstinIv: string,
    public isPrimary: boolean = true
  ) {}
}
