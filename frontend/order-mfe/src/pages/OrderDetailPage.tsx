import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Orders.css';

interface OrderItem {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  basePrice: number;
  gstPercentage: number;
  gstAmount: number;
  itemTotal: number;
}

interface Order {
  id: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  shippingAddress: string;
  createdAt: string;
  items: OrderItem[];
}

const OrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchOrder = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        navigate('/auth/login');
        return;
      }

      try {
        const response = await axios.get(`http://localhost:3001/api/v1/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        setOrder(response.data.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate('/auth/login');
        } else {
          setError('Failed to load order');
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchOrder();
  }, [id, navigate]);

  const downloadInvoice = async () => {
    const token = localStorage.getItem('accessToken');
    try {
      const response = await axios.get(`http://localhost:3001/api/v1/orders/${id}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${order?.orderNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download invoice');
    }
  };

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

  if (isLoading) return <div className="loading">Loading order...</div>;
  if (error || !order) return <div className="error">{error || 'Order not found'}</div>;

  return (
    <div className="order-detail-container">
      <div className="order-detail-header">
        <div>
          <h1>Order #{order.orderNumber}</h1>
          <p className="order-date">
            Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <div className="order-actions">
          <span
            className="status-badge-large"
            style={{ backgroundColor: getStatusColor(order.orderStatus) }}
          >
            {order.orderStatus}
          </span>
          <button onClick={downloadInvoice} className="btn-download-invoice">
            Download Invoice
          </button>
        </div>
      </div>

      <div className="order-detail-layout">
        <div className="order-items-section">
          <h2>Order Items</h2>
          <div className="order-items-list">
            {order.items.map((item) => (
              <div key={item.id} className="order-item">
                <div className="order-item-image">
                  {item.productName.substring(0, 2).toUpperCase()}
                </div>
                <div className="order-item-details">
                  <h3>{item.productName}</h3>
                  <p className="item-sku">SKU: {item.sku}</p>
                  <p className="item-price">
                    ₹{item.basePrice.toFixed(2)} + ₹{item.gstAmount.toFixed(2)} GST ({item.gstPercentage}%)
                  </p>
                </div>
                <div className="order-item-summary">
                  <p className="item-quantity">Qty: {item.quantity}</p>
                  <p className="item-total">₹{item.itemTotal.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-sidebar">
          <div className="shipping-info">
            <h2>Shipping Address</h2>
            <p>{order.shippingAddress}</p>
          </div>

          <div className="payment-summary">
            <h2>Payment Summary</h2>
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>₹{order.subtotal.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Total GST:</span>
              <span>₹{order.totalGst.toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span><strong>Total Amount:</strong></span>
              <span><strong>₹{order.totalAmount.toFixed(2)}</strong></span>
            </div>
            <div className="payment-status">
              Payment Status: <strong style={{ color: getStatusColor(order.paymentStatus) }}>
                {order.paymentStatus}
              </strong>
            </div>
          </div>

          <div className="order-tracking">
            <h2>Order Status</h2>
            <div className="tracking-steps">
              <div className={`tracking-step ${['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.orderStatus) ? 'completed' : ''}`}>
                <div className="step-marker">✓</div>
                <div className="step-label">Order Placed</div>
              </div>
              <div className={`tracking-step ${['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.orderStatus) ? 'completed' : ''}`}>
                <div className="step-marker">✓</div>
                <div className="step-label">Confirmed</div>
              </div>
              <div className={`tracking-step ${['SHIPPED', 'DELIVERED'].includes(order.orderStatus) ? 'completed' : ''}`}>
                <div className="step-marker">✓</div>
                <div className="step-label">Shipped</div>
              </div>
              <div className={`tracking-step ${order.orderStatus === 'DELIVERED' ? 'completed' : ''}`}>
                <div className="step-marker">✓</div>
                <div className="step-label">Delivered</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button onClick={() => navigate('/orders')} className="btn-back">
        ← Back to Orders
      </button>
    </div>
  );
};

export default OrderDetailPage;
