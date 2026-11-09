import React, { useState } from 'react';
import { PalletRecord, GUDANG5_SLOTS_A, GUDANG5_SLOTS_B } from '../types/warehouse';
import { MapPin, Box, ArrowDown, Info } from 'lucide-react';

interface WarehouseBinViewerProps {
  records: PalletRecord[];
  onSelectBin?: (binCode: string) => void;
}

export const WarehouseBinViewer: React.FC<WarehouseBinViewerProps> = ({
  records,
  onSelectBin
}) => {
  const [selectedBin, setSelectedBin] = useState<string | null>(null);

  // Group records by bin location (e.g., "5A.1", "5A.2", "5B.1")
  const binMap = React.useMemo(() => {
    const map = new Map<string, PalletRecord[]>();
    records.forEach((record) => {
      const code = record.lokasiBin.toUpperCase();
      const existing = map.get(code) || [];
      existing.push(record);
      map.set(code, existing);
    });
    return map;
  }, [records]);

  // Count occupied slots
  const occupiedA = GUDANG5_SLOTS_A.filter((slot) => (binMap.get(slot)?.length || 0) > 0).length;
  const occupiedB = GUDANG5_SLOTS_B.filter((slot) => (binMap.get(slot)?.length || 0) > 0).length;

  const inspectedPallets = selectedBin ? binMap.get(selectedBin) : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 md:p-6 space-y-6">
      {/* Header Denah */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Denah Tata Letak Bin Gudang 5
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Sisi Kiri: 8 Slot (5A.1–5A.8) · Tengah: Area Kosong / Lorong · Sisi Kanan: 4 Slot (5B.1–5B.4)
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Kiri (5A): <strong className="text-blue-600">{occupiedA}/8</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Kanan (5B): <strong className="text-blue-600">{occupiedB}/4</strong>
          </span>
        </div>
      </div>

      {/* Visual Denah Layout */}
      <div className="bg-slate-50 dark:bg-slate-950/70 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
        {/* Layout Column Headers */}
        <div className="grid grid-cols-12 gap-3 mb-3 text-center text-xs font-bold uppercase tracking-wider">
          <div className="col-span-5 sm:col-span-5 bg-blue-600 text-white py-2 px-3 rounded-lg shadow-xs flex items-center justify-center gap-1.5">
            <span>SISI KIRI (5A) - 8 SLOT PALLET</span>
            <ArrowDown className="w-3.5 h-3.5 opacity-80" />
          </div>

          <div className="col-span-2 sm:col-span-2 bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-dashed border-amber-400 dark:border-amber-700 py-2 px-1 rounded-lg text-[10px] sm:text-xs flex items-center justify-center">
            <span>BAGIAN TENGAH (KOSONG)</span>
          </div>

          <div className="col-span-5 sm:col-span-5 bg-slate-800 text-white py-2 px-3 rounded-lg shadow-xs flex items-center justify-center gap-1.5">
            <span>SISI KANAN (5B) - 4 SLOT PALLET</span>
            <ArrowDown className="w-3.5 h-3.5 opacity-80" />
          </div>
        </div>

        {/* 8 Rows of Vertical Layout Grid */}
        <div className="space-y-3">
          {GUDANG5_SLOTS_A.map((slotA, index) => {
            const rowNumber = index + 1;
            const slotB = GUDANG5_SLOTS_B[index] || null; // 5B.1 to 5B.4 exist for index 0..3

            const itemsA = binMap.get(slotA) || [];
            const isFilledA = itemsA.length > 0;
            const isSelectedA = selectedBin === slotA;

            const itemsB = slotB ? binMap.get(slotB) || [] : [];
            const isFilledB = itemsB.length > 0;
            const isSelectedB = selectedBin === slotB;

            return (
              <div key={rowNumber} className="grid grid-cols-12 gap-3 items-stretch">
                {/* 1. SISI KIRI (5A.1 s/d 5A.8) */}
                <div
                  onClick={() => {
                    setSelectedBin(slotA);
                    if (onSelectBin) onSelectBin(slotA);
                  }}
                  className={`col-span-5 sm:col-span-5 p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelectedA
                      ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50 dark:bg-blue-950/60'
                      : isFilledA
                      ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 hover:border-emerald-400'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-black text-sm text-slate-900 dark:text-white">
                      {slotA}
                    </span>
                    {isFilledA ? (
                      <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded flex items-center gap-1">
                        <Box className="w-3 h-3" /> {itemsA.length} Item
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Slot Kosong</span>
                    )}
                  </div>

                  {isFilledA ? (
                    <div className="mt-1.5 pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 rounded text-[10px]">
                          {itemsA[0].nomorPallet}
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {itemsA[0].namaBarang}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Qty: {itemsA.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0)} Box
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic mt-1">
                      Klik untuk alokasi/lihat
                    </div>
                  )}
                </div>

                {/* 2. BAGIAN TENGAH (KOSONG - LORONG FORKLIFT) */}
                <div className="col-span-2 sm:col-span-2 flex flex-col items-center justify-center p-2 rounded-lg bg-amber-50/40 dark:bg-amber-950/20 border border-dashed border-amber-300 dark:border-amber-900/60 text-center select-none">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-600 mb-1" />
                  <span className="text-[9px] font-mono text-amber-800 dark:text-amber-400 font-semibold tracking-tighter sm:tracking-normal">
                    LORONG KOSONG
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-600 mt-1" />
                </div>

                {/* 3. SISI KANAN (5B.1 s/d 5B.4 atau KOSONG jika baris 5-8) */}
                {slotB ? (
                  <div
                    onClick={() => {
                      setSelectedBin(slotB);
                      if (onSelectBin) onSelectBin(slotB);
                    }}
                    className={`col-span-5 sm:col-span-5 p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelectedB
                        ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50 dark:bg-blue-950/60'
                        : isFilledB
                        ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 hover:border-emerald-400'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="font-black text-sm text-slate-900 dark:text-white">
                        {slotB}
                      </span>
                      {isFilledB ? (
                        <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded flex items-center gap-1">
                          <Box className="w-3 h-3" /> {itemsB.length} Item
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Slot Kosong</span>
                      )}
                    </div>

                    {isFilledB ? (
                      <div className="mt-1.5 pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950 px-1.5 py-0.2 rounded text-[10px]">
                            {itemsB[0].nomorPallet}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {itemsB[0].namaBarang}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          Qty: {itemsB.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0)} Box
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-400 italic mt-1">
                        Klik untuk alokasi/lihat
                      </div>
                    )}
                  </div>
                ) : (
                  // Baris 5 sampai 8 Sisi Kanan adalah Area Kosong (sesuai instruksi: sisi kanan hanya ada 4 pallet)
                  <div className="col-span-5 sm:col-span-5 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/30 flex items-center justify-center text-slate-400 text-center select-none">
                    <span className="text-[11px] font-mono italic">
                      Area Kosong Bebas Rak (Sisi Kanan)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Slot Quick Preview */}
      {selectedBin && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                Detail Slot Bin: {selectedBin}
              </span>
              <span className="text-slate-500">
                ({inspectedPallets ? `${inspectedPallets.length} Item Tersimpan` : 'Kosong'})
              </span>
            </div>
            {onSelectBin && (
              <button
                type="button"
                onClick={() => onSelectBin(selectedBin)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Gunakan Bin Ini di Form Input →
              </button>
            )}
          </div>

          {inspectedPallets && inspectedPallets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-2">
              {inspectedPallets.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-900">
                      {item.nomorPallet}
                    </span>
                    <span className="font-mono text-blue-600 font-bold text-[11px]">
                      {item.kodeItem}
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {item.namaBarang}
                  </div>
                  <div className="flex items-center justify-between text-slate-500 mt-1 font-mono text-[11px]">
                    <span>Qty: {item.qtyPallet} {item.unit}</span>
                    <span>Batch: {item.batchAwal} - {item.batchAkhir}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-xs italic">
              Slot {selectedBin} saat ini kosong dan siap diisi.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
