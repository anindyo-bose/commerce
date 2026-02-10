# API Contracts - E-Commerce Platform

**Version**: v1.0.0  
**Base URL**: `https://api.commerce.local/api/v1`  
**Authentication**: JWT Bearer Token  

---

## 1. AUTHENTICATION ENDPOINTS

### 1.1 User Registration

```
POST /auth/register
Content-Type: application/json

Request:
{
  "email": "customer@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+91-9876543210",
  "dateOfBirth": "1990-01-15",
  "gender": "MALE",
  "userType": "CUSTOMER"  // or "SELLER"
}

Response: 201 Created
{
  "id": "user_123",
  "email": "customer@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "userType": "CUSTOMER",
  "createdAt": "2026-02-10T10:00:00Z",
  "links": {
    "self": "/users/user_123"
  }
}

Errors:
- 400 Bad Request: Validation failed
  {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "errors": [
      { "field": "email", "message": "Must be valid email" }
    ]
  }
- 409 Conflict: Email already exists
  {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "User with this email already registered"
  }
```

### 1.2 User Login

```
POST /auth/login
Content-Type: application/json

Request:
{
  "email": "customer@example.com",
  "password": "SecurePass123!",
  "rememberMe": false
}

Response: 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 900,  // seconds
  "user": {
    "id": "user_123",
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "CUSTOMER",
    "permissions": ["products:view", "orders:own_view"]
  }
}

Set-Cookie: refreshToken=...; Path=/; HttpOnly; Secure; SameSite=Strict

Errors:
- 401 Unauthorized: Invalid credentials
  {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect"
  }
- 429 Too Many Requests: Rate limited
  {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many login attempts. Try again after 15 minutes"
  }
```

### 1.3 Refresh Token

```
POST /auth/refresh
Content-Type: application/json
Cookie: refreshToken=...

Request:
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Response: 200 OK
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900
}

Errors:
- 401 Unauthorized: Refresh token invalid/expired
```

### 1.4 Logout

```
POST /auth/logout
Authorization: Bearer <accessToken>

Request:
{}

Response: 200 OK
{
  "message": "Logged out successfully"
}
```

---

## 2. ADMIN IMPERSONATION

### 2.1 Start Impersonation

```
POST /admin/impersonate
Authorization: Bearer <adminAccessToken>
Content-Type: application/json

Requires: policy "impersonate:execute"

Request:
{
  "targetUserId": "user_456",
  "durationMinutes": 30,
  "reason": "Support ticket #12345 - Customer complaint"
}

Response: 201 Created
{
  "impersonationSessionId": "imperson_789",
  "impersonationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "targetUserId": "user_456",
  "targetUserEmail": "u***@example.com",  // Masked
  "startsAt": "2026-02-10T10:00:00Z",
  "expiresAt": "2026-02-10T10:30:00Z",
  "message": "Impersonation started. PII is masked. All actions logged."
}

Errors:
- 400 Bad Request: Duration exceeds max (240 min)
- 403 Forbidden: Missing impersonate:execute permission
- 404 Not Found: Target user not found
```

### 2.2 End Impersonation

```
POST /admin/impersonate/:impersonationSessionId/end
Authorization: Bearer <adminAccessToken>

Response: 200 OK
{
  "message": "Impersonation ended",
  "sessionId": "imperson_789",
  "endedAt": "2026-02-10T10:15:00Z"
}
```

---

## 3. PRODUCT ENDPOINTS

### 3.1 Get All Products (Public)

