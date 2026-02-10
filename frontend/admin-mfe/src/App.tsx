import React from 'react';
import { Routes, Route } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ImpersonationPage from './pages/ImpersonationPage';
import AuditLogsPage from './pages/AuditLogsPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/users" element={<UsersPage />} />
      <Route path="/impersonate" element={<ImpersonationPage />} />
      <Route path="/audit-logs" element={<AuditLogsPage />} />
    </Routes>
  );
};

export default App;
