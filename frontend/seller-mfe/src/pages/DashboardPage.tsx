import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Seller.css';

interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboard = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        navigate('/auth/login');
        return;
      }

      try {
        const response = await axios.get('http://localhost:3001/api/v1/seller/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setStats(response.data.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate('/auth/login');
        } else if (err.response?.status === 403) {
          setError('Access denied. Seller account required.');
        } else {
          setError('Failed to load dashboard');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [navigate]);

  if (isLoading) return <div className="loading">Loading dashboard...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="dashboard-container">
      <h1>Seller Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon products">📦</div>
          <div className="stat-info">
            <h3>Total Products</h3>
            <p className="stat-value">{stats?.totalProducts || 0}</p>
            <p className="stat-subtitle">{stats?.activeProducts || 0} active</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orders">🛒</div>
          <div className="stat-info">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats?.totalOrders || 0}</p>
            <p className="stat-subtitle">{stats?.pendingOrders || 0} pending</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon revenue">💰</div>
          <div className="stat-info">
            <h3>Total Revenue</h3>
            <p className="stat-value">₹{(stats?.totalRevenue || 0).toFixed(2)}</p>
            <p className="stat-subtitle">All time</p>
          </div>
        </div>
      </div>

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <button onClick={() => navigate('/seller/products/new')} className="btn-action primary">
            ➕ Add New Product
          </button>
          <button onClick={() => navigate('/seller/products')} className="btn-action">
            📊 View All Products
          </button>
          <button onClick={() => navigate('/orders')} className="btn-action">
            📋 View Orders
          </button>
        </div>
      </div>

      <div className="dashboard-info">
        <div className="info-card">
          <h3>Getting Started</h3>
          <ul>
            <li>Add your products with GST slab information</li>
            <li>Set competitive prices and manage inventory</li>
            <li>Monitor orders and update order status</li>
            <li>Track your sales and revenue</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
