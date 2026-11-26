import React, { useState } from 'react';
import { Package, ImageOff } from 'lucide-react';
import { ItemType } from '@acm/shared';

interface ItemThumbnailProps {
  imageUrl?: string | null;
  name: string;
  code?: string;
  type?: ItemType | string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

/**
 * Returns a consistent visual theme/color based on the component type or code.
 */
function getPlaceholderStyle(type?: ItemType | string, code?: string) {
  if (type === ItemType.TRACKED_ASSET || type === 'TRACKED_ASSET') {
    return {
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-100/80',
      border: 'border-blue-200/80',
      text: 'text-blue-600',
      tagBg: 'bg-blue-600 text-white',
      badge: 'RFID/BAR',
    };
  }
  if (type === ItemType.EQUIPMENT || type === 'EQUIPMENT') {
    return {
      bg: 'bg-gradient-to-br from-purple-50 to-violet-100/80',
      border: 'border-purple-200/80',
      text: 'text-purple-600',
      tagBg: 'bg-purple-600 text-white',
      badge: 'EQP',
    };
  }
  // CONSUMABLE or default
  return {
    bg: 'bg-gradient-to-br from-teal-50 to-emerald-100/80',
    border: 'border-teal-200/80',
    text: 'text-teal-600',
    tagBg: 'bg-teal-600 text-white',
    badge: 'MAT',
  };
}

export const ItemThumbnail: React.FC<ItemThumbnailProps> = ({
  imageUrl,
  name,
  code,
  type,
  size = 'md',
  className = '',
  onClick,
}) => {
  const [hasError, setHasError] = useState(false);
  const style = getPlaceholderStyle(type, code);

  const sizeClasses = {
    sm: 'w-10 h-10 min-w-10 rounded-lg text-xs',
    md: 'w-16 h-16 min-w-16 rounded-xl text-sm',
    lg: 'w-20 h-20 min-w-20 rounded-xl text-base',
  }[size];

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-7 w-7',
    lg: 'h-9 w-9',
  }[size];

  // Has valid real image
  if (imageUrl && !hasError) {
    return (
      <div
        onClick={onClick}
        className={`relative shrink-0 overflow-hidden border border-slate-200/90 bg-white shadow-2xs group flex items-center justify-center ${sizeClasses} ${
          onClick ? 'cursor-pointer hover:border-blue-400 hover:shadow-xs active:scale-95 transition-all' : ''
        } ${className}`}
        title={`Xem ảnh: ${name}`}
      >
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          onError={() => setHasError(true)}
          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
        />
        {type === ItemType.TRACKED_ASSET && (
          <span className="absolute bottom-0 right-0 rounded-tl-md bg-blue-600/90 text-white text-[8px] font-bold px-1 py-0.5 leading-none backdrop-blur-2xs">
            QC
          </span>
        )}
      </div>
    );
  }

  // Visual Fallback (Clear, branded, and informative)
  return (
    <div
      onClick={onClick}
      className={`relative shrink-0 overflow-hidden border flex flex-col items-center justify-center p-1 select-none shadow-2xs transition-all ${style.bg} ${style.border} ${sizeClasses} ${
        onClick ? 'cursor-pointer hover:shadow-xs active:scale-95' : ''
      } ${className}`}
      title={hasError ? `Ảnh không tải được - ${name}` : `${name} (${code || 'Linh kiện'})`}
    >
      <div className={`flex items-center justify-center ${style.text}`}>
        {hasError ? <ImageOff className={iconSizes} /> : <Package className={iconSizes} />}
      </div>
      {size !== 'sm' && (
        <span className="mt-0.5 text-[9px] font-bold tracking-tight text-slate-600 truncate max-w-full px-0.5 text-center leading-tight">
          {code ? code.split('-').slice(-1)[0] : 'ITEM'}
        </span>
      )}
      <span
        className={`absolute top-0.5 left-0.5 rounded px-1 py-0.2 text-[8px] font-extrabold tracking-wider leading-none ${style.tagBg}`}
      >
        {style.badge}
      </span>
    </div>
  );
};
