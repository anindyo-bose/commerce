import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Seller.css';

interface Product {
  id: string;
  sku: string;
  name: string;
  basePrice: number;
  gstPercentage: number;
  stock: number;
  isActive: boolean;
}

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchProducts = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/auth/login');
      return;
    }

    try {
      const response = await axios.get('http://localhost:3001/api/v1/products', {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: 1, limit: 50 },
      });

      setProducts(response.data.data.items);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/auth/login');
      } else {
        setError('Failed to load products');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to deactivate this product?')) return;

    const token = localStorage.getItem('accessToken');
    try {
      await axios.delete(`http://localhost:3001/api/v1/products/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Product deactivated successfully');
      await fetchProducts();
    } catch (err) {
      alert('Failed to deactivate product');
    }
  };

  if (isLoading) return <div className="loading">Loading products...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="products-management-container">
      <div className="page-header">
        <h1>My Products</h1>
        <button onClick={() => navigate('/seller/products/new')} className="btn-primary">
          ➕ Add Product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <p>You haven't added any products yet</p>
          <button onClick={() => navigate('/seller/products/new')} className="btn-primary">
            Add Your First Product
          </button>
        </div>
      ) : (
        <div className="products-table">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Price</th>
                <th>GST</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.sku}</td>
                  <td>{product.name}</td>
                  <td>₹{product.basePrice.toFixed(2)}</td>
                  <td>{product.gstPercentage}%</td>
                  <td>
                    <span className={product.stock > 10 ? 'stock-good' : product.stock > 0 ? 'stock-low' : 'stock-out'}>
                      {product.stock}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${product.isActive ? 'active' : 'inactive'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons-inline">
                      <button
                        onClick={() => navigate(`/seller/products/${product.id}/edit`)}
                        className="btn-edit"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="btn-delete"
                        disabled={!product.isActive}
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProductsPage;
