import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Admin.css';

interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  metadata?: any;
}

const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filters, setFilters] = useState({
    actorEmail: '',
    action: '',
    resourceType: '',
    startDate: '',
    endDate: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchLogs = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/auth/login');
      return;
    }

    setIsLoading(true);
    try {
      const params: any = { page: 1, limit: 50 };
      
      if (filters.actorEmail) params.actorEmail = filters.actorEmail;
      if (filters.action) params.action = filters.action;
      if (filters.resourceType) params.resourceType = filters.resourceType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await axios.get('http://localhost:3001/api/v1/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setLogs(response.data.data.items || []);
      setError('');
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/auth/login');
      } else if (err.response?.status === 403) {
        setError('Access denied. Admin privileges required.');
      } else {
        setError('Failed to load audit logs');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleReset = () => {
    setFilters({
      actorEmail: '',
      action: '',
      resourceType: '',
      startDate: '',
      endDate: '',
    });
  };

  if (error) return <div className="error">{error}</div>;

  return (
    <div className="admin-audit-logs-container">
      <h1>Audit Logs</h1>

      <div className="audit-filters-card">
        <form onSubmit={handleSearch}>
          <div className="filter-grid">
            <div className="form-group">
              <label htmlFor="actorEmail">Actor Email</label>
              <input
                id="actorEmail"
                name="actorEmail"
                type="text"
                value={filters.actorEmail}
                onChange={handleFilterChange}
                placeholder="user@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="action">Action</label>
              <select
                id="action"
                name="action"
                value={filters.action}
                onChange={handleFilterChange}
              >
                <option value="">All Actions</option>
                <option value="impersonate:start">Impersonate Start</option>
                <option value="impersonate:end">Impersonate End</option>
                <option value="user:create">User Create</option>
                <option value="user:update">User Update</option>
                <option value="user:delete">User Delete</option>
                <option value="order:create">Order Create</option>
                <option value="product:create">Product Create</option>
                <option value="product:update">Product Update</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="resourceType">Resource Type</label>
              <select
                id="resourceType"
                name="resourceType"
                value={filters.resourceType}
                onChange={handleFilterChange}
              >
                <option value="">All Resources</option>
                <option value="USER">User</option>
                <option value="ORDER">Order</option>
                <option value="PRODUCT">Product</option>
                <option value="IMPERSONATION">Impersonation</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="startDate">Start Date</label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                value={filters.startDate}
                onChange={handleFilterChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="endDate">End Date</label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                value={filters.endDate}
                onChange={handleFilterChange}
              />
            </div>
          </div>

          <div className="filter-actions">
            <button type="submit" className="btn-search">Search</button>
            <button type="button" onClick={handleReset} className="btn-reset">Reset</button>
          </div>
        </form>
      </div>

      {isLoading ? (
        <div className="loading">Loading audit logs...</div>
      ) : (
        <div className="audit-logs-table">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.timestamp).toLocaleString('en-IN')}</td>
                  <td>{log.actorEmail}</td>
                  <td>
                    <span className="action-badge">{log.action}</span>
                  </td>
                  <td>
                    {log.resourceType} <br />
                    <small className="resource-id">{log.resourceId}</small>
                  </td>
                  <td>
                    {log.ipAddress} <br />
                    <small className="user-agent" title={log.userAgent}>
                      {log.userAgent?.substring(0, 40)}...
                    </small>
                  </td>
                  <td>
                    {log.metadata && (
                      <details>
                        <summary>View Metadata</summary>
                        <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className="no-results">No audit logs found matching filters</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogsPage;
