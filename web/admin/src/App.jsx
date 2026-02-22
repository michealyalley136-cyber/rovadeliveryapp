import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { getAdminKey } from './api/client';
import BackendStatusBanner from './components/BackendStatusBanner';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import Drivers from './pages/Drivers';
import Login from './pages/Login';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Pricing from './pages/Pricing';
import Vendors from './pages/Vendors';
import Menu from './pages/Menu';

const RequireAdmin = ({ children }) => {
  const key = getAdminKey();
  if (!key) return <Navigate to="/login" replace />;
  return children;
};

const App = () => {
  return (
    <ToastProvider>
      <BackendStatusBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAdmin>
              <Layout />
            </RequireAdmin>
          }
        >
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/pricing" element={<Pricing />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
};

export default App;