```
GET /products?page=1&limit=20&category=electronics&sort=price_asc
Authorization: Optional (for personalization)

Response: 200 OK
{
  "data": [
    {
      "id": "prod_123",
      "sku": "SKU-001",
      "name": "Wireless Headphones",
      "description": "High-quality audio",
      "basePrice": 2999.99,
      "gstPercentage": 18,
      "gstAmount": 539.98,
      "totalPrice": 3539.97,
      "category": "electronics",
      "images": [
        {
          "url": "https://cdn.example.com/prod-123-1.jpg",
          "altText": "Product main image",
          "sequence": 1
        }
      ],
      "sellerId": "seller_001",
      "sellerName": "TechStore Pro",
      "isActive": true,
      "createdAt": "2026-01-15T08:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 150,
    "totalPages": 8
  },
  "filters": {
    "category": ["electronics", "books", "clothing"],
    "priceRange": { "min": 100, "max": 50000 },
    "gstPercentage": [0, 5, 12, 18, 28]
  }
}

Query Parameters:
- page: int (default: 1)
- limit: int (1-100, default: 20)
- category: string
- sort: price_asc | price_desc | latest | rating
- minPrice: number
- maxPrice: number
```

### 3.2 Get Product Details

```
GET /products/:productId
Authorization: Optional

Response: 200 OK
{
  "id": "prod_123",
  "sku": "SKU-001",
  "name": "Wireless Headphones",
  "description": "High-quality audio with noise cancellation",
  "basePrice": 2999.99,
  "gstPercentage": 18,
  "gstAmount": 539.98,
  "totalPrice": 3539.97,
  "category": "electronics",
  "tags": ["audio", "wireless", "noise-cancellation"],
  "images": [...],
  "seller": {
    "id": "seller_001",
    "name": "TechStore Pro",
    "rating": 4.8,
    "reviewCount": 1250
  },
  "inventory": {
    "quantityAvailable": 45,
    "isInStock": true
  },
  "variants": [
    {
      "id": "var_001",
      "name": "Black",
      "sku": "SKU-001-BLK",
      "basePrice": 2999.99
    }
  ],
  "createdAt": "2026-01-15T08:30:00Z",
  "updatedAt": "2026-02-10T10:00:00Z"
}
```

### 3.3 Create Product (Seller Only)

```
POST /sellers/:sellerId/products
Authorization: Bearer <sellerAccessToken>
Content-Type: application/json

Requires: policy "products:manage_own" with data scope

Request:
{
  "sku": "SKU-NEW-001",
  "name": "USB-C Cable",
  "description": "High-speed data transfer cable",
  "basePrice": 499.99,
  "gstSlabId": 3,  // GST 12%
  "category": "accessories",
  "tags": ["cable", "usb", "charging"],
  "images": [
    {
      "url": "https://cdn.example.com/usb-cable-1.jpg",
      "altText": "Cable front view",
      "sequence": 1
    }
  ]
}

Response: 201 Created
{
  "id": "prod_456",
  "sku": "SKU-NEW-001",
  "name": "USB-C Cable",
  "basePrice": 499.99,
  "gstPercentage": 12,
  "gstAmount": 59.99,
  "totalPrice": 559.98,
  "createdAt": "2026-02-10T10:30:00Z",
  "links": {
    "self": "/products/prod_456",
    "edit": "/sellers/seller_001/products/prod_456"
  }
}

Errors:
- 400 Bad Request: Validation failed
- 403 Forbidden: Not seller or data scope mismatch
- 409 Conflict: SKU already exists for this seller
```

### 3.4 Update Product (Seller Only)

```
PUT /sellers/:sellerId/products/:productId
Authorization: Bearer <sellerAccessToken>
Content-Type: application/json

Request:
{
  "description": "Updated description",
  "basePrice": 549.99,
  "category": "accessories"
}

Response: 200 OK
{
  "id": "prod_456",
  "sku": "SKU-NEW-001",
  "name": "USB-C Cable",
  "basePrice": 549.99,
  "gstPercentage": 12,
  "gstAmount": 65.99,
  "totalPrice": 615.98,
  "updatedAt": "2026-02-10T10:45:00Z"
}

Note: Cannot change SKU or GST percentage after creation (immutable)
```

---

## 4. SELLER/SHOP MANAGEMENT

### 4.1 Get Seller Profile

```
GET /sellers/:sellerId
Authorization: Optional

Response: 200 OK
{
  "id": "seller_001",
  "userId": "user_123",
  "businessName": "TechStore Pro",
  "businessType": "CORPORATION",
  "isVerified": true,
  "verificationStatus": "APPROVED",
  "verifiedAt": "2026-01-01T00:00:00Z",
  "shopImage": "https://cdn.example.com/shop-001.jpg",
  "rating": 4.8,
  "totalReviews": 1250,
  "totalProducts": 156,
  "createdAt": "2025-06-15T08:00:00Z"
}
```

