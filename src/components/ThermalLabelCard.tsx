import React, { useState } from 'react';
import { PalletRecord } from '../types/warehouse';
import { BarcodeRenderer } from './BarcodeRenderer';
import { QrCodeRenderer } from './QrCodeRenderer';
import { Printer, Copy, Check, MapPin, Layers, Calendar, Hash, Tag, Box } from 'lucide-react';

interface ThermalLabelCardProps {
  record: PalletRecord;
  onPrintSingle?: (record: PalletRecord) => void;
  className?: string;
  isPrintView?: boolean;
}

export const ThermalLabelCard: React.FC<ThermalLabelCardProps> = ({
  record,
  onPrintSingle,
  className = '',
  isPrintView = false
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(record.barcodeNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = new Date(record.submittedAt).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      className={`bg-white border-2 border-slate-900 rounded-lg p-5 text-slate-900 shadow-sm flex flex-col justify-between relative ${className}`}
      style={{
        maxWidth: isPrintView ? '100mm' : '420px',
        minHeight: isPrintView ? '140mm' : 'auto'
      }}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest bg-slate-900 text-white px-2 py-0.5 rounded">
              PALLET TAG
            </span>
            <span className="text-sm font-extrabold font-mono text-slate-900 bg-amber-200 px-2.5 py-0.5 rounded border border-slate-900">
              #{record.nomorPallet || 'PALLET'}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-600 font-mono">
            #{record.batchId.slice(-6)}
          </span>
        </div>

        {/* Big Bin Location Section with QR Code */}
        <div className="bg-slate-100 border-2 border-slate-900 rounded p-2.5 mb-3 flex items-center justify-between gap-3">
          <div className="flex-1 text-center">
            <div className="text-[11px] font-bold tracking-wider text-slate-700 uppercase flex items-center justify-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              LOKASI BIN GUDANG
            </div>
            <div className="text-3xl font-black tracking-widest font-mono text-slate-950 mt-0.5">
              {record.lokasiBin || '5A.1'}
            </div>
          </div>

          <div className="shrink-0 bg-white p-1 rounded border border-slate-300">
            <QrCodeRenderer
              value={
                typeof window !== 'undefined'
                  ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(
                      record.lokasiBin || '5A.1'
                    )}`
                  : `?bin=${record.lokasiBin || '5A.1'}`
              }
              size={64}
              showLabel={false}
              className="border-0 shadow-none p-0"
            />
          </div>
        </div>

        {/* Item Details: Kode Item & Nama Barang */}
        <div className="mb-3 bg-slate-50 border border-slate-200 p-2.5 rounded">
          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
            <span className="text-slate-500 font-semibold uppercase flex items-center gap-1">
              <Tag className="w-3 h-3 text-slate-400" /> KODE ITEM:
            </span>
            <span className="font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
              {record.kodeItem || '-'}
            </span>
          </div>
          <div className="text-base font-black text-slate-950 leading-snug">
            {record.namaBarang}
          </div>
        </div>

        {/* Qty & Unit */}
        <div className="grid grid-cols-2 gap-2 border-y border-slate-300 py-2.5 mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
              <Layers className="w-3 h-3 text-slate-400" /> QTY DALAM PALLET
            </div>
            <div className="text-2xl font-black text-slate-950 font-mono tabular-nums">
              {record.qtyPallet.toLocaleString('id-ID')}{' '}
              <span className="text-sm font-bold text-slate-700">{record.unit}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> TANGGAL INPUT
            </div>
            <div className="text-xs font-semibold text-slate-800 font-mono mt-1">
              {formattedDate}
            </div>
          </div>
        </div>

        {/* Batch Range */}
        <div className="bg-slate-50 border border-slate-200 rounded p-2 mb-3">
          <div className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1 mb-1">
            <Hash className="w-3 h-3 text-slate-400" /> RENTANG BATCH NUMBER
          </div>
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-900">
            <div>
              <span className="text-[10px] font-normal text-slate-500 block">Batch Awal</span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300">
                {record.batchAwal}
              </span>
            </div>
            <span className="text-slate-400 font-normal">s/d</span>
            <div>
              <span className="text-[10px] font-normal text-slate-500 block text-right">Batch Akhir</span>
              <span className="bg-white px-2 py-0.5 rounded border border-slate-300">
                {record.batchAkhir}
              </span>
            </div>
          </div>
        </div>

        {record.keterangan && (
          <div className="text-[11px] text-slate-600 mb-2 italic">
            Catatan: {record.keterangan}
          </div>
        )}
      </div>

      {/* Barcode Section */}
      <div className="mt-2 pt-2 border-t-2 border-dashed border-slate-300">
        <BarcodeRenderer
          value={record.barcodeNumber}
          height={60}
          showText={true}
          textSize="base"
          className="bg-transparent p-0"
        />
      </div>

      {/* Card Actions (hidden in print view) */}
      {!isPrintView && (
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 no-print">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 py-1.5 px-2.5 rounded border border-slate-200 hover:bg-slate-50 transition-colors"
            title="Salin nomor barcode"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Barcode</span>
              </>
            )}
          </button>

          {onPrintSingle && (
            <button
              type="button"
              onClick={() => onPrintSingle(record)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 py-1.5 px-3 rounded shadow-sm transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Label</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
