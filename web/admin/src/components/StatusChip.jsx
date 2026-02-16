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
    NEEDS_REASSIGN: 'CANCELLED',
    NeedsReassign: 'CANCELLED',
  };
  return map[status] || status || 'UNKNOWN';
};

const labelForStatus = (status) => {
  if (!status) return 'Unknown';
  return status
    .toString()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const StatusChip = ({ status }) => {
  const canonical = canonicalStatus(status);
  return (
    <span className={`status-pill status-${canonical.toLowerCase()}`}>
      {labelForStatus(status)}
    </span>
  );
};
