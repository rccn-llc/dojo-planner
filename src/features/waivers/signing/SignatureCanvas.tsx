'use client';

import type { RefObject } from 'react';
import { Eraser } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useReducer, useRef, useState } from 'react';
import SignaturePad from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Helpers';

type CanvasSize = { width: number; height: number };

function computeCanvasSize(container: HTMLElement | null, width: number, height: number): CanvasSize {
  if (!container) {
    return { width, height };
  }
  const containerWidth = container.offsetWidth;
  const availableWidth = containerWidth - 2; // account for border
  const aspectRatio = height / width;
  const newHeight = Math.min(Math.round(availableWidth * aspectRatio), height);
  return { width: availableWidth, height: newHeight };
}

function canvasSizeReducer(_state: CanvasSize, action: CanvasSize): CanvasSize {
  return action;
}

function useResponsiveCanvasSize(containerRef: RefObject<HTMLDivElement | null>, width: number, height: number) {
  const [canvasSize, dispatch] = useReducer(canvasSizeReducer, { width, height });

  useLayoutEffect(() => {
    const container = containerRef.current;
    dispatch(computeCanvasSize(container, width, height));

    const onResize = () => {
      dispatch(computeCanvasSize(container, width, height));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [containerRef, width, height]);

  return canvasSize;
}

export type SignatureCanvasProps = {
  /** Called when signature changes (null if empty) */
  onSignatureChange: (dataUrl: string | null) => void;
  /** Whether the canvas is disabled */
  disabled?: boolean;
  /** Label text above the canvas */
  label?: string;
  /** Width of the canvas in pixels */
  width?: number;
  /** Height of the canvas in pixels */
  height?: number;
  /** Additional class names for the container */
  className?: string;
  /** Error message to display */
  error?: string;
};

/**
 * Signature capture component using react-signature-canvas.
 * Supports both mouse (desktop) and touch (mobile/tablet/kiosk) input.
 */
export function SignatureCanvas({
  onSignatureChange,
  disabled = false,
  label,
  width = 500,
  height = 200,
  className,
  error,
}: SignatureCanvasProps) {
  const t = useTranslations('SignatureCanvas');
  const signaturePadRef = useRef<SignaturePad | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const canvasSize = useResponsiveCanvasSize(containerRef, width, height);

  const handleEnd = useCallback(() => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL('image/png');
      onSignatureChange(dataUrl);
      setIsEmpty(false);
    }
  }, [onSignatureChange]);

  const handleClear = useCallback(() => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
      onSignatureChange(null);
      setIsEmpty(true);
    }
  }, [onSignatureChange]);

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}

      <div
        ref={containerRef}
        className={cn(
          'relative rounded-lg border bg-white',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair',
          error ? 'border-destructive' : 'border-input',
        )}
      >
        <SignaturePad
          ref={signaturePadRef}
          canvasProps={{
            width: canvasSize.width,
            height: canvasSize.height,
            className: 'touch-none block',
          }}
          onEnd={handleEnd}
          penColor="black"
          minWidth={1}
          maxWidth={2.5}
          velocityFilterWeight={0.7}
        />

        {/* Placeholder text when empty */}
        {isEmpty && !disabled && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            <span className="text-sm">{t('placeholder')}</span>
          </div>
        )}

        {/* Disabled overlay */}
        {disabled && (
          <div className="absolute inset-0 bg-muted/50" />
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Clear button */}
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={disabled || isEmpty}
        >
          <Eraser className="mr-2 size-4" />
          {t('clear_button')}
        </Button>
      </div>
    </div>
  );
}
