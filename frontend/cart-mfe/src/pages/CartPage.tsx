import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Cart.css';

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  basePrice: number;
  gstPercentage: number;
  gstAmount: number;
  itemTotal: number;
  stock: number;
}

interface GSTBreakup {
  slabPercentage: number;
  taxableAmount: number;
  gstAmount: number;
}

interface CartSummary {
  subtotal: number;
  totalGst: number;
  totalAmount: number;
  gstBreakup: GSTBreakup[];
  itemCount: number;
}

const CartPage: React.FC = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

      setCartItems(response.data.data.items);
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

  useEffect(() => {
    fetchCart();
  }, []);

  const updateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    const token = localStorage.getItem('accessToken');
    try {
      await axios.put(
        `http://localhost:3001/api/v1/cart/items/${itemId}`,
        { quantity: newQuantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchCart();
    } catch (err) {
      alert('Failed to update quantity');
    }
  };

  const removeItem = async (itemId: string) => {
    const token = localStorage.getItem('accessToken');
    try {
      await axios.delete(`http://localhost:3001/api/v1/cart/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCart();
    } catch (err) {
      alert('Failed to remove item');
    }
  };

  const proceedToCheckout = () => {
    if (cartItems.length === 0) return;
    navigate('/orders/checkout');
  };

  if (isLoading) return <div className="loading">Loading cart...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="cart-container">
      <h1>Shopping Cart</h1>

      {cartItems.length === 0 ? (
        <div className="empty-cart">
          <p>Your cart is empty</p>
          <button onClick={() => navigate('/products')} className="btn-continue">
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cartItems.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="item-image">
                  {item.productName.substring(0, 2).toUpperCase()}
                </div>
                <div className="item-details">
                  <h3>{item.productName}</h3>
                  <p className="item-sku">SKU: {item.productSku}</p>
                  <div className="item-pricing">
                    <span>₹{item.basePrice.toFixed(2)}</span>
                    <span className="gst-label">+ ₹{item.gstAmount.toFixed(2)} GST</span>
                  </div>
                  <p className="stock-info">
                    {item.stock > 0 ? `${item.stock} available` : 'Out of stock'}
                  </p>
                </div>
                <div className="item-actions">
                  <div className="quantity-controls">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                      min="1"
                      max={item.stock}
                    />
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                    >
                      +
                    </button>
                  </div>
                  <p className="item-total">₹{item.itemTotal.toFixed(2)}</p>
                  <button onClick={() => removeItem(item.id)} className="btn-remove">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="cart-summary">
            <h2>Order Summary</h2>
            <div className="summary-row">
              <span>Subtotal ({summary?.itemCount} items):</span>
              <span>₹{summary?.subtotal.toFixed(2)}</span>
            </div>

            {summary?.gstBreakup.map((breakup, index) => (
              <div key={index} className="summary-row gst-row">
                <span>GST {breakup.slabPercentage}%:</span>
                <span>₹{breakup.gstAmount.toFixed(2)}</span>
              </div>
            ))}

            <div className="summary-row total-gst">
              <span>Total GST:</span>
              <span>₹{summary?.totalGst.toFixed(2)}</span>
            </div>

            <div className="summary-row total">
              <span><strong>Total Amount:</strong></span>
              <span><strong>₹{summary?.totalAmount.toFixed(2)}</strong></span>
            </div>

            <button onClick={proceedToCheckout} className="btn-checkout">
              Proceed to Checkout
            </button>

            <button
              onClick={() => navigate('/products')}
              className="btn-continue-shopping"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
