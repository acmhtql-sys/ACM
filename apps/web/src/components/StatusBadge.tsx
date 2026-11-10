import React from 'react';

interface StatusBadgeProps {
  status: string;
  variant?: 'role' | 'borrow' | 'itemType' | 'activeStatus' | 'stockStatus' | 'kitStatus' | 'default';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, variant = 'default' }) => {
  let colorClasses = 'bg-slate-50 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let displayLabel = status;

  if (variant === 'role') {
    switch (status) {
      case 'ADMIN':
        colorClasses = 'bg-purple-50/90 text-purple-700 border-purple-200/70';
        dotColor = 'bg-purple-500';
        break;
      case 'LAB_MANAGER':
        colorClasses = 'bg-blue-50/90 text-blue-700 border-blue-200/70';
        dotColor = 'bg-blue-500';
        break;
      case 'TECHNICIAN':
        colorClasses = 'bg-teal-50/90 text-teal-700 border-teal-200/70';
        dotColor = 'bg-teal-500';
        break;
      case 'STUDENT':
        colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        dotColor = 'bg-slate-400';
        break;
    }
  } else if (variant === 'borrow') {
    switch (status) {
      case 'PENDING':
        colorClasses = 'bg-amber-50/90 text-amber-700 border-amber-200/70';
        dotColor = 'bg-amber-500';
        break;
      case 'APPROVED':
        colorClasses = 'bg-blue-50/90 text-blue-700 border-blue-200/70';
        dotColor = 'bg-blue-500';
        break;
      case 'HANDED_OVER':
        colorClasses = 'bg-indigo-50/90 text-indigo-700 border-indigo-200/70';
        dotColor = 'bg-indigo-500';
        break;
      case 'PARTIALLY_RETURNED':
        colorClasses = 'bg-cyan-50/90 text-cyan-700 border-cyan-200/70';
        dotColor = 'bg-cyan-500';
        break;
      case 'RETURNED':
        colorClasses = 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70';
        dotColor = 'bg-emerald-500';
        break;
      case 'REJECTED':
      case 'CANCELLED':
        colorClasses = 'bg-rose-50/90 text-rose-700 border-rose-200/70';
        dotColor = 'bg-rose-500';
        break;
    }
  } else if (variant === 'itemType') {
    switch (status) {
      case 'CONSUMABLE':
        colorClasses = 'bg-teal-50/90 text-teal-700 border-teal-200/70';
        dotColor = 'bg-teal-500';
        break;
      case 'TRACKED_ASSET':
        colorClasses = 'bg-blue-50/90 text-blue-700 border-blue-200/70';
        dotColor = 'bg-blue-500';
        break;
      case 'EQUIPMENT':
        colorClasses = 'bg-violet-50/90 text-violet-700 border-violet-200/70';
        dotColor = 'bg-violet-500';
        break;
    }
  } else if (variant === 'activeStatus') {
    if (status === 'ACTIVE' || status === 'true') {
      colorClasses = 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70';
      dotColor = 'bg-emerald-500';
      displayLabel = 'Hoạt động';
    } else {
      colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
      dotColor = 'bg-slate-400';
      displayLabel = 'Ngừng hoạt động';
    }
  } else if (variant === 'stockStatus') {
    switch (status) {
      case 'IN_STOCK':
        colorClasses = 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70';
        dotColor = 'bg-emerald-500';
        displayLabel = 'Sẵn sàng';
        break;
      case 'LOW_STOCK':
        colorClasses = 'bg-amber-50/90 text-amber-700 border-amber-200/70';
        dotColor = 'bg-amber-500';
        displayLabel = 'Sắp hết';
        break;
      case 'OUT_OF_STOCK':
        colorClasses = 'bg-rose-50/90 text-rose-700 border-rose-200/70';
        dotColor = 'bg-rose-500';
        displayLabel = 'Đã hết';
        break;
    }
  } else if (variant === 'kitStatus') {
    switch (status) {
      case 'AVAILABLE':
        colorClasses = 'bg-emerald-50/90 text-emerald-700 border-emerald-200/70';
        dotColor = 'bg-emerald-500';
        displayLabel = 'Sẵn sàng';
        break;
      case 'ALLOCATED':
        colorClasses = 'bg-indigo-50/90 text-indigo-700 border-indigo-200/70';
        dotColor = 'bg-indigo-500';
        displayLabel = 'Đang phân bổ';
        break;
      case 'MAINTENANCE':
        colorClasses = 'bg-amber-50/90 text-amber-700 border-amber-200/70';
        dotColor = 'bg-amber-500';
        displayLabel = 'Bảo trì';
        break;
      case 'RETIRED':
        colorClasses = 'bg-slate-100 text-slate-600 border-slate-200';
        dotColor = 'bg-slate-400';
        displayLabel = 'Thanh lý';
        break;
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight shadow-sm ${colorClasses}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      <span>{displayLabel}</span>
    </span>
  );
};
