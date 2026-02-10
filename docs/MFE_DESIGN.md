# Micro Frontend Architecture Design

**Framework**: Webpack Module Federation  
**Host Shell**: React Router v6  
**Deployment**: Independent MFE per service  

---

## 1. MFE TOPOLOGY

```
┌─────────────────────────────────────────────────────────────────┐
│                         Host Shell (port 3000)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Router (React Router v6)                                   │ │
│  │ - /auth           → Auth MFE (lazy loaded)                │ │
│  │ - /products       → Product MFE (lazy loaded)             │ │
│  │ - /cart           → Cart MFE (lazy loaded)                │ │
│  │ - /orders         → Order MFE (lazy loaded)               │ │
│  │ - /admin          → Admin MFE (lazy loaded)               │ │
│  │ - /seller         → Seller MFE (lazy loaded)              │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
    ↑                    ↑               ↑                ↑
    │                    │               │                │
  Port 3001           Port 3002       Port 3003        Port 3004
 Auth MFE          Product MFE      Cart MFE         Order MFE
  (local)            (local)         (local)          (local)

Production URLs:
https://auth-mfe.commerce.local/remoteEntry.js
https://product-mfe.commerce.local/remoteEntry.js
https://cart-mfe.commerce.local/remoteEntry.js
https://order-mfe.commerce.local/remoteEntry.js
```

---

## 2. MFE BREAKDOWN & OWNERSHIP

### 2.1 Auth MFE (Port 3001)

**Owner**: Auth Service Team  
**Exports**:
- `LoginPage` → Login screen
- `RegisterPage` → Sign-up screen
- `ForgotPasswordPage` → Password reset
- `VerifyTokenPage` → Two-factor verification
- `AuthGuard` → Protected route wrapper
- `useAuth` → Auth context hook

```typescript
// auth-mfe/src/index.ts
import { lazy } from 'react';

export const LoginPage = lazy(() => import('./pages/LoginPage'));
export const RegisterPage = lazy(() => import('./pages/RegisterPage'));
export const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
export const VerifyTokenPage = lazy(() => import('./pages/VerifyTokenPage'));
export { AuthGuard } from './guards/AuthGuard';
export { useAuth } from './hooks/useAuth';
export { AuthProvider } from './context/AuthContext';
```

**Routes**:
- `GET /` → Auth shell (redirect to login)
- `GET /login` → Login page
- `GET /register` → Registration page
- `GET /forgot-password` → Password reset
- `GET /verify-token` → 2FA verification
- `POST /api/auth/login` → Backend API
- `POST /api/auth/register` → Backend API

### 2.2 Product MFE (Port 3002)

**Owner**: Product Service Team  
**Exports**:
- `ProductListPage` → Product browser
- `ProductDetailPage` → Product detail view
- `SearchPage` → Product search
- `CategoriesPage` → Category browse
- `useProducts` → Product data hook

### 2.3 Cart MFE (Port 3003)

**Owner**: Order Service Team  
**Exports**:
- `CartPage` → Cart UI
- `CartWidget` → Inline cart widget
- `CartIcon` → Cart icon with count
- `useCart` → Cart state hook

### 2.4 Order MFE (Port 3004)

**Owner**: Order Service Team  
**Exports**:
- `CheckoutPage` → Checkout flow
- `OrderListPage` → Order history
- `OrderDetailPage` → Order tracking
- `InvoicePage` → Invoice view
- `useOrders` → Order data hook

### 2.5 Seller Dashboard MFE (Port 3005)

**Owner**: Seller Service Team  
**Exports**:
- `SellerDashboard` → Overview
- `ShopSettingsPage` → Shop config
- `ProductManagementPage` → Product CRUD
- `SellerOrdersPage` → Order management
- `InventoryPage` → Stock management

### 2.6 Admin Dashboard MFE (Port 3006)

**Owner**: Admin Service Team  
**Exports**:
- `AdminDashboard` → Admin overview
- `UserManagementPage` → User admin
- `SellerVerificationPage` → Seller approval
- `AuditLogsPage` → Audit viewer
- `ImpersonationPage` → Admin impersonation
- `PlatformConfigPage` → Platform settings

---

## 3. MODULE FEDERATION CONFIG

### 3.1 Host Shell (webpack.config.js)

