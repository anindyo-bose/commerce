import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Admin.css';

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalSellers: number;
  verifiedSellers: number;
  totalOrders: number;
  totalRevenue: number;
  pendingVerifications: number;
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
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
        const response = await axios.get('http://localhost:3001/api/v1/admin/dashboard', {
          headers: { Authorization: `Bearer ${token}` },
        });

        setStats(response.data.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate('/auth/login');
        } else if (err.response?.status === 403) {
          setError('Access denied. Admin privileges required.');
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
    <div className="admin-dashboard-container">
      <h1>Admin Dashboard</h1>

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-icon users">👥</div>
          <div className="admin-stat-info">
            <h3>Total Users</h3>
            <p className="admin-stat-value">{stats?.totalUsers || 0}</p>
            <p className="admin-stat-subtitle">{stats?.activeUsers || 0} active</p>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon sellers">🏪</div>
          <div className="admin-stat-info">
            <h3>Total Sellers</h3>
            <p className="admin-stat-value">{stats?.totalSellers || 0}</p>
            <p className="admin-stat-subtitle">{stats?.verifiedSellers || 0} verified</p>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon orders">📦</div>
          <div className="admin-stat-info">
            <h3>Total Orders</h3>
            <p className="admin-stat-value">{stats?.totalOrders || 0}</p>
            <p className="admin-stat-subtitle">Platform-wide</p>
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-icon revenue">💰</div>
          <div className="admin-stat-info">
            <h3>Total Revenue</h3>
            <p className="admin-stat-value">₹{(stats?.totalRevenue || 0).toFixed(2)}</p>
            <p className="admin-stat-subtitle">All time</p>
          </div>
        </div>

        {stats?.pendingVerifications !== undefined && stats.pendingVerifications > 0 && (
          <div className="admin-stat-card highlight">
            <div className="admin-stat-icon pending">⚠️</div>
            <div className="admin-stat-info">
              <h3>Pending Verifications</h3>
              <p className="admin-stat-value">{stats.pendingVerifications}</p>
              <p className="admin-stat-subtitle">Requires action</p>
            </div>
          </div>
        )}
      </div>

      <div className="admin-quick-actions">
        <h2>Quick Actions</h2>
        <div className="admin-action-grid">
          <button onClick={() => navigate('/admin/users')} className="admin-action-btn">
            <span className="action-icon">👥</span>
            <span className="action-text">Manage Users</span>
          </button>
          <button onClick={() => navigate('/admin/impersonate')} className="admin-action-btn">
            <span className="action-icon">🎭</span>
            <span className="action-text">Impersonate User</span>
          </button>
          <button onClick={() => navigate('/admin/audit-logs')} className="admin-action-btn">
            <span className="action-icon">📋</span>
            <span className="action-text">View Audit Logs</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
