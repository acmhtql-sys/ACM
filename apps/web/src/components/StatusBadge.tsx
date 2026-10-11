import React from 'react';

interface StatusBadgeProps {
  status: string;
  variant?: 'role' | 'borrow' | 'itemType' | 'activeStatus' | 'default';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant = 'default' }) => {
  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  if (variant === 'role') {
    switch (status) {
      case 'ADMIN':
        colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
        break;
      case 'LAB_MANAGER':
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'TECHNICIAN':
        colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'STUDENT':
        colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
    }
  } else if (variant === 'borrow') {
    switch (status) {
      case 'PENDING':
        colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
        break;
      case 'APPROVED':
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'HANDED_OVER':
        colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
        break;
      case 'RETURNED':
        colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
        break;
      case 'REJECTED':
      case 'CANCELLED':
        colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
        break;
    }
  } else if (variant === 'itemType') {
    switch (status) {
      case 'CONSUMABLE':
        colorClasses = 'bg-teal-50 text-teal-700 border-teal-200';
        break;
      case 'TRACKED_ASSET':
        colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
        break;
      case 'EQUIPMENT':
        colorClasses = 'bg-violet-50 text-violet-700 border-violet-200';
        break;
    }
  } else if (variant === 'activeStatus') {
    if (status === 'ACTIVE' || status === 'true') {
      colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    } else {
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-300';
    }
  }

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${colorClasses}`}
    >
      {status}
    </span>
  );
};
