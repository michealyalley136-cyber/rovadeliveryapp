import React from 'react';

const canonicalStatus = (status) => {
  if (!status) return 'UNKNOWN';
  const key = status.toString().trim().toLowerCase().replace(/\s+/g, '_');
  const map = {
    created: 'NEW',
    sent_to_vendor: 'NEW',
    senttovendor: 'NEW',
    new: 'NEW',
    placed: 'NEW',
    accepted: 'PREPARING',
    preparing: 'PREPARING',
    ready: 'READY',
    assigned: 'ASSIGNED',
    picked_up: 'ASSIGNED',
    pickedup: 'ASSIGNED',
    delivered: 'COMPLETED',
    completed: 'COMPLETED',
    declined: 'CANCELLED',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
    needs_reassign: 'READY',
  };
  return map[key] || 'UNKNOWN';
};

const labelForStatus = (status) => {
  if (!status) return 'Unknown';
  return status
    .toString()
    .trim()
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
