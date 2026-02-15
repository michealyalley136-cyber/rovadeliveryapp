import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { getVendorId, getVendorToken } from './api/client';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastProvider';
import PinEntry from './pages/PinEntry';
import Orders from './pages/Orders';
import SelectVendor from './pages/SelectVendor';

const RequireVendor = ({ children }) => {
  const token = getVendorToken();
  const vendorId = getVendorId();
  if (!token || !vendorId) return <Navigate to="/vendor/select" replace />;
  return children;
};

const App = () => {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/vendor/select" replace />} />
        <Route path="/vendor/select" element={<SelectVendor />} />
        <Route path="/vendor/pin" element={<PinEntry />} />
        <Route
          element={
            <RequireVendor>
              <Layout />
            </RequireVendor>
          }
        >
          <Route path="/vendor/dashboard" element={<Orders />} />
        </Route>
        <Route path="*" element={<Navigate to="/vendor/select" replace />} />
      </Routes>
    </ToastProvider>
  );
};

export default App;