### 4.2 Get Seller Products

```
GET /sellers/:sellerId/products?page=1&limit=20&status=active
Authorization: Optional (full list if owner, public list if visitor)

Response: 200 OK
{
  "data": [
    {
      "id": "prod_123",
      "sku": "SKU-001",
      "name": "Wireless Headphones",
      "basePrice": 2999.99,
      "gstPercentage": 18,
      "inventory": {
        "quantityOnHand": 100,
        "quantityAvailable": 95
      },
      "isActive": true
    }
  ],
  "pagination": {...}
}
```

### 4.3 Update Seller Profile (Seller Only)

```
PUT /sellers/:sellerId
Authorization: Bearer <sellerAccessToken>
Content-Type: application/json

Request:
{
  "businessName": "TechStore Pro Elite",
  "shopImage": "https://new-image-url.com/shop.jpg"
}

Response: 200 OK
{
  "id": "seller_001",
  "businessName": "TechStore Pro Elite",
  "shopImage": "https://new-image-url.com/shop.jpg",
  "updatedAt": "2026-02-10T11:00:00Z"
}
```

---

## 5. SHOPPING CART

### 5.1 Get Cart

```
GET /carts/current
Authorization: Bearer <cutomerAccessToken>

Response: 200 OK
{
  "id": "cart_789",
  "userId": "user_456",
  "items": [
    {
      "id": "item_001",
      "productId": "prod_123",
      "productName": "Wireless Headphones",
      "sku": "SKU-001",
      "quantity": 1,
      "basePrice": 2999.99,
      "gstPercentage": 18,
      "gstAmount": 539.98,
      "itemSubtotal": 2999.99,
      "itemTotal": 3539.97
    },
    {
      "id": "item_002",
      "productId": "prod_456",
      "productName": "USB-C Cable",
      "sku": "SKU-NEW-001",
      "quantity": 2,
      "basePrice": 499.99,
      "gstPercentage": 12,
      "gstAmount": 119.98,
      "itemSubtotal": 999.98,
      "itemTotal": 1119.96
    }
  ],
  "cartSummary": {
    "itemCount": 3,
    "subtotal": 3999.97,
    "totalGst": 659.96,
    "shippingFee": 0,
    "discountAmount": 0,
    "cartTotal": 4659.93,
    "gstBreakup": {
      "gst18": {
        "amount": 539.98,
        "percentage": 18
      },
      "gst12": {
        "amount": 119.98,
        "percentage": 12
      }
    }
  },
  "createdAt": "2026-02-10T08:00:00Z",
  "updatedAt": "2026-02-10T10:30:00Z"
}
```

### 5.2 Add to Cart

```
POST /carts/current/items
Authorization: Bearer <customerAccessToken>
Content-Type: application/json

Request:
{
  "productId": "prod_789",
  "quantity": 2,
  "variantId": "var_001"  // Optional
}

Response: 201 Created
{
  "id": "item_003",
  "cartId": "cart_789",
  "productId": "prod_789",
  "quantity": 2,
  "basePrice": 1499.99,
  "gstPercentage": 18,
  "gstAmount": 539.98,
  "itemSubtotal": 2999.98,
  "itemTotal": 3539.96,
  "cartTotal": 8199.89
}

Errors:
- 400 Bad Request: Quantity > available stock
- 404 Not Found: Product not found
```

### 5.3 Update Cart Item

```
PUT /carts/current/items/:itemId
Authorization: Bearer <customerAccessToken>
Content-Type: application/json

Request:
{
  "quantity": 3
}

Response: 200 OK
{
  "id": "item_001",
  "quantity": 3,
  "itemSubtotal": 8999.97,
  "itemTotal": 10619.96,
  "cartTotal": 10619.96
}
```

### 5.4 Remove Item from Cart

