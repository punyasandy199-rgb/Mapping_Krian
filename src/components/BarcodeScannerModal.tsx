import React, { useState } from 'react';
import { PalletRecord } from '../types/warehouse';
import { Barcode, Search, X, MapPin, CheckCircle2, AlertCircle, Box, Layers, Tag } from 'lucide-react';
import { BarcodeRenderer } from './BarcodeRenderer';

interface BarcodeScannerModalProps {
  records: PalletRecord[];
  isOpen: boolean;
  onClose: () => void;
  onOpenBinDetail?: (binCode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  records,
  isOpen,
  onClose,
  onOpenBinDetail
}) => {
  const [query, setQuery] = useState('');
  const [foundBarcodeRecord, setFoundBarcodeRecord] = useState<PalletRecord | null>(null);
  const [foundBinItems, setFoundBinItems] = useState<{ binCode: string; items: PalletRecord[] } | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    let cleanQuery = query.trim().toUpperCase();

    // If query is a URL with ?bin=...
    if (cleanQuery.includes('BIN=')) {
      const parts = cleanQuery.split('BIN=');
      if (parts[1]) {
        cleanQuery = decodeURIComponent(parts[1].split('&')[0]);
      }
    }

    // 1. Check if matches Bin Location
    const matchingBinItems = records.filter(
      (r) => r.lokasiBin.toUpperCase() === cleanQuery
    );

    if (matchingBinItems.length > 0) {
      setFoundBinItems({ binCode: cleanQuery, items: matchingBinItems });
      setFoundBarcodeRecord(null);
      setHasSearched(true);
      return;
    }

    // 2. Check if matches Barcode or Pallet Number
    const matchBarcode = records.find(
      (r) =>
        r.barcodeNumber.toUpperCase() === cleanQuery ||
        r.barcodeNumber.toUpperCase().includes(cleanQuery) ||
        (r.nomorPallet && r.nomorPallet.toUpperCase() === cleanQuery)
    );

    if (matchBarcode) {
      setFoundBarcodeRecord(matchBarcode);
      setFoundBinItems(null);
      setHasSearched(true);
      return;
    }

    setFoundBarcodeRecord(null);
    setFoundBinItems(null);
    setHasSearched(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-slate-900 dark:text-slate-100 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-base">Cek & Scan Barcode / QR Bin</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">
            Scan atau Ketik No Barcode (cth: PLT-*) atau Kode Bin (cth: 5A.1)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHasSearched(false);
              }}
              placeholder="Tempel barcode atau kode bin (5A.1)..."
              className="flex-1 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-sm"
            >
              Cari / Cek
            </button>
          </div>
        </form>

        {/* Search Results */}
        {hasSearched && (
          <div className="mt-4 flex-1 overflow-y-auto">
            {/* If matches Bin: Show list of items in that Bin */}
            {foundBinItems && (
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-300 font-bold">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span>Daftar Muatan di Bin {foundBinItems.binCode}</span>
                  </div>
                  {onOpenBinDetail && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenBinDetail(foundBinItems.binCode);
                      }}
                      className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Buka Tampilan Penuh →
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400">
                  Total {foundBinItems.items.length} item tersimpan di lokasi rak ini:
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {foundBinItems.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                          {item.nomorPallet}
                        </span>
                        <span className="font-mono text-blue-600 dark:text-blue-400 font-bold text-[11px]">
                          {item.kodeItem}
                        </span>
                      </div>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {item.namaBarang}
                      </div>
                      <div className="flex items-center justify-between text-slate-500 font-mono text-[10px] mt-1">
                        <span>Qty: {item.qtyPallet} {item.unit}</span>
                        <span>Batch: {item.batchAwal}-{item.batchAkhir}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* If matches Single Pallet Barcode */}
            {foundBarcodeRecord && (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Pallet Ditemukan!</span>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Nomor Pallet:</span>
                    <span className="font-mono font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded">
                      {foundBarcodeRecord.nomorPallet}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Lokasi Bin:</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded border border-blue-200">
                      {foundBarcodeRecord.lokasiBin}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Kode Item:</span>
                    <span className="font-mono font-bold text-blue-600">
                      {foundBarcodeRecord.kodeItem}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Nama Barang:</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-right">
                      {foundBarcodeRecord.namaBarang}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Qty Pallet:</span>
                    <span className="font-mono font-bold">
                      {foundBarcodeRecord.qtyPallet} {foundBarcodeRecord.unit}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Batch Range:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {foundBarcodeRecord.batchAwal} - {foundBarcodeRecord.batchAkhir}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex justify-center">
                  <BarcodeRenderer
                    value={foundBarcodeRecord.barcodeNumber}
                    height={44}
                    showText={true}
                    className="p-1 rounded bg-white"
                  />
                </div>
              </div>
            )}

            {!foundBinItems && !foundBarcodeRecord && (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-center">
                <AlertCircle className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                <span className="font-semibold text-amber-900 dark:text-amber-200 block">
                  Data tidak ditemukan
                </span>
                <span className="text-amber-700 dark:text-amber-300 text-[11px]">
                  Tidak ada pallet atau lokasi bin yang cocok dengan &quot;{query}&quot;.
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