```javascript
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');
const deps = require('./package.json').dependencies;

module.exports = {
  mode: 'production',
  entry: './src/index.tsx',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[hash].js'
  },
  
  devServer: {
    port: 3000,
    historyApiFallback: true
  },
  
  plugins: [
    new ModuleFederationPlugin({
      name: 'host',
      filename: 'remoteEntry.js',
      
      remotes: {
        // Development
        ...(process.env.NODE_ENV === 'development' ? {
          auth: 'auth@http://localhost:3001/remoteEntry.js',
          product: 'product@http://localhost:3002/remoteEntry.js',
          cart: 'cart@http://localhost:3003/remoteEntry.js',
          order: 'order@http://localhost:3004/remoteEntry.js',
          seller: 'seller@http://localhost:3005/remoteEntry.js',
          admin: 'admin@http://localhost:3006/remoteEntry.js'
        } : 
        // Production
        {
          auth: 'auth@https://auth-mfe.commerce.local/remoteEntry.js',
          product: 'product@https://product-mfe.commerce.local/remoteEntry.js',
          cart: 'cart@https://cart-mfe.commerce.local/remoteEntry.js',
          order: 'order@https://order-mfe.commerce.local/remoteEntry.js',
          seller: 'seller@https://seller-mfe.commerce.local/remoteEntry.js',
          admin: 'admin@https://admin-mfe.commerce.local/remoteEntry.js'
        })
      },
      
      shared: {
        react: {
          singleton: true,
          requiredVersion: deps.react,
          strictVersion: false
        },
        'react-dom': {
          singleton: true,
          requiredVersion: deps['react-dom'],
          strictVersion: false
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: deps['react-router-dom'],
          strictVersion: false
        },
        axios: {
          singleton: true,
          requiredVersion: deps.axios
        }
      }
    })
  ]
};
```

### 3.2 Auth MFE (webpack.config.js)

```javascript
module.exports = {
  mode: 'production',
  entry: './src/index.tsx',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[hash].js'
  },
  
  devServer: {
    port: 3001,
    historyApiFallback: true
  },
  
  plugins: [
    new ModuleFederationPlugin({
      name: 'auth',
      filename: 'remoteEntry.js',
      
      exposes: {
        './LoginPage': './src/pages/LoginPage',
        './RegisterPage': './src/pages/RegisterPage',
        './ForgotPasswordPage': './src/pages/ForgotPasswordPage',
        './VerifyTokenPage': './src/pages/VerifyTokenPage',
        './AuthGuard': './src/guards/AuthGuard',
        './useAuth': './src/hooks/useAuth',
        './AuthProvider': './src/context/AuthContext'
      },
      
      shared: {
        react: { singleton: true, requiredVersion: deps.react },
        'react-dom': { singleton: true, requiredVersion: deps['react-dom'] },
        'react-router-dom': { singleton: true, requiredVersion: deps['react-router-dom'] }
      }
    })
  ]
};
```

---

## 4. HOST SHELL ROUTING

```typescript
// host-shell/src/App.tsx
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from 'auth/AuthProvider';
import { AuthGuard } from 'auth/AuthGuard';
import Layout from './Layout';
import ErrorBoundary from './ErrorBoundary';

const LoginPage = lazy(() => import('auth/LoginPage'));
const RegisterPage = lazy(() => import('auth/RegisterPage'));
const ProductListPage = lazy(() => import('product/ProductListPage'));
const CartPage = lazy(() => import('cart/CartPage'));
const CheckoutPage = lazy(() => import('order/CheckoutPage'));
const OrderDetailPage = lazy(() => import('order/OrderDetailPage'));
const SellerDashboard = lazy(() => import('seller/SellerDashboard'));
const AdminDashboard = lazy(() => import('admin/AdminDashboard'));

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <ErrorBoundary>
          <Routes>
            {/* Public routes */}
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/register" element={<RegisterPage />} />
            
            {/* Protected routes */}
            <Route element={<AuthGuard requiredRole="CUSTOMER" />}>
              <Route element={<Layout />}>
                <Route path="/" element={<ProductListPage />} />
                <Route path="/products" element={<ProductListPage />} />
                <Route path="/products/:productId" element={<lazy(() => import('product/ProductDetailPage')) />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/orders" element={<lazy(() => import('order/OrderListPage')) />} />
                <Route path="/orders/:orderId" element={<OrderDetailPage />} />
              </Route>
            </Route>
            
            {/* Seller routes */}
            <Route element={<AuthGuard requiredRole="SELLER" />}>
              <Route path="/seller/*" element={<SellerDashboard />} />
            </Route>
            
            {/* Admin routes */}
            <Route element={<AuthGuard requiredRole={['ADMIN', 'SUPER_ADMIN']} />}>
              <Route path="/admin/*" element={<AdminDashboard />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </AuthProvider>
    </Router>
  );
}
```

---

## 5. SHARED CONTEXT & HOOKS

### 5.1 Auth Context (Shared)

```typescript
// shared/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  permissions: string[];
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: any) => Promise<void>;
  refreshToken: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (token) {
          const { data } = await axios.get('/api/v1/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(data.user);
        }
      } catch (error) {
        localStorage.removeItem('accessToken');
      } finally {
        setIsLoading(false);
      }
    };
    
    checkAuth();
  }, []);
  
  const login = async (email: string, password: string) => {
    const { data } = await axios.post('/api/v1/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
  };
  
  const logout = async () => {
    await axios.post('/api/v1/auth/logout');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 5.2 API Client (Shared)

```typescript
// shared/src/api/client.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'https://api.commerce.local/api/v1',
  timeout: 10000
});