```
DELETE /carts/current/items/:itemId
Authorization: Bearer <customerAccessToken>

Response: 204 No Content
```

---

## 6. ORDERS

### 6.1 Create Order (Checkout)

```
POST /orders
Authorization: Bearer <customerAccessToken>
Content-Type: application/json

Request:
{
  "cartId": "cart_789",
  "deliveryAddressId": "addr_123",
  "billingAddressSameAsDelivery": true,
  "discountCode": "NEWUSER20",  // Optional
  "paymentMethod": "CARD"
}

Response: 201 Created
{
  "id": "order_123",
  "orderNumber": "ORD-2026-001-12345",
  "userId": "user_456",
  "orderStatus": "PENDING",
  "paymentStatus": "INITIATED",
  "items": [
    {
      "productId": "prod_123",
      "productName": "Wireless Headphones",
      "quantity": 1,
      "unitPrice": 2999.99,
      "gstPercentage": 18,
      "gstAmount": 539.98,
      "itemTotal": 3539.97
    }
  ],
  "orderSummary": {
    "subtotal": 3999.97,
    "totalGst": 659.96,
    "shippingFee": 100.00,
    "discountAmount": 0,
    "orderTotal": 4759.93
  },
  "deliveryAddress": {
    "id": "addr_123",
    "addressLine1": "123 Main St",
    "city": "[MASKED]",
    "state": "Maharashtra",
    "postalCode": "4****1"
  },
  "createdon": "2026-02-10T11:30:00Z",
  "paymentLink": {
    "url": "https://api.commerce.local/payments/order_123/checkout",
    "expiresIn": 3600
  }
}

Errors:
- 400 Bad Request: Insufficient inventory
- 402 Payment Required: Payment failed
```

### 6.2 Get Order Details

```
GET /orders/:orderId
Authorization: Bearer <customerAccessToken>

Response: 200 OK
{
  "id": "order_123",
  "orderNumber": "ORD-2026-001-12345",
  "orderStatus": "CONFIRMED",
  "paymentStatus": "SUCCESS",
  "items": [...],
  "orderSummary": {...},
  "shipment": {
    "trackingNumber": "TRK-123456789",
    "carrierName": "DTDC",
    "shippedAt": "2026-02-11T08:00:00Z",
    "estimatedDeliveryDate": "2026-02-15"
  },
  "createdAt": "2026-02-10T11:30:00Z",
  "updatedAt": "2026-02-11T08:00:00Z"
}

Data Scope: Customer can only view own orders
Admin/Seller: Can view based on permissions & data scope
```

### 6.3 Get Order History (Customer)

```
GET /orders?page=1&limit=10&status=confirmed&sort=created_desc
Authorization: Bearer <customerAccessToken>

Response: 200 OK
{
  "data": [
    {
      "id": "order_123",
      "orderNumber": "ORD-2026-001-12345",
      "orderStatus": "CONFIRMED",
      "paymentStatus": "SUCCESS",
      "orderTotal": 4759.93,
      "createdAt": "2026-02-10T11:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 25,
    "totalPages": 3
  }
}

Auto-filtered: orders.userId = authenticated_user.id
```

---

## 7. INVOICE ENDPOINTS

### 7.1 Get Invoice PDF

```
GET /invoices/:orderId/pdf
Authorization: Bearer <customerAccessToken>
Accept: application/pdf

Response: 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="ORD-2026-001-12345.pdf"

[PDF Binary Content]

Invoice includes:
- Line-item GST breakdown
- Total GST amount
- All 5 GST slabs represented (if applicable)
- Seller GSTIN
- Customer details (PII masked if impersonated)
```

### 7.2 Get Invoice HTML

