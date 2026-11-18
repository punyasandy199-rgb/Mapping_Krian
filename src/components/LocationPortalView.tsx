import React, { useState, useMemo } from 'react';
import {
  MasterWarehouse,
  WarehouseLocationGroup,
  WAREHOUSE_LOCATION_GROUPS,
  PalletRecord,
  getWarehouseRackSlots
} from '../types/warehouse';
import {
  Boxes,
  MapPin,
  Wrench,
  ArrowRight,
  ArrowLeft,
  Cloud,
  Sun,
  Moon,
  X,
  AlertTriangle,
  Building2,
  LayoutGrid,
  Settings2,
  FileText
} from 'lucide-react';

interface LocationPortalViewProps {
  masterWarehouses: MasterWarehouse[];
  selectedLocationGroup: WarehouseLocationGroup | null;
  onSelectLocationGroup: (group: WarehouseLocationGroup | null) => void;
  onSelectWarehouse: (warehouse: MasterWarehouse) => void;
  onOpenSuratJalan: () => void;
  onOpenWarehouseManagement: () => void;
  records: PalletRecord[];
  totalSuratJalan: number;
  isCloudConnected: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

type MaintenanceTarget = {
  code: string;
  name: string;
  description: string;
} | null;

function isRecordInWarehouse(record: PalletRecord, wh: MasterWarehouse): boolean {
  const prefix = (record.lokasiBin || '').trim().toUpperCase().split('.')[0];
  const left = (wh.rackLeftPrefix || '').trim().toUpperCase();
  const right = (wh.rackRightPrefix || '').trim().toUpperCase();
  return Boolean(prefix && (prefix === left || prefix === right));
}

export const LocationPortalView: React.FC<LocationPortalViewProps> = ({
  masterWarehouses,
  selectedLocationGroup,
  onSelectLocationGroup,
  onSelectWarehouse,
  onOpenSuratJalan,
  onOpenWarehouseManagement,
  records,
  totalSuratJalan,
  isCloudConnected,
  isDarkMode,
  onToggleDarkMode
}) => {
  const [maintenanceModal, setMaintenanceModal] = useState<MaintenanceTarget>(null);

  const groupMeta: Record<
    WarehouseLocationGroup,
    { defaultDetail: string; maintenanceDesc: string }
  > = {
    'SJA 3': {
      defaultDetail: 'Area Produksi & Gudang SJA 3 (Menyusul)',
      maintenanceDesc:
        'Modul Monitoring Produk IC untuk lokasi SJA 3 saat ini masih dalam tahap pemeliharaan dan integrasi gudang (Under Maintenance). Anda dapat menambahkan atau mengaktifkan sub-gudang SJA 3 melalui User Management → Tab Gudang.'
    },
    'Gd. 137': {
      defaultDetail: 'Area Gudang 137 (Menyusul)',
      maintenanceDesc:
        'Modul Monitoring Produk IC untuk lokasi Gd. 137 saat ini masih dalam tahap pemeliharaan dan penyesuaian sistem (Under Maintenance). Anda dapat menambahkan atau mengaktifkan sub-gudang Gd. 137 melalui User Management → Tab Gudang.'
    },
    'Gd. KRIAN': {
      defaultDetail: 'Gudang 05 & Gudang 06 · Area Krian',
      maintenanceDesc:
        'Lokasi Gd. KRIAN saat ini belum memiliki sub-gudang aktif.'
    }
  };

  // Hitung statistik live per warehouse
  const warehouseStatsMap = useMemo(() => {
    const map = new Map<
      string,
      { activePallets: number; totalBoxes: number; activeBins: number }
    >();
    masterWarehouses.forEach((wh) => {
      const whRecords = records.filter(
        (r) => r.status !== 'OUT' && isRecordInWarehouse(r, wh)
      );
      const activeBins = new Set(
        whRecords.map((r) => (r.lokasiBin || '').trim().toUpperCase())
      ).size;
      const totalBoxes = whRecords.reduce(
        (sum, r) => sum + (Number(r.qtyPallet) || 0),
        0
      );
      map.set(wh.id, {
        activePallets: whRecords.length,
        totalBoxes,
        activeBins
      });
    });
    return map;
  }, [masterWarehouses, records]);

  // Warehouses untuk Level 2 saat lokasi dipilih
  const selectedGroupWarehouses = useMemo(() => {
    if (!selectedLocationGroup) return [];
    return masterWarehouses.filter(
      (wh) => wh.locationGroup === selectedLocationGroup
    );
  }, [masterWarehouses, selectedLocationGroup]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Clean Single-Row Top Bar */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 sm:gap-8">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Boxes className="w-5 h-5" />
            </div>
            <span className="text-base font-extrabold tracking-tight text-slate-950 dark:text-white">
              PalletTrack
            </span>
          </div>

          {/* Zone 2: Clean Inline Context Text */}
          <div className="hidden md:flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            <span>PT. Santos Jaya Abadi</span>
            <span aria-hidden="true">·</span>
            <span>Warehouse Management</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {isCloudConnected ? 'Cloud Sync Aktif' : 'Menyambungkan Cloud'}
            </span>
          </div>

          {/* Zone 3: Quick Master Gudang & Theme Control */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenWarehouseManagement}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Tambah atau Kelola Data Gudang di User Management"
            >
              <Settings2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Kelola Gudang</span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Ganti Mode Gelap / Terang"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Mode Terang</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Mode Gelap</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Centered Portal Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10 sm:py-14">
        {!selectedLocationGroup ? (
          /* -------------------------------------------------------------- */
          /* LEVEL 1: PORTAL UTAMA (SJA 3 / Gd. 137 / Gd. KRIAN)            */
          /* -------------------------------------------------------------- */
          <div className="w-full max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
              <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 tracking-wide mb-2">
                Portal Sistem Gudang · Pilih Lokasi Operasional
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-slate-950 dark:text-white leading-tight [text-wrap:balance]">
                Monitoring Produk IC — SJA 3
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Pilih lokasi gudang di bawah ini untuk melihat mapping sub-gudang, denah rak Bin, input pallet, dan penerbitan surat jalan.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-7 items-stretch">
              {WAREHOUSE_LOCATION_GROUPS.map((group) => {
                const groupWarehouses = masterWarehouses.filter(
                  (w) => w.locationGroup === group
                );
                const activeSubWarehouses = groupWarehouses.filter(
                  (w) => w.status === 'ACTIVE'
                );
                const isActive = activeSubWarehouses.length > 0;

                if (isActive) {
                  const groupRecordsCount = records.filter((r) =>
                    groupWarehouses.some((wh) => isRecordInWarehouse(r, wh))
                  ).length;
                  const groupActiveBinsCount = new Set(
                    records
                      .filter(
                        (r) =>
                          r.status !== 'OUT' &&
                          groupWarehouses.some((wh) => isRecordInWarehouse(r, wh))
                      )
                      .map((r) => (r.lokasiBin || '').toUpperCase())
                  ).size;

                  return (
                    <button
                      key={group}
                      type="button"
                      onClick={() => onSelectLocationGroup(group)}
                      className="group relative text-left rounded-2xl p-6 sm:p-7 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-700 text-white border border-blue-500/80 shadow-xl shadow-blue-600/20 hover:shadow-2xl hover:shadow-blue-600/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between min-h-[235px] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-5">
                          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-blue-100 whitespace-nowrap">
                            {activeSubWarehouses.length} Gudang Aktif
                          </span>
                        </div>

                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                          {group}
                        </h2>
                        <p className="text-sm font-semibold text-blue-100 mt-1">
                          Location
                        </p>
                        <p className="text-xs text-blue-100/90 mt-2">
                          {activeSubWarehouses.map((w) => w.namaGudang).join(' · ')}
                        </p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/20 flex items-center justify-between gap-2">
                        <div className="text-xs font-mono tabular-nums text-blue-50">
                          {groupRecordsCount} Data · {groupActiveBinsCount} Bin · {totalSuratJalan} SJ
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
                          <span>Buka Lokasi Bin</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </button>
                  );
                }

                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() =>
                      setMaintenanceModal({
                        code: group,
                        name: groupMeta[group].defaultDetail,
                        description: groupMeta[group].maintenanceDesc
                      })
                    }
                    className="group relative text-left rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between min-h-[235px] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-5">
                        <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/70 flex items-center justify-center text-amber-600 dark:text-amber-400">
                          <Wrench className="w-5 h-5" />
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Under Maintenance</span>
                        </span>
                      </div>

                      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        {group}
                      </h2>
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">
                        Location
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                        {groupMeta[group].defaultDetail}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      <span>Dalam Pemeliharaan Sistem</span>
                      <span className="text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                        Lihat Info
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Akses Langsung Penerbitan Surat Jalan Manual di Bawah 3 Kotak Gudang */}
            <div className="mt-6 sm:mt-8">
              <button
                type="button"
                onClick={onOpenSuratJalan}
                className="group w-full rounded-2xl px-6 py-4 sm:py-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
              >
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-950 dark:text-white text-center">
                  Penerbitan Surat Jalan Manual
                </h2>
                <ArrowRight className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform shrink-0" />
              </button>
            </div>
          </div>
        ) : (
          /* -------------------------------------------------------------- */
          /* LEVEL 2: MAPPING SUB-LOCATION GUDANG (GUDANG 05, GUDANG 06...) */
          /* -------------------------------------------------------------- */
          <div className="w-full max-w-5xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
              <button
                type="button"
                onClick={() => onSelectLocationGroup(null)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-xs transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Kembali ke Portal Lokasi (SJA 3)</span>
              </button>

              <button
                type="button"
                onClick={onOpenWarehouseManagement}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                <Building2 className="w-4 h-4" />
                <span>+ Tambah / Atur Gudang</span>
              </button>
            </div>

            <div className="text-center max-w-2xl mx-auto mb-10">
              <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 tracking-wide mb-2">
                Location: {selectedLocationGroup} · Mapping Area Gudang
              </p>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white leading-tight [text-wrap:balance]">
                Pilih Sub-Lokasi {selectedLocationGroup}
              </h1>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
                Klik salah satu gudang di bawah untuk langsung menampilkan denah &amp; peta lokasi Bin serta operasional pallet gudang tersebut.
              </p>
            </div>

            {selectedGroupWarehouses.length === 0 ? (
              <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
                <Building2 className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Belum ada gudang terdaftar di lokasi <strong>{selectedLocationGroup}</strong>.
                </p>
                <button
                  type="button"
                  onClick={onOpenWarehouseManagement}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Settings2 className="w-4 h-4" />
                  <span>Tambah Gudang di User Management</span>
                </button>
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 ${
                  selectedGroupWarehouses.length === 1
                    ? 'max-w-md mx-auto'
                    : selectedGroupWarehouses.length === 2
                    ? 'md:grid-cols-2 max-w-4xl mx-auto'
                    : 'md:grid-cols-3'
                } gap-6 items-stretch`}
              >
                {selectedGroupWarehouses.map((wh) => {
                  const rackCfg = getWarehouseRackSlots(wh);
                  const stats = warehouseStatsMap.get(wh.id) || {
                    activePallets: 0,
                    totalBoxes: 0,
                    activeBins: 0
                  };
                  const isWhActive = wh.status === 'ACTIVE';
                  const isGudang6 =
                    wh.namaGudang.toLowerCase().includes('6') ||
                    rackCfg.leftPrefix.startsWith('6');

                  if (!isWhActive) {
                    return (
                      <button
                        key={wh.id}
                        type="button"
                        onClick={() =>
                          setMaintenanceModal({
                            code: `${wh.locationGroup} — ${wh.namaGudang}`,
                            name: wh.kodeGudang,
                            description:
                              wh.keterangan ||
                              `Area ${wh.namaGudang} saat ini berstatus Under Maintenance (Menyusul).`
                          })
                        }
                        className="group text-left rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between min-h-[240px] cursor-pointer"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-5">
                            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 flex items-center justify-center text-amber-600">
                              <Wrench className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                              Under Maintenance
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-400">
                            {wh.kodeGudang}
                          </span>
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-0.5">
                            {wh.namaGudang}
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {wh.subtitle || `Rak ${rackCfg.leftPrefix} & ${rackCfg.rightPrefix}`}
                          </p>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-amber-700 dark:text-amber-400">
                          <span>Status: Menyusul</span>
                          <span>Lihat Info</span>
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={wh.id}
                      type="button"
                      onClick={() => onSelectWarehouse(wh)}
                      className={`group relative text-left rounded-2xl p-6 sm:p-7 text-white shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between min-h-[250px] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400 ${
                        isGudang6
                          ? 'bg-gradient-to-br from-indigo-600 via-blue-600 to-blue-700 border border-indigo-400/70 shadow-indigo-600/20'
                          : 'bg-gradient-to-br from-blue-600 via-blue-600 to-sky-700 border border-blue-400/70 shadow-blue-600/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-5">
                          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
                            <LayoutGrid className="w-5 h-5 text-white" />
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-white/15 border border-white/25 text-xs font-mono font-bold text-white">
                            {wh.kodeGudang}
                          </span>
                        </div>

                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                          {wh.namaGudang}
                        </h2>
                        <p className="text-sm font-semibold text-blue-100 mt-1">
                          Sub Location · {wh.locationGroup}
                        </p>
                        <p className="text-xs text-blue-100/90 mt-2">
                          {wh.subtitle ||
                            `Mapping Rak ${rackCfg.leftPrefix} (1–${rackCfg.leftCount}) & ${rackCfg.rightPrefix} (1–${rackCfg.rightCount})`}
                        </p>

                        {/* Mini Visual Preview Strip of Left & Right Racks */}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-white/12 border border-white/20 px-3 py-2">
                            <span className="text-[10px] uppercase tracking-wider text-blue-100 block font-bold">
                              Rak Kiri
                            </span>
                            <span className="text-xs font-mono font-extrabold text-white">
                              {rackCfg.leftPrefix}.1 – {rackCfg.leftPrefix}.{rackCfg.leftCount}
                            </span>
                          </div>
                          <div className="rounded-xl bg-white/12 border border-white/20 px-3 py-2">
                            <span className="text-[10px] uppercase tracking-wider text-blue-100 block font-bold">
                              Rak Kanan
                            </span>
                            <span className="text-xs font-mono font-extrabold text-white">
                              {rackCfg.rightPrefix}.1 – {rackCfg.rightPrefix}.{rackCfg.rightCount}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 pt-4 border-t border-white/20 flex items-center justify-between gap-2">
                        <div className="text-xs font-mono tabular-nums text-blue-50">
                          {stats.activePallets} Pallet · {stats.totalBoxes} Box · {stats.activeBins} Bin
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
                          <span>{isGudang6 ? 'Buka Peta Gudang 6' : `Buka Denah ${wh.namaGudang}`}</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] py-3.5 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>PT. Santos Jaya Abadi · Monitoring Produk IC — SJA 3</span>
          <span>
            {selectedLocationGroup
              ? `Mapping ${selectedLocationGroup} · Klik gudang untuk melihat denah & peta Bin`
              : 'Pilih Gd. KRIAN untuk langsung membuka lokasi Bin (Gudang 05, Gudang 06, dst.)'}
          </span>
        </div>
      </footer>

      {/* Under Maintenance Notice Modal */}
      {maintenanceModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          onClick={() => setMaintenanceModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-950 dark:text-white">
                    {maintenanceModal.code} — Under Maintenance
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {maintenanceModal.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {maintenanceModal.description}
            </p>

            <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMaintenanceModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setMaintenanceModal(null);
                  onOpenWarehouseManagement();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Atur di Master Gudang</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMaintenanceModal(null);
                  onSelectLocationGroup('Gd. KRIAN');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <span>Buka Gd. KRIAN</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
