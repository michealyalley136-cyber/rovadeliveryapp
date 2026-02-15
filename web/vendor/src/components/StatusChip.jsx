import React from 'react';

const canonicalStatus = (status) => {
  const map = {
    Created: 'NEW',
    SentToVendor: 'NEW',
    Accepted: 'PREPARING',
    Preparing: 'PREPARING',
    Ready: 'READY',
    Assigned: 'ASSIGNED',
    PickedUp: 'ASSIGNED',
    Delivered: 'COMPLETED',
    Cancelled: 'CANCELLED',
  };
  return map[status] || status || 'UNKNOWN';
};

const labelForStatus = (status) => {
  const canonical = canonicalStatus(status);
  return canonical.charAt(0) + canonical.slice(1).toLowerCase();
};

export const StatusChip = ({ status }) => {
  const canonical = canonicalStatus(status);
  return (
    <span className={`status-pill status-${canonical.toLowerCase()}`}>
      {labelForStatus(status)}
    </span>
  );
};
