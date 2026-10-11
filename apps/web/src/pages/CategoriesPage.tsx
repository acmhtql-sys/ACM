import React, { useState, useEffect } from 'react';
import { Layers, Plus, Search, FolderTree } from 'lucide-react';
import { DemoDataNotice } from '../components/DemoDataNotice';
import { apiClient } from '../services/api';

export const CategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await apiClient.get('/categories');
        if (res.data?.success) {
          setCategories(res.data.data);
        }
      } catch (err) {
        // Fallback
      }
    }
    fetchCategories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center sm:space-y-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Danh mục Linh kiện (Categories)
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Cấu trúc phân loại theo nhóm phần cứng và mục đích đào tạo
          </p>
        </div>
        <button className="inline-flex items-center space-x-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" />
          <span>Tạo danh mục mới</span>
        </button>
      </div>

      <DemoDataNotice moduleName="Category Management" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm hover:border-blue-300 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                {cat.code}
              </span>
              <FolderTree className="h-4 w-4 text-slate-400" />
            </div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">{cat.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{cat.description || 'Chưa có mô tả'}</p>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Trực thuộc: Root Category</span>
              <span className="font-medium text-slate-700">ACM Active</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
