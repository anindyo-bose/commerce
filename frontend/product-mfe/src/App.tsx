import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ProductListPage from './pages/ProductListPage';
import ProductDetailPage from './pages/ProductDetailPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ProductListPage />} />
      <Route path="/:id" element={<ProductDetailPage />} />
    </Routes>
  );
};

export default App;
