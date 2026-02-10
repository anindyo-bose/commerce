import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, impersonation, logout, endImpersonation } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/auth/login');
  };

  const handleEndImpersonation = async () => {
    await endImpersonation();
    navigate('/admin/users');
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="header-container">
          <h1 className="logo" onClick={() => navigate('/products')}>
            Commerce Platform
          </h1>
          <nav className="nav">
            <a href="/products" className="nav-link">Products</a>
            {user && (
              <>
                <a href="/cart" className="nav-link">Cart</a>
                <a href="/orders" className="nav-link">Orders</a>
                {user.role === 'SELLER' && (
                  <a href="/seller" className="nav-link">Seller Dashboard</a>
                )}
                {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                  <a href="/admin" className="nav-link">Admin</a>
                )}
              </>
            )}
          </nav>
          <div className="user-section">
            {user ? (
              <>
                <span className="user-name">{user.firstName} {user.lastName || ''}</span>
                <span className="user-role">({user.role})</span>
                <button onClick={handleLogout} className="btn-logout">Logout</button>
              </>
            ) : (
              <a href="/auth/login" className="btn-login">Login</a>
            )}
          </div>
        </div>
      </header>

      {impersonation.isImpersonating && (
        <div className="impersonation-banner">
          <span>⚠️ You are impersonating a user. Data is masked for privacy.</span>
          <button onClick={handleEndImpersonation} className="btn-end-impersonation">
            End Impersonation
          </button>
        </div>
      )}

      <main className="main-content">{children}</main>

      <footer className="footer">
        <p>&copy; 2026 Commerce Platform. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Layout;
