import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';

// Lazy load MFEs
const AuthApp = lazy(() => import('auth/App'));
const ProductApp = lazy(() => import('product/App'));
const CartApp = lazy(() => import('cart/App'));
const OrderApp = lazy(() => import('order/App'));
const SellerApp = lazy(() => import('seller/App'));
const AdminApp = lazy(() => import('admin/App'));

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Layout>
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
                {/* Auth routes */}
                <Route path="/auth/*" element={<AuthApp />} />
                
                {/* Product routes */}
                <Route path="/products/*" element={<ProductApp />} />
                
                {/* Cart routes */}
                <Route path="/cart/*" element={<CartApp />} />
                
                {/* Order routes */}
                <Route path="/orders/*" element={<OrderApp />} />
                
                {/* Seller routes */}
                <Route path="/seller/*" element={<SellerApp />} />
                
                {/* Admin routes */}
                <Route path="/admin/*" element={<AdminApp />} />
                
                {/* Default redirect */}
                <Route path="/" element={<Navigate to="/products" replace />} />
                <Route path="*" element={<Navigate to="/products" replace />} />
              </Routes>
            </Suspense>
          </Layout>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
