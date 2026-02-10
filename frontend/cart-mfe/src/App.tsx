import React from 'react';
import { Routes, Route } from 'react-router-dom';
import CartPage from './pages/CartPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<CartPage />} />
    </Routes>
  );
};

export default App;
