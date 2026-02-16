import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { setApiHandlers } from '../api/client';

const ToastContext = createContext({ toast: () => {}, clearPersistentError: () => {} });

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [persistentError, setPersistentError] = useState('');

  useEffect(() => {
    setApiHandlers({
      onNetworkError: (message) => setPersistentError(message),
      onClear: () => setPersistentError(''),
    });
  }, []);

  const pushToast = useMemo(
    () => (toast) => {
      if (toast.persist) {
        setPersistentError(toast.message || 'Something went wrong.');
        return;
      }
      const id = Date.now() + Math.random();
      const payload = {
        id,
        type: toast.type || 'info',
        message: toast.message || '',
      };
      setToasts((prev) => [...prev, payload]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast: pushToast, clearPersistentError: () => setPersistentError('') }}>
      {children}
      {persistentError && (
        <div className="alert-error fixed left-1/2 top-6 z-50 w-[90vw] max-w-2xl -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="alert-error-title text-xs uppercase tracking-[0.2em]">Error</div>
              <div className="mt-1 text-sm">{persistentError}</div>
            </div>
            <button
              onClick={() => setPersistentError('')}
              className="alert-error-btn rounded-lg px-3 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rova-card glass toast rounded-lg px-4 py-3 text-sm shadow-lg ${
              t.type === 'error' ? 'toast-error' : t.type === 'success' ? 'toast-success' : 'toast-info'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
