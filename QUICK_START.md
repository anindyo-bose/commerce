# Commerce Platform - Quick Start Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL 14+ installed and running

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
Create `backend/.env` file:
```env
# Server
PORT=3001
NODE_ENV=development
API_VERSION=v1

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=commerce_dev
DB_SSL=false

# Security
ENCRYPTION_MASTER_KEY=your-master-key-at-least-12-chars
JWT_SECRET=your-jwt-secret-at-least-32-characters-long
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_GLOBAL_MAX=1000
RATE_LIMIT_GLOBAL_WINDOW_MS=60000
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=900000

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004,http://localhost:3005,http://localhost:3006
CORS_CREDENTIALS=true

# Features
IMPERSONATION_ENABLED=true
MAX_IMPERSONATION_MINUTES=240
```

### 3. Run Database Migrations
```bash
npm run migrate:up
```

### 4. Start Backend Server
```bash
npm run dev
```
Backend will run on http://localhost:3001

## Frontend Setup (Module Federation)

### Host Shell
```bash
cd frontend/host-shell
npm install
npm run dev
```
Runs on http://localhost:3000

### Auth MFE
```bash
cd frontend/auth-mfe
npm install
npm run dev
```
Runs on http://localhost:3001

### Product MFE
```bash
cd frontend/product-mfe
npm install
npm run dev
```
Runs on http://localhost:3002

### Cart MFE (TODO)
```bash
cd frontend/cart-mfe
npm install
npm run dev
```
Runs on http://localhost:3003

### Order MFE (TODO)
```bash
cd frontend/order-mfe
npm install
npm run dev
```
Runs on http://localhost:3004

### Seller MFE (TODO)
```bash
cd frontend/seller-mfe
npm install
npm run dev
```
Runs on http://localhost:3005

### Admin MFE (TODO)
```bash
cd frontend/admin-mfe
npm install
npm run dev
```
Runs on http://localhost:3006

## Testing

### Run Backend Tests
```bash
cd backend
npm run test
npm run test:coverage
```

## Architecture Overview

### Backend
- **TypeORM Migrations**: Database schema in `backend/migrations/`
- **Entities**: Domain models in `backend/src/entities/`
- **Services**: Business logic in `backend/src/services/`
- **Controllers**: API endpoints in `backend/src/controllers/`
- **Middleware**: Guards, rate limiters, validators in `backend/src/middleware/`

### Frontend (Module Federation)
- **Host Shell**: Main application shell with routing
- **Auth MFE**: Login/Register pages
- **Product MFE**: Product listing and detail pages
- **Cart MFE**: Shopping cart management
- **Order MFE**: Order checkout and history
- **Seller MFE**: Seller dashboard for product management
- **Admin MFE**: Admin dashboard with impersonation

## Database Migrations Created

✅ **1707523200000-InitialSchema.ts**
- Creates all tables (users, products, orders, sellers, carts, audit_logs, etc.)
- Sets up RBAC (roles, permissions, role_permissions)
- Creates indexes for performance
- Enables PostgreSQL extensions (uuid-ossp, pgcrypto)
- Adds constraints and rules (audit_logs immutability)

✅ **1707523300000-SeedInitialData.ts**
- Seeds system roles (SUPER_ADMIN, ADMIN, SELLER, CUSTOMER)
- Seeds permissions (users:*, sellers:*, products:*, orders:*, cart:*, audit:*, impersonate:*)
- Assigns permissions to roles
- Seeds GST slabs (0%, 5%, 12%, 18%, 28%)

## MFE Structure Created

✅ **host-shell** (Port 3000)
- Module Federation host
- React Router setup
- AuthContext provider
- Layout with navigation
- Error boundary and loading states

✅ **auth-mfe** (Port 3001)
- Login page
- Register page
- Form validation
- Token management

✅ **product-mfe** (Port 3002)
- Product list page with grid layout
- Product detail page
- GST calculation display
- Add to cart functionality

## Next Implementation Steps

1. **Complete Remaining MFEs**
   - cart-mfe (CartPage, CartWidget)
   - order-mfe (CheckoutPage, OrderDetailPage, InvoicePage)
   - seller-mfe (SellerDashboard, ProductManagement)
   - admin-mfe (UserManagement, ImpersonationPage, AuditLogViewer)

2. **Create TypeORM Repositories**
   - UserRepository, ProductRepository, OrderRepository, SellerRepository, CartRepository
   - Replace mock data in controllers

3. **Integration Testing**
   - Setup test database
   - Write end-to-end tests with Supertest
   - Test all API flows

4. **Production Readiness**
   - Setup CI/CD pipeline
   - Configure production builds
   - Add monitoring and logging
   - Setup database backups
