import { RefObject, useEffect } from 'react';

/**
 * Calls `onClose` when the pointer goes down outside `ref`, or on Escape.
 * Pass `active = false` to leave no listeners behind while nothing is open.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, onClose, active]);
}
