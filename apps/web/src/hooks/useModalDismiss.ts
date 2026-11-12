import { useEffect, useRef } from 'react';
import type React from 'react';

/**
 * Provides click-outside backdrop dismissal and Escape-key dismissal for modals.
 * Ignores click events that began via pointer-down inside the modal card (e.g. text-selection drags)
 * while still supporting direct programmatic click events in tests and accessibility tools.
 */
export function useModalDismiss(
  isOpen: boolean,
  onClose: () => void,
  disabled = false
) {
  const pointerDownInside = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      pointerDownInside.current = false;
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !disabled) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, disabled]);

  const onMouseDown = (event: React.MouseEvent<HTMLElement>) => {
    pointerDownInside.current = event.target !== event.currentTarget;
  };

  const onClick = (event: React.MouseEvent<HTMLElement>) => {
    const startedInside = pointerDownInside.current;
    pointerDownInside.current = false;

    if (disabled || startedInside) return;
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return { onMouseDown, onClick };
}

