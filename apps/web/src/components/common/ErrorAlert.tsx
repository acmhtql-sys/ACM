import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  title = 'Đã xảy ra lỗi khi tải dữ liệu',
  message,
  onRetry,
  isRetrying = false,
}) => {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-sm">
      <div className="flex items-start space-x-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-600" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="mt-1 text-xs text-rose-800/90 leading-relaxed">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className="mt-3 inline-flex items-center space-x-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-all hover:bg-rose-100 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Đang thử lại...' : 'Thử lại'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
