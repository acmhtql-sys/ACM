import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendPositive?: boolean;
  icon: LucideIcon;
  iconColor?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  trendPositive,
  icon: Icon,
  iconColor = 'bg-blue-50/80 text-blue-600 border border-blue-200/50',
}) => {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all duration-200 hover:shadow-md hover:border-slate-300 group">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-xs transition-transform duration-200 group-hover:scale-105 ${iconColor}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline space-x-2">
        <div className="text-2xl font-extrabold tracking-tight text-slate-900">{value}</div>
        {trend && (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
              trendPositive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {trend}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1.5 text-xs text-slate-500 leading-normal">{subtitle}</p>}
    </div>
  );
};
