import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Admin.css';

const ImpersonationPage: React.FC = () => {
  const [formData, setFormData] = useState({
    targetUserId: '',
    reason: '',
    durationMinutes: '60',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activeImpersonation, setActiveImpersonation] = useState<any>(null);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStartImpersonation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const token = localStorage.getItem('accessToken');

    try {
      const response = await axios.post(
        'http://localhost:3001/api/v1/admin/impersonate/start',
        {
          targetUserId: formData.targetUserId,
          reason: formData.reason,
          durationMinutes: parseInt(formData.durationMinutes),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const { impersonationToken, sessionInfo } = response.data.data;
      
      // Store impersonation context
      localStorage.setItem('impersonationToken', impersonationToken);
      setActiveImpersonation(sessionInfo);
      
      alert('Impersonation started successfully!\n\nYou are now acting as the target user.\nPII will be masked in responses.');
      
      // Reset form
      setFormData({ targetUserId: '', reason: '', durationMinutes: '60' });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to start impersonation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndImpersonation = async () => {
    const token = localStorage.getItem('accessToken');
    const impersonationToken = localStorage.getItem('impersonationToken');

    try {
      await axios.post(
        'http://localhost:3001/api/v1/admin/impersonate/end',
        {},
        { 
          headers: { 
            Authorization: `Bearer ${token}`,
            'X-Impersonation-Token': impersonationToken || '',
          } 
        }
      );

      localStorage.removeItem('impersonationToken');
      setActiveImpersonation(null);
      alert('Impersonation ended successfully');
    } catch (err) {
      alert('Failed to end impersonation');
    }
  };

  return (
    <div className="admin-impersonation-container">
      <h1>User Impersonation</h1>

      {activeImpersonation ? (
        <div className="active-impersonation-banner">
          <h2>⚠️ Active Impersonation Session</h2>
          <div className="impersonation-info">
            <p><strong>Target User:</strong> {activeImpersonation.targetUserId}</p>
            <p><strong>Reason:</strong> {activeImpersonation.reason}</p>
            <p><strong>Started:</strong> {new Date(activeImpersonation.startTime).toLocaleString('en-IN')}</p>
            <p><strong>Expires:</strong> {new Date(activeImpersonation.expiresAt).toLocaleString('en-IN')}</p>
          </div>
          <button onClick={handleEndImpersonation} className="btn-end-impersonation">
            End Impersonation
          </button>
        </div>
      ) : (
        <div className="impersonation-form-card">
          <div className="warning-box">
            <p><strong>⚠️ Important:</strong></p>
            <ul>
              <li>Impersonation is logged in audit trail</li>
              <li>PII will be masked in API responses</li>
              <li>Use only for legitimate support purposes</li>
              <li>Session expires after specified duration</li>
            </ul>
          </div>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleStartImpersonation}>
            <div className="form-group">
              <label htmlFor="targetUserId">Target User ID *</label>
              <input
                id="targetUserId"
                name="targetUserId"
                type="text"
                value={formData.targetUserId}
                onChange={handleChange}
                required
                placeholder="Enter user ID"
              />
              <small>User ID to impersonate</small>
            </div>

            <div className="form-group">
              <label htmlFor="reason">Reason for Impersonation *</label>
              <textarea
                id="reason"
                name="reason"
                value={formData.reason}
                onChange={handleChange}
                required
                rows={4}
                placeholder="Provide detailed reason (e.g., Customer support ticket #12345, investigating payment issue)"
              />
              <small>This will be logged in audit trail</small>
            </div>

            <div className="form-group">
              <label htmlFor="durationMinutes">Session Duration</label>
              <select
                id="durationMinutes"
                name="durationMinutes"
                value={formData.durationMinutes}
                onChange={handleChange}
                required
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="240">4 hours</option>
              </select>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={isSubmitting} className="btn-submit">
                {isSubmitting ? 'Starting...' : 'Start Impersonation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ImpersonationPage;
