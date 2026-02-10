import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Admin.css';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchUsers = async () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/auth/login');
      return;
    }

    try {
      const params: any = { page: 1, limit: 100 };
      if (searchTerm) params.search = searchTerm;
      if (roleFilter !== 'ALL') params.role = roleFilter;

      const response = await axios.get('http://localhost:3001/api/v1/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setUsers(response.data.data.items || []);
    } catch (err: any) {
      if (err.response?.status === 401) {
        navigate('/auth/login');
      } else if (err.response?.status === 403) {
        setError('Access denied. Admin privileges required.');
      } else {
        setError('Failed to load users');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchTerm, roleFilter]);

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    const token = localStorage.getItem('accessToken');
    const action = currentStatus ? 'deactivate' : 'activate';

    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      await axios.patch(
        `http://localhost:3001/api/v1/admin/users/${userId}/status`,
        { isActive: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert(`User ${action}d successfully`);
      await fetchUsers();
    } catch (err) {
      alert(`Failed to ${action} user`);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    const token = localStorage.getItem('accessToken');

    if (!confirm(`Change user role to ${newRole}?`)) return;

    try {
      await axios.patch(
        `http://localhost:3001/api/v1/admin/users/${userId}/role`,
        { role: newRole },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      alert('User role updated successfully');
      await fetchUsers();
    } catch (err) {
      alert('Failed to update user role');
    }
  };

  if (isLoading) return <div className="loading">Loading users...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="admin-users-container">
      <h1>User Management</h1>

      <div className="admin-filters">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />

        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="role-filter">
          <option value="ALL">All Roles</option>
          <option value="CUSTOMER">Customer</option>
          <option value="SELLER">Seller</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      <div className="admin-users-table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.firstName} {user.lastName}</td>
                <td>{user.email}</td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => updateUserRole(user.id, e.target.value)}
                    className="role-dropdown"
                  >
                    <option value="CUSTOMER">Customer</option>
                    <option value="SELLER">Seller</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td>
                  <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString('en-IN')}</td>
                <td>
                  <button
                    onClick={() => toggleUserStatus(user.id, user.isActive)}
                    className={user.isActive ? 'btn-deactivate' : 'btn-activate'}
                  >
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="no-results">No users found</div>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
