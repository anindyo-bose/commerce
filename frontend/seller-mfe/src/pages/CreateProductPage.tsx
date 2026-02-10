import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Seller.css';

const CreateProductPage: React.FC = () => {
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    basePrice: '',
    gstPercentage: '18',
    stock: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('accessToken');

    try {
      await axios.post(
        'http://localhost:3001/api/v1/products',
        {
          ...formData,
          basePrice: parseFloat(formData.basePrice),
          gstPercentage: parseInt(formData.gstPercentage),
          stock: parseInt(formData.stock),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      alert('Product created successfully!');
      navigate('/seller/products');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create product');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="product-form-container">
      <div className="page-header">
        <h1>Add New Product</h1>
        <button onClick={() => navigate('/seller/products')} className="btn-secondary">
          ← Back to Products
        </button>
      </div>

      <div className="form-card">
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="sku">SKU *</label>
            <input
              id="sku"
              name="sku"
              type="text"
              value={formData.sku}
              onChange={handleChange}
              required
              placeholder="e.g., PROD-001"
            />
            <small>Unique product identifier</small>
          </div>

          <div className="form-group">
            <label htmlFor="name">Product Name *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="e.g., Smartphone XYZ Pro"
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
              placeholder="Detailed product description"
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
                placeholder="0.00"
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
              <label htmlFor="stock">Initial Stock *</label>
              <input
                id="stock"
                name="stock"
                type="number"
                min="0"
                value={formData.stock}
                onChange={handleChange}
                required
                placeholder="0"
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting} className="btn-submit">
              {isSubmitting ? 'Creating...' : 'Create Product'}
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

export default CreateProductPage;