```
GET /invoices/:orderId
Authorization: Bearer <customerAccessToken>
Accept: application/json

Response: 200 OK
{
  "orderId": "order_123",
  "orderNumber": "ORD-2026-001-12345",
  "invoiceDate": "2026-02-10",
  "dueDate": null,
  "seller": {
    "name": "TechStore Pro",
    "gstin": "[MASKED]",
    "address": "..."
  },
  "buyer": {
    "name": "John Doe",
    "email": "j***@example.com",
    "phone": "+91-9***-****10",
    "address": "..."
  },
  "items": [
    {
      "description": "Wireless Headphones",
      "quantity": 1,
      "unitPrice": 2999.99,
      "gstPercent": 18,
      "gstAmount": 539.98,
      "totalAmount": 3539.97
    }
  ],
  "totals": {
    "subtotal": 3999.97,
    "gstBreakup": {
      "0": 0,
      "5": 0,
      "12": 119.98,
      "18": 539.98,
      "28": 0
    },
    "totalGst": 659.96,
    "total": 4659.93
  }
}
```

---

## 8. AUDIT LOG ENDPOINTS

### 8.1 Get Audit Logs (Admin Only)

```
GET /admin/audit-logs?actor=admin_001&resource=products&startDate=2026-02-01&endDate=2026-02-10&impersonationOnly=false

Authorization: Bearer <adminAccessToken>
Requires: policy "audit:view"

Response: 200 OK
{
  "data": [
    {
      "id": "audit_123",
      "timestamp": "2026-02-10T10:30:00Z",
      "actorType": "ADMIN",
      "actorId": "admin_001",
      "actorEmail": "admin@example.com",
      "action": "products:create",
      "resourceType": "products",
      "resourceId": "prod_456",
      "changes": {
        "after": {
          "name": "USB-C Cable",
          "basePrice": 499.99
        }
      },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "impersonationFlag": false,
      "status": "SUCCESS"
    },
    {
      "id": "audit_124",
      "timestamp": "2026-02-10T11:00:00Z",
      "actorType": "ADMIN",
      "actorId": "admin_001",
      "action": "orders:view",
      "resourceType": "orders",
      "resourceId": "order_123",
      "impersonationFlag": true,
      "impersonatedBy": "admin_001",
      "impersonedUserId": "user_456",
      "impersonationReason": "Support ticket #12345",
      "status": "SUCCESS"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 1250,
    "totalPages": 63
  }
}

Query Parameters:
- actor: string (admin ID or SYSTEM)
- resource: string (table name)
- action: string (action:verb pattern)
- impersonationOnly: boolean
- startDate: ISO 8601
- endDate: ISO 8601
```

---

## 9. STANDARD RESPONSE FORMAT

### 9.1 Success Response (2xx)

```json
{
  "success": true,
  "data": {...},
  "meta": {
    "timestamp": "2026-02-10T10:30:00Z",
    "version": "1.0.0"
  },
  "links": {
    "self": "/api/v1/products/prod_123",
    "next": "/api/v1/products?page=2"
  }
}
```

### 9.2 Error Response (4xx, 5xx)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format",
        "code": "INVALID_FORMAT"
      }
    ],
    "traceId": "uuid-for-logging"
  },
  "meta": {
    "timestamp": "2026-02-10T10:30:00Z"
  }
}
```

---

## 10. PAGINATION STANDARD

```
Query: ?page=2&limit=50&sort=created_at:desc

Response:
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 50,
    "totalCount": 5000,
    "totalPages": 100,
    "hasNext": true,
    "hasPrev": true,
    "startIndex": 50,
    "endIndex": 99
  },
  "links": {
    "first": "/api/v1/products?page=1&limit=50",
    "prev": "/api/v1/products?page=1&limit=50",
    "next": "/api/v1/products?page=3&limit=50",
    "last": "/api/v1/products?page=100&limit=50"
  }
}
```

---

## 11. HTTP STATUS CODES

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful GET, PUT |
| 201 | Created | POST creates resource |
| 204 | No Content | DELETE successful |
| 400 | Bad Request | Validation error |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Permission denied |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate SKU, email |
| 410 | Gone | Resource deleted |
| 415 | Unsupported Media Type | Wrong Content-Type |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Unexpected error |
| 503 | Service Unavailable | Maintenance |

---

**API Version**: 1.0.0  
**Last Updated**: February 2026  
**Backward Compatibility**: 6 months (v1 supported until Aug 2027)
