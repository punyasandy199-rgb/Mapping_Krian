import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  PalletRecord,
  SuratJalanRecord,
  MasterItem,
  MasterWarehouse,
  DEFAULT_MASTER_WAREHOUSES
} from '../types/warehouse';
import { SheetsSyncMode } from '../services/firebase';
import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SPREADSHEET_URL,
  DEFAULT_SPREADSHEET_NAME,
  DEFAULT_PALLET_TAB_TITLE,
  SURAT_JALAN_TAB_TITLE,
  SURAT_JALAN_MANUAL_TAB_TITLE,
  REKAP_STOK_TAB_TITLE,
  SpreadsheetMetadata,
  SheetAuditReport,
  SyncAllResult,
  extractSpreadsheetId,
  fetchSpreadsheetMetadata,
  readSheetValues,
  compareSystemWithSheetRows,
  generateAppsScriptCode,
  isValidAppsScriptUrl,
  isManualSuratJalan,
  pingAppsScriptBridge,
  readSheetValuesViaAppsScript
} from '../services/googleSheets';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  SearchCheck,
  UploadCloud,
  DownloadCloud,
  LogOut,
  Zap,
  ShieldAlert,
  BookOpen,
  Table2,
  X,
  ArrowRightLeft,
  Clock,
  Copy,
  Check,
  Webhook,
  Code2,
  Users,
  Save,
  KeyRound,
  Lock
} from 'lucide-react';

export interface SyncActivityLogItem {
  id: string;
  time: string;
  mode: 'Manual' | 'Otomatis' | 'Audit';
  summary: string;
  status: 'success' | 'error';
}

interface GoogleSheetsSyncViewProps {
  records: PalletRecord[];
  suratJalanHistory: SuratJalanRecord[];
  masterItems: MasterItem[];
  masterWarehouses?: MasterWarehouse[];
  syncMode: SheetsSyncMode;
  onChangeSyncMode: (mode: SheetsSyncMode) => void;
  appsScriptUrl: string;
  onChangeAppsScriptUrl: (url: string) => void;
  appsScriptSecret: string;
  onChangeAppsScriptSecret: (secret: string) => void;
  isBridgeSavedInCloud: boolean;
  onSaveBridgeSettings: (opts?: { autoSync24x7?: boolean }) => Promise<void>;
  googleUser: User | null;
  needsAuth: boolean;
  isLoggingIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  spreadsheetInput: string;
  onChangeSpreadsheetInput: (val: string) => void;
  selectedSheetTab: string;
  onChangeSelectedSheetTab: (tabTitle: string) => void;
  includeSuratJalanTab: boolean;
  onChangeIncludeSuratJalanTab: (val: boolean) => void;
  includeManualSjTab: boolean;
  onChangeIncludeManualSjTab: (val: boolean) => void;
  manualSjSpreadsheetInput: string;
  onChangeManualSjSpreadsheetInput: (val: string) => void;
  includeRekapTab: boolean;
  onChangeIncludeRekapTab: (val: boolean) => void;
  lockSheetReadOnly: boolean;
  onChangeLockSheetReadOnly: (val: boolean) => void;
  autoSyncEnabled: boolean;
  onEnableAutoSync: () => Promise<void>;
  onDisableAutoSync: () => Promise<void>;
  isSyncing: boolean;
  lastSyncResult: SyncAllResult | null;
  syncError: string | null;
  pendingSyncCount: number;
  activityLogs: SyncActivityLogItem[];
  onExecuteManualSync: (alsoEnableAutoSync?: boolean) => Promise<void>;
  onImportFromSheet: (extraRecords: PalletRecord[]) => Promise<void>;
}

type ConfirmAction =
  | { kind: 'manual_push' }
  | { kind: 'enable_auto_sync' }
  | { kind: 'import_extra'; records: PalletRecord[] }
  | null;

