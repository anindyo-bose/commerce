import React from 'react';
import { Routes, Route } from 'react-router-dom';
import CheckoutPage from './pages/CheckoutPage';
import OrderHistoryPage from './pages/OrderHistoryPage';
import OrderDetailPage from './pages/OrderDetailPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/history" element={<OrderHistoryPage />} />
      <Route path="/:id" element={<OrderDetailPage />} />
      <Route path="/" element={<OrderHistoryPage />} />
    </Routes>
  );
};

export default App;
