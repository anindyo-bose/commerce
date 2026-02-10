/**
 * Validation Schemas
 * Input validation using Zod
 * Per SECURITY.md - All API inputs must be validated
 */

import { z } from 'zod';

// Common validators
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long');

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain uppercase letter')
  .regex(/[a-z]/, 'Password must contain lowercase letter')
  .regex(/[0-9]/, 'Password must contain number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'Password must contain special character');

export const uuidSchema = z.string().uuid('Invalid UUID format');

// Auth schemas
export const registerSchema = z.object({
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

export const impersonateSchema = z.object({
  targetUserId: uuidSchema,
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(500),
  durationMinutes: z.number().min(1).max(240).default(60),
});

// Product schemas
export const createProductSchema = z.object({
  sku: z.string().min(1, 'SKU required').max(50),
  name: z.string().min(1, 'Product name required').max(200),
  description: z.string().min(1, 'Description required').max(2000),
  basePrice: z.number().positive('Price must be positive').max(10000000),
  gstSlabId: uuidSchema,
  stock: z.number().int().min(0, 'Stock cannot be negative'),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  basePrice: z.number().positive().max(10000000).optional(),
  gstSlabId: uuidSchema.optional(),
  stock: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

// Cart schemas
export const addToCartSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be positive').max(100),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive('Quantity must be positive').max(100),
});

// Order schemas
export const createOrderSchema = z.object({
  cartId: uuidSchema,
  shippingAddress: z.object({
    line1: z.string().min(1, 'Address line 1 required').max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1, 'City required').max(100),
    state: z.string().min(1, 'State required').max(100),
    postalCode: z.string().min(1, 'Postal code required').max(10),
    country: z.string().min(1, 'Country required').max(100),
  }),
});

// Seller schemas
export const createSellerSchema = z.object({
  businessName: z.string().min(1, 'Business name required').max(200),
  businessType: z.enum(['individual', 'partnership', 'company', 'llp']),
  gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'),
});

export const updateSellerSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  businessType: z.enum(['individual', 'partnership', 'company', 'llp']).optional(),
});

// Pagination schema
export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Search/filter schemas
export const productFilterSchema = paginationSchema.extend({
  sellerId: uuidSchema.optional(),
  category: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  search: z.string().max(200).optional(),
});

export const orderFilterSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
  paymentStatus: z.enum(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'REFUNDED']).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export const auditLogFilterSchema = paginationSchema.extend({
  action: z.string().optional(),
  actorId: uuidSchema.optional(),
  resourceType: z.string().optional(),
  resourceId: uuidSchema.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  isImpersonation: z.boolean().optional(),
});

// Type exports from schemas
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ImpersonateInput = z.infer<typeof impersonateSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateSellerInput = z.infer<typeof createSellerSchema>;
export type UpdateSellerInput = z.infer<typeof updateSellerSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ProductFilterInput = z.infer<typeof productFilterSchema>;
export type OrderFilterInput = z.infer<typeof orderFilterSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;
