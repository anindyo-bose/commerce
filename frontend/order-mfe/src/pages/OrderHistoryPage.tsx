import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Orders.css';

interface Order {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  createdAt: string;
  itemCount: number;
}

const OrderHistoryPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrders = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        navigate('/auth/login');
        return;
      }

      try {
        const response = await axios.get('http://localhost:3001/api/v1/orders', {
          headers: { Authorization: `Bearer ${token}` },
          params: { page: 1, limit: 20 },
        });

        setOrders(response.data.data.items);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate('/auth/login');
        } else {
          setError('Failed to load orders');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [navigate]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DELIVERED': return '#28a745';
      case 'SHIPPED': return '#007bff';
      case 'CONFIRMED': return '#17a2b8';
      case 'PENDING': return '#ffc107';
      case 'CANCELLED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return '#28a745';
      case 'PENDING': return '#ffc107';
      case 'FAILED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (isLoading) return <div className="loading">Loading orders...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="orders-container">
      <h1>Order History</h1>

      {orders.length === 0 ? (
        <div className="empty-orders">
          <p>You haven't placed any orders yet</p>
          <button onClick={() => navigate('/products')} className="btn-shop">
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <div
              key={order.id}
              className="order-card"
              onClick={() => navigate(`/orders/${order.id}`)}
            >
              <div className="order-header">
                <div>
                  <h3>Order #{order.orderNumber}</h3>
                  <p className="order-date">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <div className="order-statuses">
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(order.orderStatus) }}
                  >
                    {order.orderStatus}
                  </span>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getPaymentStatusColor(order.paymentStatus) }}
                  >
                    {order.paymentStatus}
                  </span>
                </div>
              </div>

              <div className="order-details">
                <div className="order-info">
                  <span>{order.itemCount} item{order.itemCount > 1 ? 's' : ''}</span>
                  <span>₹{order.totalAmount.toFixed(2)}</span>
                </div>
                <button className="btn-view-details">View Details →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
