import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Orders.css';

interface CartSummary {
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  itemCount: number;
}

const CheckoutPage: React.FC = () => {
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [shippingAddress, setShippingAddress] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCart = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        navigate('/auth/login');
        return;
      }

      try {
        const response = await axios.get('http://localhost:3001/api/v1/cart', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.data.data.items.length === 0) {
          navigate('/cart');
          return;
        }

        setSummary(response.data.data.summary);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate('/auth/login');
        } else {
          setError('Failed to load cart');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchCart();
  }, [navigate]);

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('accessToken');

    try {
      const response = await axios.post(
        'http://localhost:3001/api/v1/orders',
        { shippingAddress },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const orderId = response.data.data.id;
      alert('Order placed successfully!');
      navigate(`/orders/${orderId}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to place order');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="loading">Loading checkout...</div>;
  if (error && !summary) return <div className="error">{error}</div>;

  return (
    <div className="checkout-container">
      <h1>Checkout</h1>

      <div className="checkout-layout">
        <div className="checkout-form">
          <form onSubmit={handleCheckout}>
            <div className="form-section">
              <h2>Shipping Address</h2>
              {error && <div className="error-message">{error}</div>}
              
              <div className="form-group">
                <label htmlFor="address">Complete Address *</label>
                <textarea
                  id="address"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  required
                  rows={4}
                  placeholder="Enter your complete shipping address"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-place-order"
              >
                {isSubmitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </form>
        </div>

        <div className="order-summary">
          <h2>Order Summary</h2>
          <div className="summary-row">
            <span>Items ({summary?.itemCount}):</span>
            <span>₹{summary?.subtotal.toFixed(2)}</span>
          </div>
          <div className="summary-row">
            <span>Total GST:</span>
            <span>₹{summary?.totalGst.toFixed(2)}</span>
          </div>
          <div className="summary-row total">
            <span><strong>Total Amount:</strong></span>
            <span><strong>₹{summary?.totalAmount.toFixed(2)}</strong></span>
          </div>

          <div className="checkout-info">
            <p>✓ Secure payment</p>
            <p>✓ GST invoice included</p>
            <p>✓ Free delivery on orders above ₹500</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