// Inject auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          return apiClient(error.config);
        } catch (refreshError) {
          // Refresh failed, logout
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/auth/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 6. MFE COMMUNICATION CONTRACTS

### 6.1 Product → Cart Communication

```typescript
// Defined in shared/src/contracts/product-cart.ts

export interface AddToCartRequest {
  productId: string;
  quantity: number;
  variantId?: string;
}

export interface AddToCartResponse {
  cartId: string;
  itemId: string;
  itemCount: number;
  cartTotal: number;
  gstBreakup: {
    baseAmount: number;
    gstAmount: number;
    percentage: number;
  };
}

// Usage in Product MFE
import { useCart } from 'cart/useCart';

function ProductDetailPage() {
  const { addItem } = useCart();
  
  const handleAddToCart = async (quantity: number) => {
    try {
      const response = await addItem({
        productId: productId,
        quantity: quantity
      });
      
      toast.success(`Added ${quantity} items. Cart total: ₹${response.cartTotal}`);
    } catch (error) {
      toast.error('Failed to add item');
    }
  };
  
  return (
    <button onClick={() => handleAddToCart(1)}>
      Add to Cart
    </button>
  );
}
```

### 6.2 Cart → Order Communication

```typescript
// shared/src/contracts/cart-order.ts

export interface CheckoutRequest {
  cartId: string;
  deliveryAddressId: string;
  discountCode?: string;
}

export interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  paymentLink: string;
  expiresIn: number;
}

// Usage in Cart MFE
const checkout = async () => {
  const response = await apiClient.post<CheckoutResponse>(
    '/orders',
    {
      cartId: cart.id,
      deliveryAddressId: selectedAddress.id
    }
  );
  
  window.location.href = response.data.paymentLink;
};
```

---

## 7. DEPLOYMENT STRATEGY

### 7.1 Development (Local)

```bash
# Terminal 1: Host shell
cd frontend/host-shell
npm start  # Port 3000

# Terminal 2: Auth MFE
cd frontend/auth-mfe
npm start  # Port 3001

# Terminal 3: Product MFE
cd frontend/product-mfe
npm start  # Port 3002

# ... repeat for other MFEs
```

### 7.2 Production (Docker + CDN)

```dockerfile
# dockerfile for each MFE
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  auth-mfe:
    build: ./frontend/auth-mfe
    ports:
      - "3001:3001"
    environment:
      REACT_APP_API_URL: https://api.commerce.local/api/v1
  
  product-mfe:
    build: ./frontend/product-mfe
    ports:
      - "3002:3002"
    environment:
      REACT_APP_API_URL: https://api.commerce.local/api/v1
  
  # ... other MFEs
  
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
```

### 7.3 CDN Distribution

```nginx
# nginx.conf
upstream auth-mfe {
  server auth-mfe:3001;
}

upstream product-mfe {
  server product-mfe:3002;
}

server {
  listen 443 ssl;
  server_name *.commerce.local;
  
  ssl_certificate /etc/nginx/certs/cert.pem;
  ssl_certificate_key /etc/nginx/certs/key.pem;
  
  # Host shell
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
  }
  
  # Auth MFE
  location ~ ^/auth-mfe/(.*) {
    proxy_pass http://auth-mfe/$1;
    add_header Access-Control-Allow-Origin *;
  }
  
  # Product MFE
  location ~ ^/product-mfe/(.*) {
    proxy_pass http://product-mfe/$1;
    add_header Access-Control-Allow-Origin *;
  }
  
  # ... other MFEs
}
```

---

## 8. ERROR BOUNDARIES & FALLBACKS

```typescript
// shared/src/ErrorBoundary.tsx
import React from 'react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: any, errorInfo: any) {
    console.error('MFE Error:', error, errorInfo);
    // Send to error tracking service
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-container">
          <h2>Oops! Something went wrong.</h2>
          <p>The requested module encountered an error.</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }
    
    return this.props.children;
  }
}
```

---

## 9. VERSION MANAGEMENT

```json
// package.json for each MFE
{
  "name": "@commerce/auth-mfe",
  "version": "1.2.3",
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.0.0"
  }
}
```

**Versioning Strategy**: Semantic versioning with capability flags
- MAJOR: Breaking changes (role-based API changes)
- MINOR: New features (new pages, hooks)
- PATCH: Bug fixes

---

**MFE Framework**: Webpack Module Federation  
**React Version**: 18.2+  
**Routing**: React Router v6  
**State Management**: Context API + custom hooks  
**Last Updated**: February 2026
