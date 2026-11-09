import React, { useMemo } from 'react';
import { generateBarcodeSvgElements } from '../utils/code128';

interface BarcodeRendererProps {
  value: string;
  height?: number;
  barColor?: string;
  showText?: boolean;
  className?: string;
  textSize?: 'sm' | 'base' | 'lg';
}

export const BarcodeRenderer: React.FC<BarcodeRendererProps> = ({
  value,
  height = 56,
  barColor = '#000000',
  showText = true,
  className = '',
  textSize = 'base'
}) => {
  const { viewBox, rects, totalWidth, totalHeight } = useMemo(() => {
    return generateBarcodeSvgElements(value, { height, moduleWidth: 2 });
  }, [value, height]);

  if (!rects.length) {
    return (
      <div className={`flex flex-col items-center justify-center p-2 border border-dashed border-red-300 rounded bg-red-50 text-red-600 text-xs ${className}`}>
        <span>Gagal membentuk barcode</span>
      </div>
    );
  }

  const textClasses = {
    sm: 'text-xs tracking-wider',
    base: 'text-sm tracking-widest font-semibold',
    lg: 'text-base tracking-widest font-bold'
  }[textSize];

  return (
    <div className={`flex flex-col items-center select-none bg-white p-2.5 rounded ${className}`}>
      <svg
        viewBox={viewBox}
        className="w-full max-w-[320px] h-auto overflow-visible"
        style={{ minHeight: `${height}px` }}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="0" y="0" width={totalWidth} height={totalHeight} fill="#ffffff" />
        {rects.map((rect, idx) => (
          <rect
            key={idx}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill={barColor}
          />
        ))}
      </svg>
      {showText && (
        <span className={`font-mono text-neutral-900 mt-1.5 tabular-nums ${textClasses}`}>
          {value}
        </span>
      )}
    </div>
  );
};
