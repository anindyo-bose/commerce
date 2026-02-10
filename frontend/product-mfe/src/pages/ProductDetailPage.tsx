import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import './Products.css';

interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  gstPercentage: number;
  gstAmount: number;
  totalPrice: number;
  stock: number;
  sellerName: string;
  sku: string;
}

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const response = await axios.get(`http://localhost:3001/api/v1/products/${id}`);
        setProduct(response.data.data);
      } catch (err: any) {
        setError('Failed to load product');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchProduct();
  }, [id]);

  const handleAddToCart = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      window.location.href = '/auth/login';
      return;
    }

    try {
      await axios.post(
        'http://localhost:3001/api/v1/cart/items',
        { productId: id, quantity },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`Added ${quantity} item(s) to cart!`);
    } catch (err) {
      alert('Failed to add to cart');
    }
  };

  if (isLoading) return <div className="loading">Loading...</div>;
  if (error || !product) return <div className="error">{error || 'Product not found'}</div>;

  return (
    <div className="product-detail-container">
      <div className="product-detail">
        <div className="product-image-large">
          {product.name.substring(0, 2).toUpperCase()}
        </div>
        <div className="product-detail-info">
          <h1>{product.name}</h1>
          <p className="product-sku">SKU: {product.sku}</p>
          <p className="product-seller">Sold by: {product.sellerName}</p>
          <p className="product-description-full">{product.description}</p>
          
          <div className="pricing-detail">
            <table>
              <tbody>
                <tr>
                  <td>Base Price:</td>
                  <td>₹{product.basePrice.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>GST ({product.gstPercentage}%):</td>
                  <td>₹{product.gstAmount.toFixed(2)}</td>
                </tr>
                <tr className="total-row">
                  <td><strong>Total Price:</strong></td>
                  <td><strong>₹{product.totalPrice.toFixed(2)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="quantity-selector">
            <label>Quantity:</label>
            <input
              type="number"
              min="1"
              max={product.stock}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
            <span className="stock-info">{product.stock} available</span>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={product.stock === 0}
            className="btn-add-to-cart-large"
          >
            {product.stock > 0 ? 'Add to Cart' : 'Out of Stock'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailPage;
