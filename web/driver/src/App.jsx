import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { getDriverId, getDriverToken } from './api/client';
import BackendStatusBanner from './components/BackendStatusBanner';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import PinEntry from './pages/PinEntry';
import Orders from './pages/Orders';
import SelectDriver from './pages/SelectDriver';

const RequireDriver = ({ children }) => {
  const token = getDriverToken();
  const driverId = getDriverId();
  if (!token || !driverId) return <Navigate to="/driver/select" replace />;
  return children;
};

const App = () => {
  return (
    <ToastProvider>
      <BackendStatusBanner />
      <Routes>
        <Route path="/" element={<Navigate to="/driver/select" replace />} />
        <Route path="/driver/select" element={<SelectDriver />} />
        <Route path="/driver/pin" element={<PinEntry />} />
        <Route
          element={
            <RequireDriver>
              <Layout />
            </RequireDriver>
          }
        >
          <Route path="/driver/dashboard" element={<Orders />} />
          <Route path="/driver/orders" element={<Orders />} />
        </Route>
        <Route path="*" element={<Navigate to="/driver/select" replace />} />
      </Routes>
    </ToastProvider>
  );
};

export default App;
