import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeRendererProps {
  value: string;
  size?: number;
  className?: string;
  showLabel?: boolean;
}

export const QrCodeRenderer: React.FC<QrCodeRendererProps> = ({
  value,
  size = 100,
  className = '',
  showLabel = true
}) => {
  const [svgString, setSvgString] = useState<string>('');

  useEffect(() => {
    if (!value) {
      setSvgString('');
      return;
    }

    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((svg) => {
        setSvgString(svg);
      })
      .catch((err) => {
        console.error('QR code generation error:', err);
      });
  }, [value, size]);

  if (!value) {
    return (
      <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center text-[10px] text-slate-400">
        Kosong
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center bg-white p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs ${className}`}>
      {svgString ? (
        <div
          dangerouslySetInnerHTML={{ __html: svgString }}
          className="flex items-center justify-center"
          style={{ width: `${size}px`, height: `${size}px` }}
        />
      ) : (
        <div
          style={{ width: `${size}px`, height: `${size}px` }}
          className="bg-slate-100 animate-pulse rounded"
        />
      )}
      {showLabel && (
        <span className="text-[11px] font-mono font-bold text-slate-900 mt-1 tracking-wider">
          {value}
        </span>
      )}
    </div>
  );
};
