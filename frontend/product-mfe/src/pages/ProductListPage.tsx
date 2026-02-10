import React, { useState, useEffect } from 'react';
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
}

const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await axios.get('http://localhost:3001/api/v1/products', {
          params: { page: 1, limit: 20 },
        });
        setProducts(response.data.data.items);
      } catch (err: any) {
        setError('Failed to load products');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  const handleAddToCart = async (productId: string) => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      window.location.href = '/auth/login';
      return;
    }

{ try {
      await axios.post(
        'http://localhost:3001/api/v1/cart/items',
        { productId, quantity: 1 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('Added to cart!');
    } catch (err) {
      alert('Failed to add to cart');
    }
  };

  if (isLoading) return <div className="loading">Loading products...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="products-container">
      <h1>Products</h1>
      <div className="products-grid">
        {products.map((product) => (
          <div key={product.id} className="product-card">
            <div className="product-image-placeholder">
              {product.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="product-info">
              <h3>{product.name}</h3>
              <p className="product-description">{product.description}</p>
              <div className="product-pricing">
                <span className="base-price">₹{product.basePrice.toFixed(2)}</span>
                <span className="gst-info">+ ₹{product.gstAmount.toFixed(2)} GST ({product.gstPercentage}%)</span>
                <span className="total-price">Total: ₹{product.totalPrice.toFixed(2)}</span>
              </div>
              <p className="stock-info">
                {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
              </p>
              <button
                onClick={() => handleAddToCart(product.id)}
                disabled={product.stock === 0}
                className="btn-add-to-cart"
              >
                Add to Cart
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductListPage;