export const GoogleSheetsSyncView: React.FC<GoogleSheetsSyncViewProps> = ({
  records,
  suratJalanHistory,
  masterWarehouses = DEFAULT_MASTER_WAREHOUSES,
  syncMode,
  onChangeSyncMode,
  appsScriptUrl,
  onChangeAppsScriptUrl,
  appsScriptSecret,
  onChangeAppsScriptSecret,
  isBridgeSavedInCloud,
  onSaveBridgeSettings,
  googleUser,
  needsAuth,
  isLoggingIn,
  onGoogleSignIn,
  onGoogleSignOut,
  spreadsheetInput,
  onChangeSpreadsheetInput,
  selectedSheetTab,
  onChangeSelectedSheetTab,
  includeSuratJalanTab,
  onChangeIncludeSuratJalanTab,
  includeManualSjTab,
  onChangeIncludeManualSjTab,
  manualSjSpreadsheetInput,
  onChangeManualSjSpreadsheetInput,
  includeRekapTab,
  onChangeIncludeRekapTab,
  lockSheetReadOnly,
  onChangeLockSheetReadOnly,
  autoSyncEnabled,
  onEnableAutoSync,
  onDisableAutoSync,
  isSyncing,
  lastSyncResult,
  syncError,
  pendingSyncCount,
  activityLogs,
  onExecuteManualSync,
  onImportFromSheet
}) => {
  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [auditReport, setAuditReport] = useState<SheetAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditFilter, setAuditFilter] = useState<
    'all' | 'missing_in_sheet' | 'mismatch' | 'extra_in_sheet'
  >('all');

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [alsoEnableAutoAfterPush, setAlsoEnableAutoAfterPush] = useState<boolean>(true);
  const [isConfirmExecuting, setIsConfirmExecuting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [showScriptCode, setShowScriptCode] = useState(false);
  const [isSavingBridge, setIsSavingBridge] = useState(false);
  const [bridgeTestOk, setBridgeTestOk] = useState<string | null>(null);

  const activeSpreadsheetId = extractSpreadsheetId(spreadsheetInput);
  const activeSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/edit`;

  const manualSjCount = suratJalanHistory.filter((sj) => isManualSuratJalan(sj)).length;
  const palletSjCount = suratJalanHistory.length - manualSjCount;
  const manualSpreadsheetIdResolved = manualSjSpreadsheetInput.trim()
    ? extractSpreadsheetId(manualSjSpreadsheetInput)
    : '';
  const hasSeparateManualSpreadsheet = Boolean(
    manualSpreadsheetIdResolved && manualSpreadsheetIdResolved !== activeSpreadsheetId
  );
  const manualSpreadsheetUrlLink = manualSpreadsheetIdResolved
    ? `https://docs.google.com/spreadsheets/d/${manualSpreadsheetIdResolved}/edit`
    : '';

  const isBridgeMode = syncMode === 'apps_script';
  const hasValidBridgeUrl = isValidAppsScriptUrl(appsScriptUrl);
  const isConnectionReady = isBridgeMode ? hasValidBridgeUrl : !needsAuth;
  const needsBridgeV4Update =
    isBridgeMode &&
    hasValidBridgeUrl &&
    metadata !== null &&
    (metadata.bridgeVersion ?? 1) < 4;

  const generatedAppsScript = generateAppsScriptCode(appsScriptSecret);

  const showTempMessage = (msg: string) => {
    setLocalMessage(msg);
    setTimeout(() => setLocalMessage(null), 5000);
  };

  const handleLoadMetadata = async () => {
    setMetaError(null);
    setBridgeTestOk(null);
    setIsLoadingMeta(true);
    try {
      const meta = isBridgeMode
        ? await pingAppsScriptBridge(appsScriptUrl, appsScriptSecret)
        : await fetchSpreadsheetMetadata(activeSpreadsheetId);

      setMetadata(meta);
      const hasDataGbj = meta.sheets.some((s) => s.title === DEFAULT_PALLET_TAB_TITLE);
      if (
        hasDataGbj &&
        (!selectedSheetTab || /^sheet\s*1$/i.test(selectedSheetTab.trim()))
      ) {
        onChangeSelectedSheetTab(DEFAULT_PALLET_TAB_TITLE);
      } else if (
        meta.sheets.length > 0 &&
        !meta.sheets.some((s) => s.title === selectedSheetTab)
      ) {
        onChangeSelectedSheetTab(meta.sheets[0].title);
      }
      if (isBridgeMode) {
        setBridgeTestOk(
          `Terhubung ke "${meta.title}" (${meta.sheets.length} tab: ${meta.sheets
            .map((s) => s.title)
            .join(', ')})`
        );
      }
      showTempMessage(
        `Terhubung ke spreadsheet "${meta.title}" (${meta.sheets.length} tab terdeteksi).`
      );
    } catch (err: unknown) {
      setMetaError(
        err instanceof Error ? err.message : 'Gagal membaca metadata spreadsheet.'
      );
    } finally {
      setIsLoadingMeta(false);
    }
  };

  useEffect(() => {
    if (isBridgeMode) {
      if (hasValidBridgeUrl) {
        handleLoadMetadata().catch(() => {});
      }
    } else if (!needsAuth && activeSpreadsheetId) {
      handleLoadMetadata().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBridgeMode, hasValidBridgeUrl, needsAuth, activeSpreadsheetId]);

  const handleCopyAppsScript = async () => {
    try {
      await navigator.clipboard.writeText(generatedAppsScript);
      setIsCopiedCode(true);
      showTempMessage(
        'Kode Google Apps Script berhasil disalin. Silakan tempel di Data GBJ (new) → Ekstensi → Apps Script.'
      );
      setTimeout(() => setIsCopiedCode(false), 3000);
    } catch {
      setShowScriptCode(true);
    }
  };

  const handleSaveBridgeToCloud = async () => {
    setMetaError(null);
    if (!hasValidBridgeUrl) {
      setMetaError(
        'Masukkan URL Web App Google Apps Script yang valid (berakhiran "/exec") terlebih dahulu.'
      );
      return;
    }
    setIsSavingBridge(true);
    try {
      const meta = await pingAppsScriptBridge(appsScriptUrl, appsScriptSecret);
      setMetadata(meta);
      if (meta.sheets.length > 0 && !meta.sheets.some((s) => s.title === selectedSheetTab)) {
        onChangeSelectedSheetTab(meta.sheets[0].title);
      }
      setBridgeTestOk(
        `Terhubung ke "${meta.title}" (${meta.sheets.length} tab terdeteksi)`
      );
      await onSaveBridgeSettings({ autoSync24x7: true });
      showTempMessage(
        'URL Bridge Apps Script berhasil disimpan ke Cloud & Auto-Sync 24/7 langsung aktif untuk semua operator!'
      );
    } catch (err: unknown) {
      setMetaError(
        err instanceof Error ? err.message : 'Gagal menguji & menyimpan konfigurasi Bridge.'
      );
    } finally {
      setIsSavingBridge(false);
    }
  };

  const handleRunAudit = async () => {
    setMetaError(null);
    setIsAuditing(true);
    try {
      if (isBridgeMode) {
        let currentMeta = metadata;
        if (!currentMeta) {
          currentMeta = await pingAppsScriptBridge(appsScriptUrl, appsScriptSecret);
          setMetadata(currentMeta);
        }
        const preferredTab =
          selectedSheetTab && currentMeta.sheets.some((s) => s.title === selectedSheetTab)
            ? selectedSheetTab
            : currentMeta.sheets[0]?.title || '';
        const res = await readSheetValuesViaAppsScript(
          appsScriptUrl,
          appsScriptSecret,
          preferredTab
        );
        if (res.tabTitle && res.tabTitle !== selectedSheetTab) {
          onChangeSelectedSheetTab(res.tabTitle);
        }
        const report = compareSystemWithSheetRows(
          records,
          res.values,
          res.tabTitle,
          suratJalanHistory,
          masterWarehouses
        );
        setAuditReport(report);
      } else {
        let currentMeta = metadata;
        if (!currentMeta) {
          currentMeta = await fetchSpreadsheetMetadata(activeSpreadsheetId);
          setMetadata(currentMeta);
        }

        const tabToCheck =
          selectedSheetTab && currentMeta.sheets.some((s) => s.title === selectedSheetTab)
            ? selectedSheetTab
            : currentMeta.sheets[0]?.title || DEFAULT_PALLET_TAB_TITLE;

        if (tabToCheck !== selectedSheetTab) {
          onChangeSelectedSheetTab(tabToCheck);
        }

        const rows = await readSheetValues(activeSpreadsheetId, tabToCheck);
        const report = compareSystemWithSheetRows(
          records,
          rows,
          tabToCheck,
          suratJalanHistory,
          masterWarehouses
        );
        setAuditReport(report);
      }
    } catch (err: unknown) {
      setMetaError(
        err instanceof Error ? err.message : 'Gagal memeriksa isi Google Sheets.'
      );
    } finally {
      setIsAuditing(false);
    }
  };

  const handleConfirmProceed = async () => {
    if (!confirmAction) return;
    setIsConfirmExecuting(true);
    setMetaError(null);
    try {
      if (confirmAction.kind === 'manual_push') {
        await onExecuteManualSync(alsoEnableAutoAfterPush);
        setAuditReport(null);
      } else if (confirmAction.kind === 'enable_auto_sync') {
        await onEnableAutoSync();
        setAuditReport(null);
      } else if (confirmAction.kind === 'import_extra') {
        await onImportFromSheet(confirmAction.records);
        showTempMessage(
          `${confirmAction.records.length} baris dari Google Sheets berhasil ditambahkan ke sistem.`
        );
        setAuditReport(null);
      }
      setConfirmAction(null);
    } catch (err: unknown) {
      setMetaError(err instanceof Error ? err.message : 'Terjadi kesalahan saat eksekusi.');
      setConfirmAction(null);
    } finally {
      setIsConfirmExecuting(false);
    }
  };

  const targetSheetDisplay =
    selectedSheetTab || metadata?.sheets?.[0]?.title || 'Tab Utama (gid=0)';

  const affectedTabsSummary = [
    targetSheetDisplay,
    ...(includeSuratJalanTab ? [SURAT_JALAN_TAB_TITLE] : []),
    ...(includeManualSjTab
      ? [
          hasSeparateManualSpreadsheet
            ? `${SURAT_JALAN_MANUAL_TAB_TITLE} (Spreadsheet Terpisah)`
            : SURAT_JALAN_MANUAL_TAB_TITLE
        ]
      : []),
    ...(includeRekapTab ? [REKAP_STOK_TAB_TITLE] : [])
  ].join(', ');

  const filteredDiffs =
    auditReport?.diffs.filter((d) =>
      auditFilter === 'all' ? true : d.kind === auditFilter
    ) || [];

  return (
    <div className="space-y-6">
      {/* 1. HEADER & MODE SWITCHER CARD */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow-sm shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  Integrasi Langsung Google Sheets
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isConnectionReady
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConnectionReady ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {isBridgeMode
                    ? hasValidBridgeUrl
                      ? isBridgeSavedInCloud
                        ? 'Bridge 24/7 Aktif (Tanpa Login Operator)'
                        : 'Bridge Siap (Belum Disimpan ke Cloud)'
                      : 'Belum Pasang URL Bridge'
                    : !needsAuth
                    ? 'Akun Google Terhubung'
                    : 'Perlu Login Google'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Target Spreadsheet: <strong>{metadata?.title || DEFAULT_SPREADSHEET_NAME}</strong>{' '}
                &middot; Otomatis mencatat input pallet baru, edit stok, outbound, dan surat jalan.
              </p>
            </div>
          </div>

          <a
            href={activeSpreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 whitespace-nowrap shrink-0"
          >
            <span>Buka &ldquo;{metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Mode Selection Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChangeSyncMode('apps_script')}
            className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
              isBridgeMode
                ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 font-extrabold text-xs text-slate-900 dark:text-white">
                <Webhook className="w-4 h-4 text-emerald-600" />
                <span>Cara B: Bridge Apps Script 24/7</span>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white">
                Multi-User Tanpa Login
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Pemilik hanya pasang skrip <strong>1 kali</strong> di spreadsheet. Seluruh aktivitas
              operator dari HP/PC mana pun otomatis masuk spreadsheet{' '}
              <strong>tanpa wajib Login Google</strong>.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onChangeSyncMode('oauth')}
            className={`text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
              !isBridgeMode
                ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 shadow-xs'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2 font-extrabold text-xs text-slate-900 dark:text-white">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Cara A: Login Google Langsung (OAuth)</span>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                Sesi Browser
              </span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              Login langsung dengan akun Google pada perangkat ini untuk menulis/audit spreadsheet
              secara interaktif tanpa memasang Apps Script.
            </p>
          </button>
        </div>

        {/* Status Alerts */}
        {(metaError || syncError) && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-800 dark:text-red-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">Perhatian Koneksi Google Sheets:</div>
              <div>{metaError || syncError}</div>
            </div>
          </div>
        )}

        {localMessage && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{localMessage}</span>
          </div>
        )}

        {/* MODE B PANEL: APPS SCRIPT 24/7 SETUP */}
        {isBridgeMode ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-emerald-600" />
                  <span>Pengaturan Bridge 24/7 (Hanya Dilakukan Pemilik 1 Kali)</span>
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Setelah URL Web App disimpan ke Cloud, semua perangkat operator gudang otomatis
                  tersinkron tanpa login Google.
                </p>
              </div>
              {isBridgeSavedInCloud && hasValidBridgeUrl && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold border border-emerald-300 dark:border-emerald-800 self-start">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tersimpan di Cloud untuk Semua User</span>
                </span>
              )}
            </div>

            {needsBridgeV4Update && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-xs text-amber-950 dark:text-amber-200 space-y-1.5">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Pembaruan Apps Script Bridge (v4) Tersedia!</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Bridge Apps Script di spreadsheet Anda masih memakai versi lama (v
                  {metadata?.bridgeVersion ?? 1}). Klik{' '}
                  <strong>Salin Kode Apps Script</strong> di bawah, tempel ke editor Apps Script
                  lalu pilih <strong>Terapkan &rarr; Kelola deployment &rarr; Edit (ikon pensil)
                  &rarr; Versi baru &rarr; Terapkan</strong> agar tab{' '}
                  <strong>{SURAT_JALAN_MANUAL_TAB_TITLE}</strong> (SJ tanpa pilih pallet), tab{' '}
                  <strong>{DEFAULT_PALLET_TAB_TITLE}</strong>, serta{' '}
                  <strong>Kunci Sheet Read-Only</strong> dapat berjalan otomatis.
                </p>
              </div>
            )}

            {/* Step 1: Copy Apps Script Code */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Langkah 1: Salin Skrip &amp; Pasang di Spreadsheet &ldquo;
                  {DEFAULT_SPREADSHEET_NAME}&rdquo;
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScriptCode(!showScriptCode)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>{showScriptCode ? 'Sembunyikan Kode' : 'Lihat Kode'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAppsScript}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer"
                  >
                    {isCopiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kode Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode Apps Script</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 list-decimal pl-4">
                <li>
                  Buka file <strong>&ldquo;{DEFAULT_SPREADSHEET_NAME}&rdquo;</strong> di Google
                  Sheets, klik menu <strong>Ekstensi &rarr; Apps Script</strong>.
                </li>
                <li>
                  Hapus isi editor lama, <strong>Tempel (Paste)</strong> kode di atas, lalu tekan{' '}
                  <strong>Simpan (Ctrl+S)</strong>.
                </li>
                <li>
                  Klik <strong>Terapkan (Deploy) &rarr; Deployment baru</strong>, pilih jenis{' '}
                  <strong>Aplikasi web (Web app)</strong>.
                </li>
                <li>
                  Set <strong>Jalankan sebagai: Saya</strong> &amp;{' '}
                  <strong>Yang memiliki akses: Siapa saja (Anyone)</strong> &rarr; Terapkan &rarr;
                  Salin <strong>URL Aplikasi web</strong> (`/exec`).
                </li>
              </ol>

              {showScriptCode && (
                <pre className="p-3 rounded-xl bg-slate-950 text-emerald-300 text-[10px] font-mono overflow-x-auto max-h-60 border border-slate-800 leading-relaxed">
                  {generatedAppsScript}
                </pre>
              )}
            </div>

            {/* Step 2: URL & Secret Input + Save to Cloud */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-6 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Langkah 2: Tempel URL Web App Apps Script (`/exec`)
                </label>
                <input
                  type="url"
                  value={appsScriptUrl}
                  onChange={(e) => onChangeAppsScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="lg:col-span-3 space-y-1.5">
                <label className="flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span>Kode Keamanan Bridge</span>
                </label>
                <input
                  type="text"
                  value={appsScriptSecret}
                  onChange={(e) => onChangeAppsScriptSecret(e.target.value)}
                  placeholder="SJA-GBJ-2026"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="lg:col-span-3 flex gap-2">
                <button
                  type="button"
                  disabled={!hasValidBridgeUrl || isSavingBridge}
                  onClick={handleSaveBridgeToCloud}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingBridge ? 'Menyimpan...' : 'Tes & Simpan ke Cloud'}</span>
                </button>
              </div>
            </div>

            {bridgeTestOk && (
              <div className="p-2.5 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{bridgeTestOk}</span>
              </div>
            )}
          </div>
        ) : (
          /* MODE A PANEL: GOOGLE OAUTH LOGIN */
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="font-bold text-slate-800 dark:text-white">
                Autentikasi Akun Google Pribadi (Mode OAuth Browser)
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                Operator gudang tidak terkunci login ini; hanya perangkat yang ingin mengirim
                langsung tanpa Apps Script yang perlu masuk Google.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {needsAuth ? (
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={isLoggingIn}
                  className="gsi-material-button"
                >
                  <div className="gsi-material-button-state" />
                  <div className="gsi-material-button-content-wrapper">
                    <div className="gsi-material-button-icon">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        style={{ display: 'block' }}
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                        <path fill="none" d="M0 0h48v48H0z" />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isLoggingIn ? 'Menghubungkan...' : 'Sign in with Google'}
                    </span>
                  </div>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Akun: </span>
                    <strong className="text-slate-900 dark:text-white">
                      {googleUser?.email || googleUser?.displayName || 'Google Connected'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Ganti Akun / Keluar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {records.length > 0 && !lastSyncResult && isConnectionReady && (
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-950 dark:text-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-extrabold text-blue-900 dark:text-cyan-300">
                {records.length} Data Pallet &amp; {suratJalanHistory.length} Surat Jalan Siap
                Diisikan ke &ldquo;{metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;
              </div>
              <div className="text-blue-800/90 dark:text-blue-200/90 leading-relaxed">
                Koneksi sudah siap. Klik tombol di samping untuk mengisi seluruh data riwayat ke
                Google Sheets dan mengaktifkan Auto-Sync.
              </div>
            </div>
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => setConfirmAction({ kind: 'manual_push' })}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSyncing ? 'Menyinkronkan...' : 'Isi Data Sekarang →'}
            </button>
          </div>
        )}

        {!isBridgeMode && pendingSyncCount > 0 && needsAuth && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Ada <strong>{pendingSyncCount}</strong> perubahan data baru yang belum dikirim ke
                Google Sheets karena sesi login Google belum aktif.
              </span>
            </div>
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
            >
              Login Google Sekarang
            </button>
          </div>
        )}

        {/* Target Spreadsheet & Tab Config */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-7 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Alamat URL / ID Google Spreadsheet Target
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={spreadsheetInput}
                onChange={(e) => onChangeSpreadsheetInput(e.target.value)}
                placeholder={DEFAULT_SPREADSHEET_URL}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {activeSpreadsheetId !== DEFAULT_SPREADSHEET_ID && (
                <button
                  type="button"
                  onClick={() => onChangeSpreadsheetInput(DEFAULT_SPREADSHEET_URL)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                >
                  Reset Default
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              ID Aktif: <code className="font-mono">{activeSpreadsheetId}</code>
            </p>
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Tab Utama Data Pallet
            </label>
            <select
              value={selectedSheetTab}
              onChange={(e) => onChangeSelectedSheetTab(e.target.value)}
              disabled={!metadata || metadata.sheets.length === 0}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {metadata && metadata.sheets.length > 0 ? (
                metadata.sheets.map((s) => (
                  <option key={s.sheetId} value={s.title}>
                    {s.title}
                  </option>
                ))
              ) : (
                <option value={selectedSheetTab || ''}>
                  {selectedSheetTab || 'Muat tab setelah koneksi siap...'}
                </option>
              )}
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={handleLoadMetadata}
              disabled={!isConnectionReady || isLoadingMeta}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMeta ? 'animate-spin' : ''}`} />
              <span>Cek Tab Sheet</span>
            </button>
          </div>
        </div>

        {/* Additional Tabs & Separate Manual SJ Spreadsheet Options */}
        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex flex-wrap items-center gap-5">
            <span className="font-bold text-slate-600 dark:text-slate-300">
              Tab Tambahan Otomatis:
            </span>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSuratJalanTab}
                onChange={(e) => onChangeIncludeSuratJalanTab(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Tab <strong>{SURAT_JALAN_TAB_TITLE}</strong> ({palletSjCount} Dokumen Pallet)
              </span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeManualSjTab}
                onChange={(e) => onChangeIncludeManualSjTab(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Tab / File <strong>{SURAT_JALAN_MANUAL_TAB_TITLE}</strong> ({manualSjCount} SJ
                Input Manual Tanpa Pallet)
              </span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeRekapTab}
                onChange={(e) => onChangeIncludeRekapTab(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Tab <strong>{REKAP_STOK_TAB_TITLE}</strong> (Ringkasan per SKU &amp; Bin)
              </span>
            </label>
          </div>

          {includeManualSjTab && (
            <div className="p-3.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/25 border border-indigo-200 dark:border-indigo-900/70 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="font-bold text-indigo-950 dark:text-indigo-200">
                  URL / ID Spreadsheet Khusus &ldquo;{SURAT_JALAN_MANUAL_TAB_TITLE}&rdquo;
                  (Opsional)
                </label>
                {hasSeparateManualSpreadsheet && (
                  <a
                    href={manualSpreadsheetUrlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
                  >
                    <span>Buka Spreadsheet SJ Manual</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <input
                type="text"
                value={manualSjSpreadsheetInput}
                onChange={(e) => onChangeManualSjSpreadsheetInput(e.target.value)}
                placeholder="Kosongkan jika cukup disimpan pada tab terpisah 'Surat Jalan Manual' di dalam Data GBJ (new), atau tempel URL Spreadsheet lain di sini..."
                className="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[11px] text-indigo-900/80 dark:text-indigo-300/80 leading-relaxed">
                {hasSeparateManualSpreadsheet
                  ? `SJ Manual (${manualSjCount} dokumen) akan dikirim ke spreadsheet terpisah ID: ${manualSpreadsheetIdResolved}. Pastikan akun pemilik Apps Script juga memiliki akses Editor pada spreadsheet tersebut.`
                  : `Kosongkan kolom ini untuk otomatis memisahkan SJ Input Manual (tanpa pilih pallet) ke tab "${SURAT_JALAN_MANUAL_TAB_TITLE}" di dalam spreadsheet "${metadata?.title || DEFAULT_SPREADSHEET_NAME}".`}
              </p>
            </div>
          )}

          {/* Read-Only Sheet Lock Toggle */}
          <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="inline-flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lockSheetReadOnly}
                onChange={(e) => onChangeLockSheetReadOnly(e.target.checked)}
                className="mt-0.5 rounded border-emerald-400 text-emerald-600"
              />
              <span className="space-y-0.5">
                <span className="flex items-center gap-1.5 font-bold text-emerald-950 dark:text-emerald-200">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Kunci Sheet Read-Only (Anti-Edit Manual di Spreadsheet)</span>
                </span>
                <span className="block text-[11px] text-emerald-900/80 dark:text-emerald-300/80 leading-relaxed">
                  Mengunci otomatis tab <strong>{targetSheetDisplay}</strong>,{' '}
                  <strong>{SURAT_JALAN_TAB_TITLE}</strong>,{' '}
                  <strong>{SURAT_JALAN_MANUAL_TAB_TITLE}</strong>, dan{' '}
                  <strong>{REKAP_STOK_TAB_TITLE}</strong> agar tim lain tidak bisa mengedit sel
                  secara manual di Google Sheets—seluruh perubahan wajib lewat aplikasi PalletTrack.
                </span>
              </span>
            </label>
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold whitespace-nowrap self-start sm:self-center ${
                lockSheetReadOnly
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {lockSheetReadOnly ? 'TERKUNCI VIEW-ONLY' : 'BEBAS EDIT'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ACTION BAR: AUTO-SYNC, MANUAL PUSH & AUDIT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card A: Sinkronisasi Penuh */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-blue-600 dark:text-cyan-400 font-bold text-xs uppercase tracking-wider">
              <UploadCloud className="w-4 h-4" />
              <span>1. Kirim Data ke Spreadsheet</span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Sinkronisasi Penuh Sekarang
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Mengisi spreadsheet kosong atau memperbarui seluruh baris{' '}
              <strong>{records.length} Pallet</strong> &amp;{' '}
              <strong>{suratJalanHistory.length} Surat Jalan</strong> ke file &ldquo;
              {metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;.
            </p>
          </div>
          <button
            type="button"
            disabled={!isConnectionReady || isSyncing}
            onClick={() => setConfirmAction({ kind: 'manual_push' })}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Semua Data ke Sheets'}</span>
          </button>
        </div>

        {/* Card B: Audit & Cek Selisih */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 shadow-xs">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-xs uppercase tracking-wider">
              <SearchCheck className="w-4 h-4" />
              <span>2. Bandingkan Data</span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Cek Selisih Sistem vs Spreadsheet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Memeriksa apakah isi tab <strong>{targetSheetDisplay}</strong> sudah sesuai dengan
              tarikan data sistem saat ini (tanpa mengubah isi spreadsheet).
            </p>
          </div>
          <button
            type="button"
            disabled={!isConnectionReady || isAuditing}
            onClick={handleRunAudit}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
          >
            <ArrowRightLeft className={`w-4 h-4 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isAuditing ? 'Membandingkan...' : 'Cek & Bandingkan Sekarang'}</span>
          </button>
        </div>

        {/* Card C: Auto-Sync Mode */}
        <div
          className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 shadow-xs transition-colors ${
            autoSyncEnabled
              ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>3. Sinkronisasi Otomatis</span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  autoSyncEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {autoSyncEnabled ? (isBridgeMode ? 'AKTIF 24/7' : 'AKTIF') : 'NONAKTIF'}
              </span>
            </div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {isBridgeMode
                ? 'Auto-Sync 24/7 Semua User Tanpa Login'
                : 'Auto-Sync Sesi Perangkat Ini'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isBridgeMode
                ? 'Setiap input pallet baru, edit keterangan/qty, geser rak Bin, outbound, atau Surat Jalan dari user mana pun otomatis memperbarui spreadsheet 24 jam penuh.'
                : 'Jika diaktifkan, setiap perubahan data selama sesi browser ini berlangsung otomatis memperbarui spreadsheet.'}
            </p>
          </div>

          {autoSyncEnabled ? (
            <button
              type="button"
              onClick={onDisableAutoSync}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 transition-colors cursor-pointer"
            >
              <span>Nonaktifkan Auto-Sync</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!isConnectionReady || isSyncing}
              onClick={() => setConfirmAction({ kind: 'enable_auto_sync' })}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isBridgeMode ? 'Aktifkan Auto-Sync 24/7 (Semua User)' : 'Aktifkan Sinkronisasi Otomatis'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Last Sync Summary Banner */}
      {lastSyncResult && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="font-bold">
                Sinkronisasi Terakhir Berhasil &bull;{' '}
                {new Date(lastSyncResult.syncedAt).toLocaleString('id-ID')}
              </div>
              <div className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                File: <strong>{lastSyncResult.spreadsheetTitle}</strong> &bull;{' '}
                {lastSyncResult.palletRowsCount} baris di &ldquo;{lastSyncResult.palletTabTitle}
                &rdquo;
                {includeSuratJalanTab
                  ? ` · ${lastSyncResult.suratJalanRowsCount} SJ Pallet`
                  : ''}
                {includeManualSjTab
                  ? ` · ${lastSyncResult.manualSuratJalanRowsCount ?? 0} Baris SJ Manual`
                  : ''}
                {includeRekapTab ? ` · ${lastSyncResult.rekapRowsCount} Rekap SKU` : ''}
              </div>
            </div>
          </div>
          <a
            href={activeSpreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
          >
            <span>Lihat Hasil di Sheets</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* 3. AUDIT / DIFF COMPARISON RESULTS */}
      {auditReport && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Table2 className="w-4 h-4 text-amber-600" />
                <span>
                  Hasil Audit Selisih: Sistem vs Tab &ldquo;{auditReport.sheetTitle}&rdquo;
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Diperiksa pada {new Date(auditReport.checkedAt).toLocaleString('id-ID')}
                {auditReport.isSheetEmpty
                  ? ' · Spreadsheet saat ini masih kosong dan siap diisi oleh sistem.'
                  : ''}
              </p>
            </div>

            {auditReport.extraRecordsForImport.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setConfirmAction({
                    kind: 'import_extra',
                    records: auditReport.extraRecordsForImport
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
              >
                <DownloadCloud className="w-4 h-4" />
                <span>
                  Tarik {auditReport.extraRecordsForImport.length} Data Tambahan dari Sheets ke Sistem
                </span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500 block">Total di Sistem</span>
              <strong className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                {auditReport.totalSystem}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <span className="text-[11px] text-slate-500 block">Total di Spreadsheet</span>
              <strong className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                {auditReport.totalSheetRows}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block">
                Sudah Cocok / Sama
              </span>
              <strong className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {auditReport.matchedCount}
              </strong>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <span className="text-[11px] text-amber-700 dark:text-amber-400 block">
                Selisih / Belum Sinkron
              </span>
              <strong className="text-lg font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
                {auditReport.missingInSheetCount +
                  auditReport.mismatchedCount +
                  auditReport.extraInSheetCount}
              </strong>
            </div>
          </div>

          {auditReport.diffs.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAuditFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    auditFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Semua Selisih ({auditReport.diffs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditFilter('missing_in_sheet')}
                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    auditFilter === 'missing_in_sheet'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Belum di Spreadsheet ({auditReport.missingInSheetCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditFilter('mismatch')}
                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    auditFilter === 'mismatch'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Nilai Berbeda ({auditReport.mismatchedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditFilter('extra_in_sheet')}
                  className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer ${
                    auditFilter === 'extra_in_sheet'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Hanya di Spreadsheet ({auditReport.extraInSheetCount})
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">
                        Kategori
                      </th>
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">
                        No. Pallet &amp; Barang
                      </th>
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">
                        Data Sistem
                      </th>
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">
                        Data Google Sheets
                      </th>
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 dark:border-slate-700">
                        Catatan Selisih
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredDiffs.slice(0, 100).map((diff, i) => (
                      <tr
                        key={`${diff.keyLabel}-${i}`}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                      >
                        <td className="px-3 py-2 align-top whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              diff.kind === 'missing_in_sheet'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : diff.kind === 'mismatch'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                            }`}
                          >
                            {diff.kind === 'missing_in_sheet'
                              ? 'Belum di Sheets'
                              : diff.kind === 'mismatch'
                              ? 'Nilai Berbeda'
                              : 'Hanya di Sheets'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {diff.nomorPallet}
                          </div>
                          <div className="text-[11px] text-slate-500">{diff.namaBarang}</div>
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                          {diff.systemSummary}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300">
                          {diff.sheetSummary}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-600 dark:text-slate-400">
                          {diff.differences.join('; ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>100% Sesuai! Seluruh data di sistem dan Google Sheets sudah sama persis.</span>
            </div>
          )}
        </div>
      )}

      {/* 4. PANDUAN & LOG AKTIVITAS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <Lock className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Cara Membuat Spreadsheet Hanya Bisa Dilihat (Edit Hanya Lewat Aplikasi)
              </h3>
            </div>

            <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 list-decimal pl-4 leading-relaxed">
              <li>
                <strong>Atur Bagikan (Share) Google Sheets ke &ldquo;Pelihat (Viewer)&rdquo;:</strong>{' '}
                Buka file <em>&ldquo;{DEFAULT_SPREADSHEET_NAME}&rdquo;</em> &rarr; klik tombol{' '}
                <strong>Bagikan (Share)</strong> di kanan atas &rarr; pada{' '}
                <strong>Akses Umum</strong> dan semua email rekan/tim, ubah izinnya menjadi{' '}
                <strong>Pelihat (Viewer)</strong> (jangan Editor). Biarkan hanya akun pemilik yang
                menjadi <strong>Pemilik (Owner)</strong>.
              </li>
              <li>
                <strong>Auto-Sync 24/7 Tetap Jalan Meski Orang Lain Viewer:</strong> Karena{' '}
                <strong>Cara B (Apps Script Bridge)</strong> berjalan dengan{' '}
                <em>&ldquo;Jalankan sebagai: Saya (Pemilik)&rdquo;</em>, operator tetap bisa input
                pallet, edit stok, &amp; buat Surat Jalan dari aplikasi <strong>PalletTrack</strong>{' '}
                dan data otomatis masuk ke Spreadsheet meski link Spreadsheet hanya berstatus{' '}
                <strong>Viewer</strong>.
              </li>
              <li>
                <strong>Proteksi Sheet Otomatis (v4):</strong> Centang opsi{' '}
                <strong>Kunci Sheet Read-Only</strong> di atas dan pastikan Bridge Apps Script sudah
                diperbarui ke <strong>v4</strong> agar semua tab hasil sinkronisasi otomatis dikunci
                dari pengeditan manual.
              </li>
            </ol>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Cara Kerja Sinkronisasi Tanpa Terkunci Login Google (Cara B)
              </h3>
            </div>

            <ol className="space-y-3 text-xs text-slate-600 dark:text-slate-300 list-decimal pl-4 leading-relaxed">
              <li>
                <strong>Operator Tidak Perlu Login Google:</strong> Semua halaman operasional (Input
                Pallet, Scan QR Bin, Riwayat, Surat Jalan) terbuka bebas tanpa perlu login akun
                Google.
              </li>
              <li>
                <strong>Setup Pemilik 1x di &ldquo;{DEFAULT_SPREADSHEET_NAME}&rdquo;:</strong> Pasang
                kode Bridge Apps Script di spreadsheet lalu deploy sebagai{' '}
                <strong>Aplikasi web</strong> (<em>Jalankan sebagai: Saya</em>,{' '}
                <em>Akses: Siapa saja</em>).
              </li>
              <li>
                <strong>Simpan URL Web App ke Cloud:</strong> Klik{' '}
                <strong>Tes &amp; Simpan ke Cloud</strong>. Alamat Bridge otomatis tersimpan di
                database cloud dan aktif di semua HP/PC operator.
              </li>
              <li>
                <strong>Aktifkan Auto-Sync 24/7:</strong> Sekali diaktifkan, setiap operator mana pun
                menginput pallet, mengedit qty/keterangan, memproses outbound, atau menerbitkan Surat
                Jalan, perubahan langsung masuk ke seluruh tab lengkap di{' '}
                <em>&ldquo;{DEFAULT_SPREADSHEET_NAME}&rdquo;</em> secara otomatis.
              </li>
            </ol>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Riwayat Sinkronisasi Sesi Ini
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-semibold">
              {activityLogs.length} catatan
            </span>
          </div>

          {activityLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Belum ada aktivitas sinkronisasi pada sesi ini.
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-2.5 rounded-xl border text-xs ${
                    log.status === 'success'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                      : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold opacity-80 mb-0.5">
                    <span>Mode: {log.mode}</span>
                    <span>{new Date(log.time).toLocaleTimeString('id-ID')}</span>
                  </div>
                  <div className="leading-snug">{log.summary}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MANDATORY EXPLICIT USER CONFIRMATION DIALOG FOR MUTATING / SYNC OPERATIONS */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {confirmAction.kind === 'manual_push'
                    ? 'Konfirmasi Perbarui Google Sheets'
                    : confirmAction.kind === 'enable_auto_sync'
                    ? 'Konfirmasi Aktifkan Auto-Sync'
                    : 'Konfirmasi Tarik Data ke Sistem'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => !isConfirmExecuting && setConfirmAction(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmAction.kind === 'manual_push' && (
                <>
                  <p>
                    Sistem akan <strong>menimpa &amp; memperbarui</strong> isi tab berikut pada
                    spreadsheet{' '}
                    <strong>&ldquo;{metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;</strong>
                    {isBridgeMode ? ' melalui Bridge Apps Script:' : ':'}
                  </p>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1 text-[11px]">
                    <div>
                      <strong>Tab Terdampak:</strong> {affectedTabsSummary}
                    </div>
                    <div>
                      <strong>Data Pallet:</strong> {records.length} pallet (IN &amp; OUT)
                    </div>
                    {includeSuratJalanTab && (
                      <div>
                        <strong>Surat Jalan (Ambil Pallet):</strong> {palletSjCount} dokumen
                      </div>
                    )}
                    {includeManualSjTab && (
                      <div>
                        <strong>Surat Jalan Manual (Tanpa Pallet):</strong> {manualSjCount} dokumen
                      </div>
                    )}
                  </div>
                  <p className="text-amber-700 dark:text-amber-400 font-semibold">
                    Data lama pada tab target akan digantikan dengan data terbaru dari sistem.
                  </p>
                  {!autoSyncEnabled && (
                    <label className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={alsoEnableAutoAfterPush}
                        onChange={(e) => setAlsoEnableAutoAfterPush(e.target.checked)}
                        className="mt-0.5 rounded border-emerald-400 text-emerald-600"
                      />
                      <span className="text-[11px] text-emerald-900 dark:text-emerald-200 leading-snug">
                        <strong>
                          Sekaligus aktifkan Auto-Sync{' '}
                          {isBridgeMode ? '24/7 (Semua User)' : 'otomatis'}
                        </strong>{' '}
                        setelah ini agar setiap input/edit pallet atau Surat Jalan baru otomatis
                        ikut terkirim ke spreadsheet.
                      </span>
                    </label>
                  )}
                </>
              )}

              {confirmAction.kind === 'enable_auto_sync' && (
                <>
                  <p>
                    Dengan mengaktifkan{' '}
                    <strong>
                      {isBridgeMode ? 'Auto-Sync 24/7 (Semua User)' : 'Sinkronisasi Otomatis'}
                    </strong>
                    , sistem akan langsung memperbarui tab <strong>{affectedTabsSummary}</strong>{' '}
                    di spreadsheet{' '}
                    <strong>&ldquo;{metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;</strong>{' '}
                    {isBridgeMode
                      ? 'setiap kali operator mana pun menginput atau memperbarui data (tanpa perlu login Google di perangkat operator).'
                      : 'segera setiap kali ada input atau perubahan data selama sesi ini berlangsung.'}
                  </p>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                    Saat diaktifkan sekarang, sistem juga akan langsung melakukan sinkronisasi awal
                    untuk <strong>{records.length} data pallet</strong> dan{' '}
                    <strong>{suratJalanHistory.length} surat jalan</strong>.
                  </div>
                </>
              )}

              {confirmAction.kind === 'import_extra' && (
                <>
                  <p>
                    Anda akan menarik <strong>{confirmAction.records.length} baris</strong> data
                    yang hanya ditemukan di spreadsheet{' '}
                    <strong>&ldquo;{metadata?.title || DEFAULT_SPREADSHEET_NAME}&rdquo;</strong>{' '}
                    untuk ditambahkan ke database sistem PalletTrack.
                  </p>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                    Data yang sudah ada di sistem tidak akan dihapus; hanya baris tambahan dari
                    spreadsheet yang digabungkan.
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isConfirmExecuting}
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isConfirmExecuting}
                onClick={handleConfirmProceed}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                {isConfirmExecuting
                  ? 'Memproses...'
                  : confirmAction.kind === 'manual_push'
                  ? 'Ya, Sinkronkan Sekarang'
                  : confirmAction.kind === 'enable_auto_sync'
                  ? 'Ya, Aktifkan Auto-Sync'
                  : `Ya, Tarik ${confirmAction.records.length} Baris`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
