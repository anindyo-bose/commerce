import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Seller.css';

const EditProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    basePrice: '',
    gstPercentage: '18',
    stock: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProduct = async () => {
      const token = localStorage.getItem('accessToken');
      try {
        const response = await axios.get(`http://localhost:3001/api/v1/products/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const product = response.data.data;
        setFormData({
          name: product.name,
          description: product.description,
          basePrice: product.basePrice.toString(),
          gstPercentage: product.gstPercentage.toString(),
          stock: product.stock.toString(),
        });
      } catch (err) {
        setError('Failed to load product');
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchProduct();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('accessToken');

    try {
      await axios.put(
        `http://localhost:3001/api/v1/products/${id}`,
        {
          name: formData.name,
          description: formData.description,
          basePrice: parseFloat(formData.basePrice),
          gstPercentage: parseInt(formData.gstPercentage),
          stock: parseInt(formData.stock),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Product updated successfully!');
      navigate('/seller/products');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update product');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <div className="loading">Loading product...</div>;
  if (error && !formData.name) return <div className="error">{error}</div>;

  return (
    <div className="product-form-container">
      <div className="page-header">
        <h1>Edit Product</h1>
        <button onClick={() => navigate('/seller/products')} className="btn-secondary">
          ← Back to Products
        </button>
      </div>

      <div className="form-card">
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Product Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              maxLength={200}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              required
              rows={4}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="basePrice">Base Price (₹) *</label>
              <input
                id="basePrice"
                name="basePrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.basePrice}
                onChange={handleChange}
                required
              />
              <small>Price excluding GST</small>
            </div>

            <div className="form-group">
              <label htmlFor="gstPercentage">GST Slab *</label>
              <select
                id="gstPercentage"
                name="gstPercentage"
                value={formData.gstPercentage}
                onChange={handleChange}
                required
              >
                <option value="0">0% (Exempt)</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stock">Stock *</label>
              <input
                id="stock"
                name="stock"
                type="number"
                min="0"
                value={formData.stock}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting} className="btn-submit">
              {isSubmitting ? 'Updating...' : 'Update Product'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/seller/products')}
              className="btn-cancel"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProductPage;
