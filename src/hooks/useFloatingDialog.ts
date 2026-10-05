import { useCallback, useEffect, useRef, useState } from 'react';

export interface FloatingBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UseFloatingDialogOptions {
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

const VIEWPORT_MARGIN = 16;

/**
 * Makes a fixed-position popup draggable (via a handle, usually its header)
 * and resizable (via a corner handle), clamped so it always stays reachable
 * within the viewport. Used by email/comms popups so operators can move
 * them out of the way or enlarge them instead of being stuck centered.
 */
export function useFloatingDialog({ defaultWidth, defaultHeight, minWidth = 380, minHeight = 260 }: UseFloatingDialogOptions) {
  const clamp = useCallback(
    (next: FloatingBounds): FloatingBounds => {
      const maxWidth = Math.max(minWidth, window.innerWidth - VIEWPORT_MARGIN);
      const maxHeight = Math.max(minHeight, window.innerHeight - VIEWPORT_MARGIN);
      const width = Math.min(Math.max(next.width, minWidth), maxWidth);
      const height = Math.min(Math.max(next.height, minHeight), maxHeight);
      const left = Math.min(Math.max(next.left, 0), Math.max(0, window.innerWidth - width));
      const top = Math.min(Math.max(next.top, 0), Math.max(0, window.innerHeight - height));
      return { top, left, width, height };
    },
    [minWidth, minHeight],
  );

  const centered = useCallback(
    (): FloatingBounds =>
      clamp({
        width: defaultWidth,
        height: defaultHeight,
        left: (window.innerWidth - defaultWidth) / 2,
        top: (window.innerHeight - defaultHeight) / 2,
      }),
    [clamp, defaultWidth, defaultHeight],
  );

  const [bounds, setBounds] = useState<FloatingBounds>(centered);

  const dragRef = useRef<{ startX: number; startY: number; top: number; left: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const [interacting, setInteracting] = useState(false);

  const onDragStart = useCallback(
    (event: React.MouseEvent) => {
      // Ignore drags starting on interactive controls inside the handle (e.g. close button).
      if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) return;
      dragRef.current = { startX: event.clientX, startY: event.clientY, top: bounds.top, left: bounds.left };
      setInteracting(true);
      event.preventDefault();
    },
    [bounds.top, bounds.left],
  );

  const onResizeStart = useCallback(
    (event: React.MouseEvent) => {
      resizeRef.current = { startX: event.clientX, startY: event.clientY, width: bounds.width, height: bounds.height };
      setInteracting(true);
      event.preventDefault();
      event.stopPropagation();
    },
    [bounds.width, bounds.height],
  );

  useEffect(() => {
    if (!interacting) return;
    const onMove = (event: MouseEvent) => {
      if (dragRef.current) {
        const { startX, startY, top, left } = dragRef.current;
        setBounds((current) =>
          clamp({ ...current, top: top + (event.clientY - startY), left: left + (event.clientX - startX) }),
        );
      } else if (resizeRef.current) {
        const { startX, startY, width, height } = resizeRef.current;
        setBounds((current) =>
          clamp({ ...current, width: width + (event.clientX - startX), height: height + (event.clientY - startY) }),
        );
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setInteracting(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [interacting, clamp]);

  // Keep the popup on-screen if the window is resized.
  useEffect(() => {
    const onResize = () => setBounds((current) => clamp(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const resetPosition = useCallback(() => setBounds(centered()), [centered]);

  const style = {
    position: 'fixed' as const,
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    margin: 0,
  };

  return { style, isDragging: interacting, onDragStart, onResizeStart, resetPosition };
}
