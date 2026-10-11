import React from 'react';
import { AlertCircle } from 'lucide-react';

interface DemoDataNoticeProps {
  moduleName?: string;
}

export const DemoDataNotice: React.FC<DemoDataNoticeProps> = ({ moduleName }) => {
  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 shadow-sm">
      <div className="flex items-center space-x-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-600" />
        <span>
          <strong className="font-semibold uppercase tracking-wider text-amber-900">Phase 1 Foundation:</strong>{' '}
          {moduleName ? `Module ${moduleName}` : 'Dữ liệu đang hiển thị'} ở chế độ Demo Mock Data.
          Hệ thống đang hoạt động trên giao diện khung chuẩn SaaS. Nghiệp vụ lưu trữ đầy đủ sẽ kết nối trực tiếp trong các bước tiếp theo.
        </span>
      </div>
      <span className="ml-4 inline-flex items-center rounded-full bg-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
        Demo Mode
      </span>
    </div>
  );
};
