import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Clock,
  Check,
} from 'lucide-react';

export interface DatePickerViProps {
  value: string; // ISO 'YYYY-MM-DD'
  onChange: (dateStr: string) => void;
  minDate?: string; // ISO 'YYYY-MM-DD'
  maxDate?: string; // ISO 'YYYY-MM-DD'
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  testId?: string;
}

const MONTH_NAMES_VI = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

const WEEKDAY_NAMES_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function formatIsoToVi(isoStr: string): string {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

export function parseViToIso(viStr: string): string | null {
  if (!viStr) return null;
  const parts = viStr.trim().split(/[/.-]/);
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dateObj = new Date(y, m - 1, d);
  if (
    dateObj.getFullYear() !== y ||
    dateObj.getMonth() !== m - 1 ||
    dateObj.getDate() !== d
  ) {
    return null;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

export const DatePickerVi: React.FC<DatePickerViProps> = ({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = 'Chọn ngày (ngày/tháng/năm)',
  required = false,
  disabled = false,
  id,
  name,
  className = '',
  testId,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize view month/year from current value or today
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);

  // Keep view in sync when value changes externally
  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build grid days for the month view
  const calendarDays = useMemo(() => {
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    // Monday as first day of week: (0 is Sunday in JS -> shift to 6)
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

    const pad = (n: number) => String(n).padStart(2, '0');
    const days: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
      isSelected: boolean;
      isToday: boolean;
    }[] = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${pad(prevM)}-${pad(d)}`;
      const isDisabled =
        (minDate ? dateStr < minDate : false) || (maxDate ? dateStr > maxDate : false);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curM = viewMonth + 1;
      const dateStr = `${viewYear}-${pad(curM)}-${pad(d)}`;
      const isDisabled =
        (minDate ? dateStr < minDate : false) || (maxDate ? dateStr > maxDate : false);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    // Next month days to complete 35 or 42 cells
    const remaining = (7 - (days.length % 7)) % 7;
    const totalCells = days.length + remaining < 35 ? 35 - days.length : remaining;
    for (let d = 1; d <= totalCells; d++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${pad(nextM)}-${pad(d)}`;
      const isDisabled =
        (minDate ? dateStr < minDate : false) || (maxDate ? dateStr > maxDate : false);
      days.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isDisabled,
        isSelected: dateStr === value,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, minDate, maxDate, value, todayStr]);

  const handleSelectDay = (dateStr: string, isDisabled: boolean) => {
    if (isDisabled || disabled) return;
    onChange(dateStr);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    if (minDate && todayStr < minDate) return;
    if (maxDate && todayStr > maxDate) return;
    onChange(todayStr);
    const [y, m] = todayStr.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setIsOpen(false);
  };

  const displayFormatted = useMemo(() => formatIsoToVi(value), [value]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button / Input Display */}
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between rounded-xl border bg-white px-3.5 py-2 text-sm text-left shadow-xs transition-all cursor-pointer ${
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/15'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-75' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-testid={testId || 'datepicker-vi-trigger'}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <CalendarIcon
            className={`h-4 w-4 shrink-0 transition-colors ${
              isOpen ? 'text-blue-600' : 'text-slate-400'
            }`}
          />
          {displayFormatted ? (
            <span className="font-semibold text-slate-800 tracking-wide font-mono text-xs sm:text-sm">
              {displayFormatted}
            </span>
          ) : (
            <span className="text-slate-400 text-xs sm:text-sm truncate">{placeholder}</span>
          )}
        </div>

        {/* Clear or Calendar indicator */}
        <div className="flex items-center space-x-1 shrink-0 ml-1">
          {value && !required && !disabled ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Xóa ngày đã chọn"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              ngày/th/năm
            </span>
          )}
        </div>
      </button>

      {/* Hidden real input for form validation compatibility */}
      <input
        type="hidden"
        name={name}
        value={value}
        required={required}
        readOnly
      />

      {/* Custom Vietnamese Calendar Popover */}
      {isOpen && (
        <div
          className="absolute z-50 left-0 top-full mt-2 w-72 sm:w-80 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150"
          role="dialog"
          aria-label="Chọn ngày theo lịch tiếng Việt"
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              title="Tháng trước"
              aria-label="Tháng trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <div className="text-center font-bold text-slate-800 text-xs sm:text-sm">
              <span>{MONTH_NAMES_VI[viewMonth]}</span>{' '}
              <span className="text-blue-600 font-mono">{viewYear}</span>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
              title="Tháng sau"
              aria-label="Tháng sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday Names Header */}
          <div className="grid grid-cols-7 gap-1 pt-2 pb-1 text-center text-[11px] font-bold text-slate-400">
            {WEEKDAY_NAMES_VI.map((dayName, idx) => (
              <div
                key={dayName}
                className={idx === 6 ? 'text-rose-500' : ''}
                title={idx === 6 ? 'Chủ nhật' : `Thứ ${idx + 2}`}
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {calendarDays.map((day, idx) => {
              const isWeekend = idx % 7 === 6; // Sunday
              return (
                <button
                  type="button"
                  key={day.dateStr + idx}
                  disabled={day.isDisabled}
                  data-date={day.dateStr}
                  onClick={() => handleSelectDay(day.dateStr, day.isDisabled)}
                  className={`h-8 w-full rounded-lg flex items-center justify-center font-medium transition-colors cursor-pointer ${
                    day.isSelected
                      ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/30'
                      : day.isDisabled
                      ? 'text-slate-300 bg-slate-50 cursor-not-allowed'
                      : day.isToday
                      ? 'border border-blue-500 text-blue-700 font-bold bg-blue-50/50 hover:bg-blue-100/60'
                      : day.isCurrentMonth
                      ? isWeekend
                        ? 'text-rose-600 hover:bg-rose-50'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      : 'text-slate-400 hover:bg-slate-50'
                  }`}
                  title={
                    day.isDisabled
                      ? 'Ngày này không khả dụng'
                      : `${day.dayNumber}/${viewMonth + 1}/${viewYear}`
                  }
                >
                  {day.dayNumber}
                </button>
              );
            })}
          </div>

          {/* Footer controls */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleSelectToday}
              disabled={minDate ? todayStr < minDate : false}
              className="font-semibold text-blue-600 hover:text-blue-700 hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
            >
              Hôm nay ({formatIsoToVi(todayStr)})
            </button>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
