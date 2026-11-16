import React, { useState } from 'react';
import {
  Boxes,
  MapPin,
  Wrench,
  ArrowRight,
  Cloud,
  Sun,
  Moon,
  X,
  AlertTriangle
} from 'lucide-react';

interface LocationPortalViewProps {
  onSelectLocation: (location: 'GD_KRIAN') => void;
  totalRecords: number;
  activeBinsCount: number;
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

export const LocationPortalView: React.FC<LocationPortalViewProps> = ({
  onSelectLocation,
  totalRecords,
  activeBinsCount,
  totalSuratJalan,
  isCloudConnected,
  isDarkMode,
  onToggleDarkMode
}) => {
  const [maintenanceModal, setMaintenanceModal] = useState<MaintenanceTarget>(null);

  const locations = [
    {
      id: 'SJA_3',
      title: 'SJA 3',
      subtitle: 'Location',
      status: 'maintenance' as const,
      detail: 'Area Produksi & Gudang SJA 3',
      maintenanceDesc:
        'Modul Monitoring Produk IC untuk lokasi SJA 3 saat ini masih dalam tahap pemeliharaan dan integrasi data (Under Maintenance).'
    },
    {
      id: 'GD_137',
      title: 'Gd. 137',
      subtitle: 'Location',
      status: 'maintenance' as const,
      detail: 'Area Gudang 137',
      maintenanceDesc:
        'Modul Monitoring Produk IC untuk lokasi Gd. 137 saat ini masih dalam tahap pemeliharaan dan penyesuaian sistem (Under Maintenance).'
    },
    {
      id: 'GD_KRIAN',
      title: 'Gd. KRIAN',
      subtitle: 'Location',
      status: 'active' as const,
      detail: 'Gudang 5 · Sukodono & Krian'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Clean Single-Row Top Bar (3 zones) */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] px-4 sm:px-8 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
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

          {/* Zone 3: Theme Control */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Ganti Mode Gelap / Terang"
            >
              {isDarkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mode Terang</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Mode Gelap</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Centered Portal Stage */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10 sm:py-16">
        <div className="w-full max-w-5xl mx-auto">
          {/* Hero Heading Block */}
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
            <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 tracking-wide mb-2">
              Portal Sistem Gudang · Pilih Lokasi Operasional
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight text-slate-950 dark:text-white leading-tight [text-wrap:balance]">
              Monitoring Produk IC — SJA 3
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">
              Pilih lokasi gudang di bawah ini untuk masuk ke sistem manajemen pallet, barcode inbound, denah rak bin, dan penerbitan surat jalan.
            </p>
          </div>

          {/* 3 Warehouse Location Tiles */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-7 items-stretch">
            {locations.map((loc) => {
              const isActive = loc.status === 'active';

              if (isActive) {
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => onSelectLocation('GD_KRIAN')}
                    className="group relative text-left rounded-2xl p-6 sm:p-7 bg-gradient-to-br from-blue-600 via-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-700 text-white border border-blue-500/80 shadow-xl shadow-blue-600/20 hover:shadow-2xl hover:shadow-blue-600/30 hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between min-h-[230px] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-5">
                        <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center">
                          <MapPin className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-blue-100 whitespace-nowrap">
                          Lokasi Aktif
                        </span>
                      </div>

                      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                        {loc.title}
                      </h2>
                      <p className="text-sm font-semibold text-blue-100 mt-1">
                        {loc.subtitle}
                      </p>
                      <p className="text-xs text-blue-100/90 mt-2">
                        {loc.detail}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-white/20 flex items-center justify-between gap-2">
                      <div className="text-xs font-mono tabular-nums text-blue-50">
                        {totalRecords} Data · {activeBinsCount} Bin · {totalSuratJalan} SJ
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white group-hover:translate-x-0.5 transition-transform whitespace-nowrap shrink-0">
                        <span>Masuk</span>
                        <ArrowRight className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() =>
                    setMaintenanceModal({
                      code: loc.title,
                      name: loc.detail,
                      description: loc.maintenanceDesc
                    })
                  }
                  className="group relative text-left rounded-2xl p-6 sm:p-7 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between min-h-[230px] cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-400"
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
                      {loc.title}
                    </h2>
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-1">
                      {loc.subtitle}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      {loc.detail}
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
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f141c] py-3.5 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>PT. Santos Jaya Abadi · Monitoring Produk IC — SJA 3</span>
          <span>Pilih Gd. KRIAN untuk akses penuh manajemen pallet &amp; surat jalan</span>
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
                  onSelectLocation('GD_KRIAN');
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
