import React, { useState, useMemo, useEffect } from 'react';
import {
  PalletRecord,
  MasterItem,
  MasterRoute,
  MasterVendor,
  MasterRouteTariff,
  SuratJalanRecord,
  SuratJalanItemLine
} from '../types/warehouse';
import {
  FileText,
  Truck,
  MapPin,
  Calendar,
  CheckSquare,
  Square,
  Printer,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
  User,
  Phone,
  Filter,
  RotateCcw,
  Edit3,
  Trash2,
  Save,
  X,
  PackagePlus
} from 'lucide-react';
import { SuratJalanPrintModal } from './SuratJalanPrintModal';
import { getPalletBatches } from '../utils/batchCalculator';

interface SuratJalanViewProps {
  records: PalletRecord[];
  masterItems: MasterItem[];
  masterRoutes: MasterRoute[];
  masterVendors: MasterVendor[];
  masterTariffs?: MasterRouteTariff[];
  suratJalanHistory: SuratJalanRecord[];
  onSaveSuratJalan: (record: SuratJalanRecord) => Promise<void>;
}

// Helper to extract Gudang number from lokasiBin (e.g., "5A.1" -> "5", "GUDANG 3-A1" -> "3")
function extractGudangNumber(lokasiBin: string): string | null {
  const raw = (lokasiBin || '').trim().toUpperCase();
  if (!raw) return null;
  const explicitMatch = raw.match(/(?:GUDANG|GDG|G)\s*(\d+)/);
  if (explicitMatch?.[1]) return explicitMatch[1];
  const leadingMatch = raw.match(/^(\d+)/);
  if (leadingMatch?.[1]) return leadingMatch[1];
  return null;
}

// Generate auto No Surat Jalan like FGW/26/XI/032
function generateAutoSuratJalanNo(count: number): string {
  const now = new Date();
  const year2Dig = String(now.getFullYear()).slice(-2);
  const romanMonths = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const romanMonth = romanMonths[now.getMonth()];
  const seq = String(count + 1).padStart(3, '0');
  return `FGW/${year2Dig}/${romanMonth}/${seq}`;
}

function incrementSuratJalanNo(baseNo: string, offset: number): string {
  if (offset <= 0) return baseNo;
  const trimmed = baseNo.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const nextNum = parseInt(numStr, 10) + offset;
    return `${prefix}${String(nextNum).padStart(numStr.length, '0')}`;
  }
  return `${trimmed}-${offset + 1}`;
}

interface SuratJalanArmadaEntry {
  noSuratJalan: string;
  noPolisi: string;
  namaDriver: string;
  noHpDriver: string;
  note: string;
}

interface ManualItemEntry {
  id: string;
  masterItemId?: string;
  isCustom?: boolean;
  kodeItem: string;
  namaBarang: string;
  qtyBox: string;
  beratPerBoxKg: string;
}

function formatDateOnlyIndoFromDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatWaktuCetakIndoFromDate(d: Date): string {
  const datePart = formatDateOnlyIndoFromDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${datePart}, ${hh}.${min}.${sec}`;
}

function parseCustomDatetimeLocal(val?: string): Date | null {
  if (!val || !val.trim()) return null;
  const trimmed = val.trim();
  const dt = new Date(trimmed);
  if (!isNaN(dt.getTime())) return dt;
  const indoMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2})[.:](\d{2})(?:[.:](\d{2}))?)?$/);
  if (indoMatch) {
    const [, dd, mm, yyyy, hh = '00', min = '00', sec = '00'] = indoMatch;
    const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${sec}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function toDatetimeLocalValue(val?: string): string {
  if (!val || !val.trim()) return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T08:00`;
  }
  const parsed = parseCustomDatetimeLocal(trimmed);
  if (!parsed) return '';
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const min = String(parsed.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export const SuratJalanView: React.FC<SuratJalanViewProps> = ({
  records,
  masterItems,
  masterRoutes,
  masterVendors,
  masterTariffs = [],
  suratJalanHistory,
  onSaveSuratJalan
}) => {
  // Sub-tabs: Buat Baru vs Riwayat Surat Jalan
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'history'>('create');

  // Today's date
  const todayIso = new Date().toISOString().split('T')[0];
  const [tanggalInput, setTanggalInput] = useState<string>(todayIso);

  // Form Fields - Default Kosong sesuai permintaan user
  const [selectedDariId, setSelectedDariId] = useState<string>('');
  const [selectedTujuanId, setSelectedTujuanId] = useState<string>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [customVendorNama, setCustomVendorNama] = useState<string>('');
  const [tarif, setTarif] = useState<number>(0);
  const [ppnPersen, setPpnPersen] = useState<number>(0);
  const [ppnInputText, setPpnInputText] = useState<string>('0');

  const [noPo, setNoPo] = useState<string>('');
  const [noKontainer, setNoKontainer] = useState<string>('');
  const [noFaktur, setNoFaktur] = useState<string>('');
  const [noInvoice, setNoInvoice] = useState<string>('');
  const [tglJamCetakCustom, setTglJamCetakCustom] = useState<string>('');

  const initialSjNo = generateAutoSuratJalanNo(suratJalanHistory.length);
  const [noSuratJalan, setNoSuratJalan] = useState<string>(initialSjNo);

  // Multi-Surat Jalan (jumlah surat jalan yang dicetak beserta baris nopol & pallet masing-masing)
  const [jumlahSuratJalan, setJumlahSuratJalan] = useState<number>(1);
  const [activeSjIndex, setActiveSjIndex] = useState<number>(0);
  const [armadaEntries, setArmadaEntries] = useState<SuratJalanArmadaEntry[]>([
    {
      noSuratJalan: initialSjNo,
      noPolisi: '',
      namaDriver: '',
      noHpDriver: '',
      note: ''
    }
  ]);

  // Peta assignment pallet.id -> sjIndex (0-based)
  const [palletAssignments, setPalletAssignments] = useState<Record<string, number>>({});

  // Input barang manual per SJ ketika tidak ada pallet yang dipilih
  const [manualItemsBySj, setManualItemsBySj] = useState<Record<number, ManualItemEntry[]>>({});

  // Filter options for matching taken pallets
  const [filterByDate, setFilterByDate] = useState<boolean>(false);
  const [selectedGudangFilter, setSelectedGudangFilter] = useState<string>('ALL');
  const [selectedBinFilter, setSelectedBinFilter] = useState<string>('ALL');

  // Print modal state
  const [previewRecord, setPreviewRecord] = useState<SuratJalanRecord | null>(null);
  const [previewRecords, setPreviewRecords] = useState<SuratJalanRecord[]>([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit modal state (Riwayat Surat Jalan)
  const [editingRecord, setEditingRecord] = useState<SuratJalanRecord | null>(null);
  const [editTglJamInput, setEditTglJamInput] = useState<string>('');
  const [editPpnText, setEditPpnText] = useState<string>('0');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Deduplicate masterRoutes by kodeLokasi & namaLokasi so dropdown never shows duplicate route names
  const uniqueMasterRoutes = useMemo(() => {
    const seenKode = new Set<string>();
    const seenNama = new Set<string>();
    const unique: MasterRoute[] = [];

    masterRoutes.forEach((r) => {
      if (!r) return;
      const kodeKey = (r.kodeLokasi || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const namaKey = (r.namaLokasi || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if ((kodeKey && seenKode.has(kodeKey)) || (namaKey && seenNama.has(namaKey))) {
        return;
      }
      if (kodeKey) seenKode.add(kodeKey);
      if (namaKey) seenNama.add(namaKey);
      unique.push(r);
    });

    return unique;
  }, [masterRoutes]);

  // Selected routes objects
  const ruteDariObj = useMemo(
    () => uniqueMasterRoutes.find((r) => r.id === selectedDariId),
    [uniqueMasterRoutes, selectedDariId]
  );

  const ruteTujuanObj = useMemo(
    () => uniqueMasterRoutes.find((r) => r.id === selectedTujuanId),
    [uniqueMasterRoutes, selectedTujuanId]
  );

  // Cari Master Tarif yang cocok dengan Rute Awal & Rute Tujuan yang dipilih
  const matchingTariffs = useMemo(() => {
    if (!ruteDariObj || !ruteTujuanObj || masterTariffs.length === 0) return [];
    const normalizeLoc = (s: string) =>
      s
        .toLowerCase()
        .replace(/pt\.?\s*santos\s*jaya\s*abadi/g, '')
        .replace(/gudang\s*konversi\s*\d*/g, '')
        .replace(/\bsja\b/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const dariNama = (ruteDariObj.namaLokasi || '').toLowerCase().trim();
    const dariKode = (ruteDariObj.kodeLokasi || '').toLowerCase().trim();
    const dariToken = normalizeLoc(dariNama) || normalizeLoc(dariKode);

    const tujuanNama = (ruteTujuanObj.namaLokasi || '').toLowerCase().trim();
    const tujuanKode = (ruteTujuanObj.kodeLokasi || '').toLowerCase().trim();
    const tujuanToken = normalizeLoc(tujuanNama) || normalizeLoc(tujuanKode);

    return masterTariffs.filter((t) => {
      const tAwal = t.ruteAwal.toLowerCase().trim();
      const tAwalToken = normalizeLoc(tAwal);
      const tTujuan = t.ruteTujuan.toLowerCase().trim();
      const tTujuanToken = normalizeLoc(tTujuan);

      const matchAwal =
        tAwal.includes(dariKode) ||
        dariNama.includes(tAwal) ||
        tAwal.includes(dariNama) ||
        (dariToken.length >= 3 && tAwalToken.length >= 3 && (tAwalToken === dariToken || tAwalToken.includes(dariToken) || dariToken.includes(tAwalToken)));

      const matchTujuan =
        tTujuan.includes(tujuanKode) ||
        tujuanNama.includes(tTujuan) ||
        tTujuan.includes(tujuanNama) ||
        (tujuanToken.length >= 3 && tTujuanToken.length >= 3 && (tTujuanToken === tujuanToken || tTujuanToken.includes(tujuanToken) || tujuanToken.includes(tTujuanToken)));

      return matchAwal && matchTujuan;
    });
  }, [ruteDariObj, ruteTujuanObj, masterTariffs]);

  // Saat Rute Awal & Tujuan berubah, atur pilihan vendor
  useEffect(() => {
    if (!ruteDariObj || !ruteTujuanObj) {
      setSelectedVendorId('');
      setCustomVendorNama('');
      setTarif(0);
      setPpnPersen(0);
      setPpnInputText('0');
      return;
    }

    if (matchingTariffs.length === 1) {
      // Jika hanya ada 1 vendor terdaftar, otomatis pilih vendor tersebut
      const single = matchingTariffs[0];
      setSelectedVendorId(`tariff-${single.id}`);
      setCustomVendorNama(single.vendor);
      setTarif(single.tarif);
      setPpnPersen(single.ppnPersen);
      setPpnInputText(String(single.ppnPersen).replace('.', ','));
    } else if (matchingTariffs.length > 1) {
      // Jika ada beberapa vendor, biarkan petugas memilih vendor mana yang digunakan
      setSelectedVendorId('');
      setCustomVendorNama('');
      setTarif(0);
      setPpnPersen(0);
      setPpnInputText('0');
    } else {
      // Tidak ada tarif terdaftar di master -> fallback default rute atau 0
      setSelectedVendorId('');
      setCustomVendorNama('');
      setTarif(ruteTujuanObj.tarifDefault && ruteTujuanObj.tarifDefault > 0 ? ruteTujuanObj.tarifDefault : 0);
      const defPpn = ruteTujuanObj.ppnPersen ?? 0;
      setPpnPersen(defPpn);
      setPpnInputText(String(defPpn).replace('.', ','));
    }
  }, [ruteDariObj, ruteTujuanObj, matchingTariffs]);

  const handleSelectTariffCard = (t: MasterRouteTariff) => {
    setSelectedVendorId(`tariff-${t.id}`);
    setCustomVendorNama(t.vendor);
    setTarif(t.tarif);
    setPpnPersen(t.ppnPersen);
    setPpnInputText(String(t.ppnPersen).replace('.', ','));
  };

  // Kumpulan nama vendor unik dari Master Tujuan & Tarif yang belum ada di Master Armada
  const tariffOnlyVendorNames = useMemo(() => {
    const armadaSet = new Set(
      masterVendors.map((v) => v.namaVendor.trim().toUpperCase())
    );
    const seen = new Set<string>();
    const list: string[] = [];
    masterTariffs.forEach((t) => {
      const name = (t.vendor || '').trim();
      const upper = name.toUpperCase();
      if (name && !armadaSet.has(upper) && !seen.has(upper)) {
        seen.add(upper);
        list.push(name);
      }
    });
    return list;
  }, [masterVendors, masterTariffs]);

  const handleVendorChange = (val: string) => {
    setSelectedVendorId(val);
    if (!val) {
      setCustomVendorNama('');
      return;
    }
    if (val.startsWith('tariff-')) {
      const tariffId = val.replace('tariff-', '');
      const t = masterTariffs.find((mt) => mt.id === tariffId);
      if (t) {
        handleSelectTariffCard(t);
      }
    } else if (val.startsWith('tname-')) {
      const vendorName = val.slice('tname-'.length);
      setCustomVendorNama(vendorName);
    } else if (val === 'custom') {
      setCustomVendorNama('');
    } else {
      const v = masterVendors.find((mv) => mv.id === val);
      if (v) {
        setCustomVendorNama(v.namaVendor);
        if (v.tarifDefault !== undefined && tarif === 0) setTarif(v.tarifDefault);
        if (v.ppnPersen !== undefined) {
          setPpnPersen(v.ppnPersen);
          setPpnInputText(String(v.ppnPersen).replace('.', ','));
        }
      }
    }
  };

  // Kumpulan ID pallet yang sudah pernah diambil/dimuat ke Surat Jalan sebelumnya
  const assignedPalletIdsFromHistory = useMemo(() => {
    const ids = new Set<string>();
    suratJalanHistory.forEach((sj) => {
      sj.palletIds?.forEach((pid) => ids.add(pid));
    });
    return ids;
  }, [suratJalanHistory]);

  // Base outbound pallets matching destination & date (pallet yang sudah diambil/punya SJ langsung dihilangkan)
  const baseOutboundPallets = useMemo(() => {
    const targetKode = ruteTujuanObj ? ruteTujuanObj.kodeLokasi.toLowerCase().trim() : '';

    return records.filter((rec) => {
      if (rec.status !== 'OUT') return false;

      // Hilangkan pallet yang sudah diambil / sudah masuk Surat Jalan
      if (rec.suratJalanId || rec.noSuratJalan || assignedPalletIdsFromHistory.has(rec.id)) {
        return false;
      }

      if (targetKode) {
        const recTujuan = (rec.tujuanPengambilan || '').toLowerCase().trim();
        const matchDest = recTujuan.includes(targetKode) || targetKode.includes(recTujuan);
        if (!matchDest) return false;
      }

      if (filterByDate && rec.tanggalPengambilan) {
        const recDate = rec.tanggalPengambilan.split('T')[0];
        if (recDate !== tanggalInput) return false;
      }

      return true;
    });
  }, [records, ruteTujuanObj, filterByDate, tanggalInput, assignedPalletIdsFromHistory]);

  // Available Gudang options (Gudang 1-5 + any detected Gudang from outbound pallets)
  const gudangFilterOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    let hasOther = false;
    let otherCount = 0;

    baseOutboundPallets.forEach((p) => {
      const g = extractGudangNumber(p.lokasiBin);
      if (g) {
        counts[g] = (counts[g] || 0) + 1;
      } else {
        hasOther = true;
        otherCount += 1;
      }
    });

    const gudangNums = new Set<string>(['1', '2', '3', '4', '5', ...Object.keys(counts)]);
    const options = Array.from(gudangNums)
      .sort((a, b) => Number(a) - Number(b))
      .map((num) => ({
        value: num,
        label: counts[num] ? `Gudang ${num} (${counts[num]} pallet)` : `Gudang ${num}`,
        count: counts[num] || 0
      }));

    if (hasOther) {
      options.push({
        value: 'LAINNYA',
        label: `Lainnya (${otherCount} pallet)`,
        count: otherCount
      });
    }

    return options;
  }, [baseOutboundPallets]);

  // Available Bin options filtered by selected Gudang
  const binFilterOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    baseOutboundPallets.forEach((p) => {
      const g = extractGudangNumber(p.lokasiBin);
      if (selectedGudangFilter !== 'ALL') {
        if (selectedGudangFilter === 'LAINNYA') {
          if (g !== null) return;
        } else if (g !== selectedGudangFilter) {
          return;
        }
      }
      const bin = (p.lokasiBin || '').trim().toUpperCase();
      if (bin) {
        counts[bin] = (counts[bin] || 0) + 1;
      }
    });

    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((bin) => ({
        value: bin,
        label: `${bin} (${counts[bin]} pallet)`
      }));
  }, [baseOutboundPallets, selectedGudangFilter]);

  // Filter taken pallets by Lokasi Gudang & Lokasi Bin
  const availableOutboundPallets = useMemo(() => {
    return baseOutboundPallets.filter((rec) => {
      if (selectedGudangFilter !== 'ALL') {
        const g = extractGudangNumber(rec.lokasiBin);
        if (selectedGudangFilter === 'LAINNYA') {
          if (g !== null) return false;
        } else if (g !== selectedGudangFilter) {
          return false;
        }
      }

      if (selectedBinFilter !== 'ALL') {
        const bin = (rec.lokasiBin || '').trim().toUpperCase();
        if (bin !== selectedBinFilter.toUpperCase()) return false;
      }

      return true;
    });
  }, [baseOutboundPallets, selectedGudangFilter, selectedBinFilter]);

  // Handler mengubah jumlah Surat Jalan yang dicetak
  const handleChangeJumlahSuratJalan = (rawCount: number) => {
    const count = Math.max(1, Math.min(20, Math.floor(rawCount) || 1));
    setJumlahSuratJalan(count);
    setActiveSjIndex((prev) => Math.min(prev, count - 1));

    const baseSj = noSuratJalan.trim() || generateAutoSuratJalanNo(suratJalanHistory.length);
    setArmadaEntries((prev) => {
      const next: SuratJalanArmadaEntry[] = [];
      for (let i = 0; i < count; i++) {
        if (prev[i]) {
          next.push(prev[i]);
        } else {
          next.push({
            noSuratJalan: incrementSuratJalanNo(baseSj, i),
            noPolisi: '',
            namaDriver: '',
            noHpDriver: '',
            note: ''
          });
        }
      }
      return next;
    });

    setPalletAssignments((prev) => {
      const next: Record<string, number> = {};
      Object.entries(prev).forEach(([pid, idx]) => {
        if (idx < count) {
          next[pid] = idx;
        }
      });
      return next;
    });
  };

  const handleUpdateArmadaEntry = (
    idx: number,
    field: keyof SuratJalanArmadaEntry,
    value: string
  ) => {
    setFormError(null);
    setArmadaEntries((prev) =>
      prev.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry))
    );
    if (idx === 0 && field === 'noSuratJalan') {
      setNoSuratJalan(value);
    }
  };

  const handleToggleSelectPallet = (id: string) => {
    setPalletAssignments((prev) => {
      const next = { ...prev };
      if (next[id] === activeSjIndex) {
        delete next[id];
      } else {
        next[id] = activeSjIndex;
      }
      return next;
    });
  };

  const handleAssignPalletToSj = (id: string, sjIdx: number) => {
    setPalletAssignments((prev) => {
      const next = { ...prev };
      if (next[id] === sjIdx) {
        delete next[id];
      } else {
        next[id] = sjIdx;
      }
      return next;
    });
  };

  const selectedCountForActiveSj = useMemo(() => {
    return availableOutboundPallets.filter((p) => palletAssignments[p.id] === activeSjIndex).length;
  }, [availableOutboundPallets, palletAssignments, activeSjIndex]);

  const handleSelectAll = () => {
    setPalletAssignments((prev) => {
      const next = { ...prev };
      if (selectedCountForActiveSj === availableOutboundPallets.length && availableOutboundPallets.length > 0) {
        availableOutboundPallets.forEach((p) => {
          if (next[p.id] === activeSjIndex) {
            delete next[p.id];
          }
        });
      } else {
        availableOutboundPallets.forEach((p) => {
          next[p.id] = activeSjIndex;
        });
      }
      return next;
    });
  };

  // Build aggregated summary for a given list of pallets
  const buildItemsSummaryForPallets = (pallets: PalletRecord[]) => {
    const groups: Record<
      string,
      {
        kodeItem: string;
        namaBarang: string;
        detailBarang: string;
        qtyBox: number;
        beratPerBoxKg: number;
        totalKg: number;
        palletList: string[];
        batchList: string[];
      }
    > = {};

    let totalBox = 0;
    let totalKg = 0;

    pallets.forEach((pallet) => {
      const master = masterItems.find(
        (m) =>
          m.kodeItem.toLowerCase() === pallet.kodeItem.toLowerCase() ||
          m.namaBarang.toLowerCase() === pallet.namaBarang.toLowerCase()
      );

      const beratPerBox = master?.beratPerBoxKg ?? 30;
      const boxQty = Number(pallet.qtyPallet) || 1;
      const kgWeight = boxQty * beratPerBox;
      const groupKey = pallet.kodeItem.trim() || pallet.namaBarang.trim();

      if (!groups[groupKey]) {
        groups[groupKey] = {
          kodeItem: pallet.kodeItem,
          namaBarang: pallet.namaBarang,
          detailBarang: `${pallet.kodeItem} (1 X ${beratPerBox} KG)`,
          qtyBox: 0,
          beratPerBoxKg: beratPerBox,
          totalKg: 0,
          palletList: [],
          batchList: []
        };
      }

      groups[groupKey].qtyBox += boxQty;
      groups[groupKey].totalKg += kgWeight;
      groups[groupKey].palletList.push(pallet.nomorPallet);
      const palletBatches = getPalletBatches(pallet);
      if (palletBatches.length > 0) {
        palletBatches.forEach((b) => {
          const batchCode = (b.noBatch || '').trim();
          if (batchCode && !groups[groupKey].batchList.includes(batchCode)) {
            groups[groupKey].batchList.push(batchCode);
          }
        });
      } else if (pallet.noBatch && !groups[groupKey].batchList.includes(pallet.noBatch)) {
        groups[groupKey].batchList.push(pallet.noBatch);
      }

      totalBox += boxQty;
      totalKg += kgWeight;
    });

    const summaryList: SuratJalanItemLine[] = Object.values(groups).map((g) => ({
      kodeItem: g.kodeItem,
      namaBarang: g.namaBarang,
      detailBarang: g.detailBarang,
      qtyBox: g.qtyBox,
      beratPerBoxKg: g.beratPerBoxKg,
      totalKg: g.totalKg,
      nomorPalletList: g.palletList,
      noBatchList: g.batchList
    }));

    return {
      itemsSummary: summaryList,
      grandTotalBox: totalBox,
      grandTotalKg: totalKg
    };
  };

  const createEmptyManualRow = (idxSeed = 0): ManualItemEntry => ({
    id: `man-${Date.now()}-${idxSeed}-${Math.random().toString(36).substring(2, 6)}`,
    masterItemId: '',
    isCustom: false,
    kodeItem: '',
    namaBarang: '',
    qtyBox: '',
    beratPerBoxKg: '30'
  });

  const getManualRowsForSj = (sjIdx: number): ManualItemEntry[] => {
    const existing = manualItemsBySj[sjIdx];
    if (existing && existing.length > 0) return existing;
    return [
      {
        id: `man-default-${sjIdx}`,
        masterItemId: '',
        isCustom: false,
        kodeItem: '',
        namaBarang: '',
        qtyBox: '',
        beratPerBoxKg: '30'
      }
    ];
  };

  const handleUpdateManualRow = (
    sjIdx: number,
    rowIdx: number,
    patch: Partial<ManualItemEntry>
  ) => {
    setFormError(null);
    setManualItemsBySj((prev) => {
      const current = prev[sjIdx] && prev[sjIdx].length > 0 ? prev[sjIdx] : getManualRowsForSj(sjIdx);
      const updated = current.map((row, idx) => (idx === rowIdx ? { ...row, ...patch } : row));
      return { ...prev, [sjIdx]: updated };
    });
  };

  const handleSelectMasterForManualRow = (sjIdx: number, rowIdx: number, masterId: string) => {
    if (!masterId) {
      handleUpdateManualRow(sjIdx, rowIdx, {
        masterItemId: '',
        isCustom: false,
        kodeItem: '',
        namaBarang: '',
        beratPerBoxKg: '30'
      });
      return;
    }
    if (masterId === '__CUSTOM__') {
      handleUpdateManualRow(sjIdx, rowIdx, {
        masterItemId: '__CUSTOM__',
        isCustom: true
      });
      return;
    }
    const item = masterItems.find((m) => m.id === masterId);
    if (!item) return;
    handleUpdateManualRow(sjIdx, rowIdx, {
      masterItemId: item.id,
      isCustom: false,
      kodeItem: item.kodeItem,
      namaBarang: item.namaBarang,
      beratPerBoxKg: String(item.beratPerBoxKg ?? 30)
    });
  };

  const handleAddManualRow = (sjIdx: number) => {
    setFormError(null);
    setManualItemsBySj((prev) => {
      const current = prev[sjIdx] && prev[sjIdx].length > 0 ? prev[sjIdx] : getManualRowsForSj(sjIdx);
      return { ...prev, [sjIdx]: [...current, createEmptyManualRow(current.length)] };
    });
  };

  const handleRemoveManualRow = (sjIdx: number, rowIdx: number) => {
    setFormError(null);
    setManualItemsBySj((prev) => {
      const current = prev[sjIdx] && prev[sjIdx].length > 0 ? prev[sjIdx] : getManualRowsForSj(sjIdx);
      if (current.length <= 1) return prev;
      return { ...prev, [sjIdx]: current.filter((_, idx) => idx !== rowIdx) };
    });
  };

  const buildItemsSummaryFromManualRows = (rows: ManualItemEntry[]) => {
    const summaryList: SuratJalanItemLine[] = [];
    let totalBox = 0;
    let totalKg = 0;

    rows.forEach((r) => {
      const nama = r.namaBarang.trim();
      const qty = parseFloat(r.qtyBox) || 0;
      const berat = parseFloat(r.beratPerBoxKg);
      const beratPerBox = !isNaN(berat) && berat >= 0 ? berat : 30;
      if (!nama || qty <= 0) return;

      const kode = r.kodeItem.trim();
      const rowKg = Math.round(qty * beratPerBox * 100) / 100;
      summaryList.push({
        kodeItem: kode || '-',
        namaBarang: nama,
        detailBarang: kode ? `${kode} (1 X ${beratPerBox} KG)` : `(1 X ${beratPerBox} KG)`,
        qtyBox: qty,
        beratPerBoxKg: beratPerBox,
        totalKg: rowKg
      });
      totalBox += qty;
      totalKg += rowKg;
    });

    return {
      itemsSummary: summaryList,
      grandTotalBox: totalBox,
      grandTotalKg: totalKg
    };
  };

  // Summary per SJ entry (untuk preview live)
  const perSjSummaries = useMemo(() => {
    return Array.from({ length: jumlahSuratJalan }, (_, idx) => {
      const sjPallets = records.filter((r) => palletAssignments[r.id] === idx);
      if (sjPallets.length > 0) {
        const summary = buildItemsSummaryForPallets(sjPallets);
        return {
          sjIndex: idx,
          pallets: sjPallets,
          isManual: false,
          ...summary
        };
      }
      const manualRows = manualItemsBySj[idx] || [];
      const manualSummary = buildItemsSummaryFromManualRows(manualRows);
      return {
        sjIndex: idx,
        pallets: [] as PalletRecord[],
        isManual: true,
        ...manualSummary
      };
    });
  }, [jumlahSuratJalan, records, palletAssignments, masterItems, manualItemsBySj]);

  const totalAssignedPallets = useMemo(
    () => perSjSummaries.reduce((sum, s) => sum + s.pallets.length, 0),
    [perSjSummaries]
  );

  const hasAnySummaryItems = useMemo(
    () => perSjSummaries.some((s) => s.itemsSummary.length > 0),
    [perSjSummaries]
  );

  // Format date helper: YYYY-MM-DD -> DD/MM/YYYY
  const formatTanggalIndo = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Submit Surat Jalan (1 atau beberapa sekaligus, wajib input barang manual jika tidak ada pallet dipilih)
  const handleCreateSuratJalan = async () => {
    setFormError(null);

    const activeSlots = armadaEntries.slice(0, jumlahSuratJalan);
    const missingNopolIdx = activeSlots.findIndex((s) => !s.noPolisi.trim());
    if (missingNopolIdx !== -1) {
      setFormError(
        jumlahSuratJalan > 1
          ? `Nomor Polisi kendaraan pada Surat Jalan #${missingNopolIdx + 1} wajib diisi.`
          : 'Nomor Polisi kendaraan wajib diisi.'
      );
      return;
    }

    // Validasi: bila ada SJ tanpa pallet dipilih, wajib isi minimal 1 barang & jumlah box (> 0)
    for (let i = 0; i < jumlahSuratJalan; i++) {
      const sjPallets = perSjSummaries[i]?.pallets || [];
      if (sjPallets.length === 0) {
        const manualRows = getManualRowsForSj(i);
        const partialRow = manualRows.find((r) => {
          const hasName = r.namaBarang.trim().length > 0;
          const qty = parseFloat(r.qtyBox) || 0;
          return (hasName && qty <= 0) || (!hasName && qty > 0);
        });
        if (partialRow) {
          setFormError(
            `${jumlahSuratJalan > 1 ? `Pada SJ #${i + 1}: ` : ''}Lengkapi Nama Barang dan Jumlah Box (> 0) pada baris barang manual.`
          );
          return;
        }
        const validSummary = buildItemsSummaryFromManualRows(manualRows);
        if (validSummary.itemsSummary.length === 0) {
          setFormError(
            `${jumlahSuratJalan > 1 ? `Pada SJ #${i + 1}: ` : ''}Karena tidak ada pallet yang dipilih, wajib menginput Nama Barang dan Jumlah Box (> 0) agar produk tampil pada Surat Jalan.`
          );
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const customRaw = tglJamCetakCustom.trim();
      const parsedCustom = parseCustomDatetimeLocal(customRaw);
      const effectivePrintDate = parsedCustom || now;
      const formattedTanggalCetak = formatDateOnlyIndoFromDate(effectivePrintDate);
      const formattedWaktuCetak = formatWaktuCetakIndoFromDate(effectivePrintDate);

      const baseNo = noSuratJalan.trim() || generateAutoSuratJalanNo(suratJalanHistory.length);
      const createdRecords: SuratJalanRecord[] = [];

      for (let i = 0; i < jumlahSuratJalan; i++) {
        const slot = activeSlots[i] || {
          noSuratJalan: incrementSuratJalanNo(baseNo, i),
          noPolisi: '',
          namaDriver: '',
          noHpDriver: '',
          note: ''
        };
        const slotSummary = perSjSummaries[i] || {
          pallets: [],
          itemsSummary: [],
          grandTotalBox: 0,
          grandTotalKg: 0
        };

        const sjNo =
          i === 0
            ? noSuratJalan.trim() || slot.noSuratJalan.trim() || baseNo
            : slot.noSuratJalan.trim() || incrementSuratJalanNo(baseNo, i);

        const newRecord: SuratJalanRecord = {
          id: `sj-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
          noSuratJalan: sjNo,
          noDokumen: 'F/SCM/01.08',
          revNo: '05',
          halaman: '1/1',
          berlakuTanggal: '10/10/2026',
          tanggal: tanggalInput,
          tanggalPengambilanFormatted: formattedTanggalCetak,
          ...(customRaw ? { tglJamCetakCustom: customRaw } : {}),
          waktuCetakFormatted: formattedWaktuCetak,
          noPolisi: slot.noPolisi.trim().toUpperCase(),
          noPo: noPo.trim() || '-',
          noKontainer: noKontainer.trim() || '-',
          noFaktur: noFaktur.trim() || '-',
          noInvoice: noInvoice.trim() || '-',
          ruteDariId: ruteDariObj?.id || 'rute-dari',
          ruteDariNama: ruteDariObj?.namaLokasi || 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
          ...(ruteDariObj?.alamat ? { ruteDariAlamat: ruteDariObj.alamat } : {}),
          ruteTujuanId: ruteTujuanObj?.id || 'rute-tujuan',
          ruteTujuanKode: ruteTujuanObj?.kodeLokasi || 'SJA Semarang',
          ruteTujuanNama: ruteTujuanObj?.namaLokasi || 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG',
          ...(ruteTujuanObj?.alamat ? { ruteTujuanAlamat: ruteTujuanObj.alamat } : {}),
          vendorId: selectedVendorId,
          namaVendorArmada:
            customVendorNama ||
            masterVendors.find((v) => v.id === selectedVendorId)?.namaVendor ||
            'Vendor Armada',
          tarif: tarif,
          ppnPersen: ppnPersen,
          tarifTotal: tarif + (tarif * ppnPersen) / 100,
          namaDriver: slot.namaDriver.trim(),
          noHpDriver: slot.noHpDriver.trim(),
          palletIds: slotSummary.pallets.map((p) => p.id),
          itemsSummary: slotSummary.itemsSummary,
          grandTotalBox: slotSummary.grandTotalBox,
          grandTotalKg: slotSummary.grandTotalKg,
          note: slot.note.trim(),
          createdAt: new Date(now.getTime() + i).toISOString()
        };

        await onSaveSuratJalan(newRecord);
        createdRecords.push(newRecord);
      }

      // Open print preview modal with 1 or N separate Surat Jalan documents
      setPreviewRecord(createdRecords[0] || null);
      setPreviewRecords(createdRecords);
      setIsPrintModalOpen(true);

      // Reset form & regenerate next sequential No. SJ
      const nextBaseNo = generateAutoSuratJalanNo(suratJalanHistory.length + createdRecords.length);
      setPalletAssignments({});
      setManualItemsBySj({});
      setJumlahSuratJalan(1);
      setActiveSjIndex(0);
      setArmadaEntries([
        {
          noSuratJalan: nextBaseNo,
          noPolisi: '',
          namaDriver: '',
          noHpDriver: '',
          note: ''
        }
      ]);
      setNoPo('');
      setNoKontainer('');
      setNoFaktur('');
      setNoInvoice('');
      setTglJamCetakCustom('');
      setTarif(0);
      setPpnPersen(0);
      setPpnInputText('0');
      setSelectedVendorId('');
      setCustomVendorNama('');
      setSelectedTujuanId('');
      setNoSuratJalan(nextBaseNo);
    } catch (err) {
      console.error('Gagal membuat surat jalan:', err);
      setFormError('Terjadi kesalahan saat menyimpan Surat Jalan. Silakan coba lagi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers untuk Edit Surat Jalan di Riwayat
  const handleOpenEditModal = (sj: SuratJalanRecord) => {
    setEditError(null);
    setEditSuccessMsg(null);
    const clonedItems: SuratJalanItemLine[] = (sj.itemsSummary || []).map((item) => ({ ...item }));
    setEditingRecord({
      ...sj,
      palletIds: [...(sj.palletIds || [])],
      itemsSummary: clonedItems
    });
    setEditTglJamInput(toDatetimeLocalValue(sj.tglJamCetakCustom || sj.waktuCetakFormatted));
    setEditPpnText(String(sj.ppnPersen ?? 0).replace('.', ','));
  };

  const handleUpdateEditItemRow = (idx: number, patch: Partial<SuratJalanItemLine>) => {
    setEditingRecord((prev) => {
      if (!prev) return prev;
      const nextItems = prev.itemsSummary.map((item, i) => {
        if (i !== idx) return item;
        const merged = { ...item, ...patch };
        const qty = Number(merged.qtyBox) || 0;
        const berat = Number(merged.beratPerBoxKg) || 0;
        return {
          ...merged,
          totalKg: Math.round(qty * berat * 100) / 100
        };
      });
      const grandTotalBox = nextItems.reduce((sum, it) => sum + (Number(it.qtyBox) || 0), 0);
      const grandTotalKg = nextItems.reduce((sum, it) => sum + (Number(it.totalKg) || 0), 0);
      return {
        ...prev,
        itemsSummary: nextItems,
        grandTotalBox,
        grandTotalKg
      };
    });
  };

  const handleAddEditItemRow = () => {
    setEditingRecord((prev) => {
      if (!prev) return prev;
      const nextItems: SuratJalanItemLine[] = [
        ...prev.itemsSummary,
        {
          kodeItem: '-',
          namaBarang: '',
          detailBarang: '(1 X 30 KG)',
          qtyBox: 1,
          beratPerBoxKg: 30,
          totalKg: 30
        }
      ];
      return {
        ...prev,
        itemsSummary: nextItems,
        grandTotalBox: nextItems.reduce((sum, it) => sum + (Number(it.qtyBox) || 0), 0),
        grandTotalKg: nextItems.reduce((sum, it) => sum + (Number(it.totalKg) || 0), 0)
      };
    });
  };

  const handleRemoveEditItemRow = (idx: number) => {
    setEditingRecord((prev) => {
      if (!prev) return prev;
      const nextItems = prev.itemsSummary.filter((_, i) => i !== idx);
      return {
        ...prev,
        itemsSummary: nextItems,
        grandTotalBox: nextItems.reduce((sum, it) => sum + (Number(it.qtyBox) || 0), 0),
        grandTotalKg: nextItems.reduce((sum, it) => sum + (Number(it.totalKg) || 0), 0)
      };
    });
  };

  const handleSaveEditedSuratJalan = async (openPrintAfter = false) => {
    if (!editingRecord) return;
    setEditError(null);

    if (!editingRecord.noSuratJalan.trim()) {
      setEditError('Nomor Surat Jalan wajib diisi.');
      return;
    }
    if (!editingRecord.noPolisi.trim()) {
      setEditError('Nomor Polisi kendaraan wajib diisi.');
      return;
    }

    const cleanedItems = editingRecord.itemsSummary
      .map((it) => {
        const qty = Number(it.qtyBox) || 0;
        const berat = Number(it.beratPerBoxKg) || 0;
        return {
          ...it,
          namaBarang: it.namaBarang.trim(),
          kodeItem: (it.kodeItem || '-').trim(),
          detailBarang: it.detailBarang.trim() || `(1 X ${berat} KG)`,
          qtyBox: qty,
          beratPerBoxKg: berat,
          totalKg: Math.round(qty * berat * 100) / 100
        };
      })
      .filter((it) => it.namaBarang !== '' || it.qtyBox > 0);

    const invalidItem = cleanedItems.find((it) => !it.namaBarang || it.qtyBox <= 0);
    if (invalidItem) {
      setEditError('Pastikan setiap baris barang memiliki Nama Barang dan Qty Box > 0.');
      return;
    }
    if (cleanedItems.length === 0) {
      setEditError('Minimal harus ada 1 baris barang dengan Nama Barang dan Qty Box > 0.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const parsedPrintDt = parseCustomDatetimeLocal(editTglJamInput.trim());
      const formattedTanggalOnly = parsedPrintDt
        ? formatDateOnlyIndoFromDate(parsedPrintDt)
        : editingRecord.tanggalPengambilanFormatted;
      const formattedWaktuCetak = parsedPrintDt
        ? formatWaktuCetakIndoFromDate(parsedPrintDt)
        : editingRecord.waktuCetakFormatted;

      const tarifVal = Number(editingRecord.tarif) || 0;
      const ppnVal = Number(editingRecord.ppnPersen) || 0;
      const grandTotalBox = cleanedItems.reduce((sum, it) => sum + it.qtyBox, 0);
      const grandTotalKg = cleanedItems.reduce((sum, it) => sum + it.totalKg, 0);

      const updatedRecord: SuratJalanRecord = {
        ...editingRecord,
        noSuratJalan: editingRecord.noSuratJalan.trim(),
        noPolisi: editingRecord.noPolisi.trim().toUpperCase(),
        noPo: editingRecord.noPo.trim() || '-',
        noKontainer: (editingRecord.noKontainer || '').trim() || '-',
        noFaktur: (editingRecord.noFaktur || '').trim() || '-',
        noInvoice: (editingRecord.noInvoice || '').trim() || '-',
        namaVendorArmada: editingRecord.namaVendorArmada.trim() || 'Vendor Armada',
        namaDriver: editingRecord.namaDriver.trim(),
        noHpDriver: editingRecord.noHpDriver.trim(),
        note: (editingRecord.note || '').trim(),
        tarif: tarifVal,
        ppnPersen: ppnVal,
        tarifTotal: tarifVal + (tarifVal * ppnVal) / 100,
        tanggalPengambilanFormatted: formattedTanggalOnly,
        ...(editTglJamInput.trim() ? { tglJamCetakCustom: editTglJamInput.trim() } : {}),
        ...(formattedWaktuCetak ? { waktuCetakFormatted: formattedWaktuCetak } : {}),
        itemsSummary: cleanedItems,
        grandTotalBox,
        grandTotalKg
      };

      if (!editTglJamInput.trim()) {
        delete updatedRecord.tglJamCetakCustom;
      }

      await onSaveSuratJalan(updatedRecord);
      setEditingRecord(null);
      setEditSuccessMsg(`Surat Jalan ${updatedRecord.noSuratJalan} berhasil diperbarui.`);

      if (openPrintAfter) {
        setPreviewRecord(updatedRecord);
        setPreviewRecords([updatedRecord]);
        setIsPrintModalOpen(true);
      }
    } catch (err) {
      console.error('Gagal menyimpan perubahan surat jalan:', err);
      setEditError('Terjadi kesalahan saat menyimpan perubahan Surat Jalan.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md shadow-blue-500/20">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  Surat Jalan / Delivery Note
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  Form F/SCM/01.08
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Penerbitan surat jalan resmi muatan pallet yang telah di-outbound ke lokasi tujuan
              </p>
            </div>
          </div>

          {/* Sub-tab switches */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveSubTab('create')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'create'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Buat Surat Jalan</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeSubTab === 'history'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Riwayat Surat Jalan ({suratJalanHistory.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: BUAT SURAT JALAN */}
      {activeSubTab === 'create' && (
        <div className="space-y-6">
          {/* Form Input Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>Informasi Pengiriman & Armada Kendaraan</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
              {/* Row 1: Tanggal Pengambilan, Tgl & Jam Cetak Custom, No Surat Jalan, PO */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tanggal Pengambilan *</span>
                </label>
                <input
                  type="date"
                  value={tanggalInput}
                  onChange={(e) => setTanggalInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-medium text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tgl &amp; Jam Cetak SJ (Kosongkan jika real-time)</span>
                </label>
                <input
                  type="datetime-local"
                  value={tglJamCetakCustom}
                  onChange={(e) => setTglJamCetakCustom(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-medium text-slate-900 dark:text-slate-100"
                  title="Tanggal & jam dicatat untuk riwayat cetak, sedangkan pada formulir Surat Jalan yang tercetak hanya menampilkan tanggalnya saja."
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {tglJamCetakCustom
                    ? 'Tgl & jam tercatat; di cetak SJ hanya tampil tanggal'
                    : 'Otomatis tgl & jam real-time (cetak SJ hanya tanggal)'}
                </span>
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Surat Jalan *
                </label>
                <input
                  type="text"
                  value={noSuratJalan}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNoSuratJalan(val);
                    setArmadaEntries((prev) =>
                      prev.map((entry, idx) => ({
                        ...entry,
                        noSuratJalan: idx === 0 ? val : incrementSuratJalanNo(val, idx)
                      }))
                    );
                  }}
                  placeholder="FGW/26/XI/032"
                  className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-blue-600 dark:text-blue-400"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. PO (Purchase Order)
                </label>
                <input
                  type="text"
                  value={noPo}
                  onChange={(e) => setNoPo(e.target.value)}
                  placeholder="Masukkan No. PO (kosongkan jika tidak ada)"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Row 2: No Kontainer, No Faktur, No Invoice, No Dokumen */}
              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Kontainer
                </label>
                <input
                  type="text"
                  value={noKontainer}
                  onChange={(e) => setNoKontainer(e.target.value)}
                  placeholder="Masukkan No. Kontainer..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Faktur
                </label>
                <input
                  type="text"
                  value={noFaktur}
                  onChange={(e) => setNoFaktur(e.target.value)}
                  placeholder="Masukkan No. Faktur..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Invoice
                </label>
                <input
                  type="text"
                  value={noInvoice}
                  onChange={(e) => setNoInvoice(e.target.value)}
                  placeholder="Masukkan No. Invoice..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Dokumen / Revisi
                </label>
                <input
                  type="text"
                  disabled
                  value="F/SCM/01.08 (Rev. 05)"
                  className="w-full bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-lg px-3 py-2 text-slate-500 font-mono"
                />
              </div>

              {/* Row 3: Rute Dari & Rute Tujuan */}
              <div className="md:col-span-6 bg-slate-50/80 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Rute Asal (Dari) *</span>
                </label>
                <select
                  value={selectedDariId}
                  onChange={(e) => setSelectedDariId(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-semibold text-slate-900 dark:text-slate-100"
                >
                  <option value="">-- Pilih Rute Asal --</option>
                  {uniqueMasterRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.namaLokasi}
                    </option>
                  ))}
                </select>
                {ruteDariObj?.alamat ? (
                  <p className="text-[11px] text-slate-500 mt-1 pl-1">
                    Alamat: {ruteDariObj.alamat}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1 pl-1 italic">
                    Pilih lokasi gudang asal pengiriman barang
                  </p>
                )}
              </div>

              <div className="md:col-span-6 bg-blue-50/60 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-200 dark:border-blue-900/60">
                <label className="block text-[11px] font-semibold text-blue-900 dark:text-blue-300 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  <span>Rute Tujuan (Menyaring List Outbound Pallet) *</span>
                </label>
                <select
                  value={selectedTujuanId}
                  onChange={(e) => {
                    setSelectedTujuanId(e.target.value);
                    setPalletAssignments({}); // Reset selected pallets when destination changes
                  }}
                  className="w-full bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg px-3 py-2 font-bold text-blue-900 dark:text-blue-200"
                >
                  <option value="">-- Pilih Rute Tujuan --</option>
                  {uniqueMasterRoutes.map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.kodeLokasi}] {r.namaLokasi}
                    </option>
                  ))}
                </select>
                {ruteTujuanObj?.alamat ? (
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1 pl-1">
                    Alamat: {ruteTujuanObj.alamat}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1 pl-1 italic">
                    Vendor dan tarif pengiriman akan otomatis muncul sesuai rute asal &amp; tujuan
                  </p>
                )}
              </div>

              {/* Row 4: Pilihan Vendor & Harga Kesamping + PPN Kecil & Total Tarif di Bawahnya */}
              <div className="md:col-span-12 bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700/70 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Pilih Vendor Armada &amp; Tarif Pengiriman *</span>
                  </label>
                  {selectedDariId && selectedTujuanId && matchingTariffs.length > 0 && (
                    <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                      {matchingTariffs.length} Pilihan Vendor Tersedia — Silakan Pilih
                    </span>
                  )}
                </div>

                {/* Pilihan Vendor Kesamping apabila Rute Asal & Tujuan sudah diketahui */}
                {selectedDariId && selectedTujuanId && matchingTariffs.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-stretch gap-2">
                      {matchingTariffs.map((t) => {
                        const isPicked = selectedVendorId === `tariff-${t.id}`;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => handleSelectTariffCard(t)}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isPicked
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-500/20'
                                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-300 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-slate-800/80'
                            }`}
                          >
                            <div
                              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                isPicked
                                  ? 'border-white bg-white'
                                  : 'border-slate-400 dark:border-slate-500'
                              }`}
                            >
                              {isPicked && <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />}
                            </div>
                            <div className="leading-tight">
                              <div className="text-xs font-extrabold tracking-wide">
                                {t.vendor}
                              </div>
                              <div
                                className={`text-[11px] font-mono mt-0.5 ${
                                  isPicked ? 'text-blue-100' : 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                }`}
                              >
                                Rp {t.tarif.toLocaleString('id-ID')}
                                {t.ppnPersen > 0 && (
                                  <span className={`ml-1 text-[10px] ${isPicked ? 'text-blue-200' : 'text-slate-400'}`}>
                                    (PPN {String(t.ppnPersen).replace('.', ',')}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}

                      {/* Opsi pilih vendor lain / input manual */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVendorId('other');
                          setCustomVendorNama('');
                          setTarif(0);
                          setPpnPersen(0);
                          setPpnInputText('0');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                          selectedVendorId && !selectedVendorId.startsWith('tariff-')
                            ? 'bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Vendor Lainnya</span>
                      </button>
                    </div>

                    {/* Input tambahan jika petugas memilih Vendor Lainnya */}
                    {selectedVendorId && !selectedVendorId.startsWith('tariff-') && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        <select
                          value={selectedVendorId === 'other' ? '' : selectedVendorId}
                          onChange={(e) => handleVendorChange(e.target.value)}
                          className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium"
                        >
                          <option value="">-- Pilih Master Vendor --</option>
                          {tariffOnlyVendorNames.length > 0 && (
                            <optgroup label="Vendor dari Master Tujuan &amp; Tarif">
                              {tariffOnlyVendorNames.map((vName) => (
                                <option key={vName} value={`tname-${vName}`}>
                                  {vName}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {masterVendors.length > 0 && (
                            <optgroup label="Daftar Master Armada">
                              {masterVendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.namaVendor}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="custom">+ Tulis Nama Vendor Manual</option>
                        </select>
                        {selectedVendorId === 'custom' && (
                          <input
                            type="text"
                            value={customVendorNama}
                            onChange={(e) => setCustomVendorNama(e.target.value)}
                            placeholder="Ketik nama vendor armada..."
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">Tarif (Rp):</span>
                          <input
                            type="number"
                            min="0"
                            value={tarif}
                            onChange={(e) => setTarif(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Fallback sebelum Rute Asal & Tujuan dipilih, atau jika tidak ada tarif terdaftar untuk rute tersebut */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <select
                        value={selectedVendorId}
                        onChange={(e) => handleVendorChange(e.target.value)}
                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-medium"
                      >
                        <option value="">
                          {!selectedDariId || !selectedTujuanId
                            ? '-- Pilih Rute Asal & Tujuan terlebih dahulu (atau pilih vendor) --'
                            : '-- Pilih Vendor Armada --'}
                        </option>
                        {tariffOnlyVendorNames.length > 0 && (
                          <optgroup label="Vendor dari Master Tujuan &amp; Tarif">
                            {tariffOnlyVendorNames.map((vName) => (
                              <option key={vName} value={`tname-${vName}`}>
                                {vName}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {masterVendors.length > 0 && (
                          <optgroup label="Daftar Master Armada">
                            {masterVendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.namaVendor}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <option value="custom">+ Tulis Manual / Lainnya</option>
                      </select>
                      {selectedVendorId === 'custom' && (
                        <input
                          type="text"
                          value={customVendorNama}
                          onChange={(e) => setCustomVendorNama(e.target.value)}
                          placeholder="Masukkan nama vendor armada..."
                          className="w-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs"
                        />
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        Tarif (Rp):
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={tarif}
                        onChange={(e) => setTarif(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-bold"
                      />
                    </div>
                  </div>
                )}

                {/* Bagian Bawah: PPN tampilan kecil + Total Tarif (Rp) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-200/80 dark:border-slate-700/70 text-[11px]">
                  <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
                    {customVendorNama && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Vendor:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{customVendorNama}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Tarif:</span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                        Rp {tarif.toLocaleString('id-ID')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 font-medium">PPN (%):</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={ppnInputText}
                        onChange={(e) => {
                          setPpnInputText(e.target.value);
                          const parsed = parseFloat(e.target.value.replace(',', '.'));
                          setPpnPersen(isNaN(parsed) || parsed < 0 ? 0 : parsed);
                        }}
                        placeholder="0"
                        className="w-12 font-mono text-[11px] text-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-[10px] text-slate-400 font-mono">
                        (Rp {Math.round((tarif * ppnPersen) / 100).toLocaleString('id-ID')})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1">
                    <span className="text-slate-500 font-semibold">Total Tarif:</span>
                    <span className="text-xs font-mono font-extrabold text-emerald-700 dark:text-emerald-400">
                      Rp {Math.round(tarif + (tarif * ppnPersen) / 100).toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 5: Jumlah Surat Jalan yang Dicetak (di atas bagian Nopol Kendaraan) & Baris Nopol Kendaraan */}
              <div className="md:col-span-12 pt-1 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Jumlah Surat Jalan yang Dicetak
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Jika diisi lebih dari 1, setiap Surat Jalan memiliki baris Nopol &amp; pilihan pallet masing-masing saat dicetak
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleChangeJumlahSuratJalan(jumlahSuratJalan - 1)}
                      disabled={jumlahSuratJalan <= 1}
                      className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={jumlahSuratJalan}
                      onChange={(e) => handleChangeJumlahSuratJalan(parseInt(e.target.value, 10) || 1)}
                      className="w-16 text-center font-mono font-bold bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-lg px-2 py-1 text-blue-700 dark:text-blue-300"
                    />
                    <button
                      type="button"
                      onClick={() => handleChangeJumlahSuratJalan(jumlahSuratJalan + 1)}
                      disabled={jumlahSuratJalan >= 20}
                      className="w-7 h-7 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      +
                    </button>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 ml-1">
                      Surat Jalan
                    </span>
                  </div>
                </div>

                {/* Baris Nopol Kendaraan per Surat Jalan */}
                <div className="space-y-2.5">
                  {armadaEntries.slice(0, jumlahSuratJalan).map((entry, idx) => {
                    const isSjActive = activeSjIndex === idx;
                    const sjPalletCount = perSjSummaries[idx]?.pallets.length || 0;
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3 transition-colors ${
                          jumlahSuratJalan > 1 && isSjActive
                            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {jumlahSuratJalan > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-200/80 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-600 text-white">
                                Surat Jalan #{idx + 1}
                              </span>
                              <input
                                type="text"
                                value={entry.noSuratJalan}
                                onChange={(e) =>
                                  handleUpdateArmadaEntry(idx, 'noSuratJalan', e.target.value)
                                }
                                className="font-mono font-bold text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-blue-700 dark:text-blue-300 w-36"
                                title="Nomor Surat Jalan"
                              />
                              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                ({sjPalletCount} Pallet dipilih)
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setActiveSjIndex(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                isSjActive
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-blue-100'
                              }`}
                            >
                              {isSjActive ? 'Sedang Memilih Pallet untuk SJ Ini' : 'Pilih Pallet untuk SJ Ini'}
                            </button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Nopol Kendaraan {jumlahSuratJalan > 1 ? `#${idx + 1}` : ''} *
                            </label>
                            <input
                              type="text"
                              required
                              value={entry.noPolisi}
                              onChange={(e) =>
                                handleUpdateArmadaEntry(idx, 'noPolisi', e.target.value.toUpperCase())
                              }
                              placeholder="Contoh: AB 8996 OE"
                              className="w-full font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                              <span>Nama Driver</span>
                            </label>
                            <input
                              type="text"
                              value={entry.namaDriver}
                              onChange={(e) =>
                                handleUpdateArmadaEntry(idx, 'namaDriver', e.target.value)
                              }
                              placeholder="Nama pengemudi armada"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              <span>Nomor HP Driver</span>
                            </label>
                            <input
                              type="text"
                              value={entry.noHpDriver}
                              onChange={(e) =>
                                handleUpdateArmadaEntry(idx, 'noHpDriver', e.target.value)
                              }
                              placeholder="0812-xxxx-xxxx"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Catatan / Note Khusus
                            </label>
                            <input
                              type="text"
                              value={entry.note}
                              onChange={(e) =>
                                handleUpdateArmadaEntry(idx, 'note', e.target.value)
                              }
                              placeholder="Contoh: Muatan konversi reguler"
                              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Outbound Pallet Matching List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      List Pallet Diambil (Tujuan: {ruteTujuanObj?.kodeLokasi || 'Semua'})
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {availableOutboundPallets.length} Pallet Siap Muat
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Centang pallet yang akan dibawa oleh armada ini (opsional — Surat Jalan tetap bisa dicetak walau tidak ada pallet yang dipilih)
                  </p>
                </div>

                {/* Date filter checkbox (pallet yang sudah masuk SJ otomatis dihilangkan) */}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterByDate}
                      onChange={(e) => setFilterByDate(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Filter tanggal {tanggalInput}</span>
                  </label>
                </div>
              </div>

              {/* Filter Lokasi Gudang & Lokasi Bin */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>Filter Lokasi:</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="sj-filter-gudang" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Lokasi Gudang
                  </label>
                  <select
                    id="sj-filter-gudang"
                    value={selectedGudangFilter}
                    onChange={(e) => {
                      setSelectedGudangFilter(e.target.value);
                      setSelectedBinFilter('ALL');
                    }}
                    className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">Semua Lokasi Gudang</option>
                    {gudangFilterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="sj-filter-bin" className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    Lokasi Bin
                  </label>
                  <select
                    id="sj-filter-bin"
                    value={selectedBinFilter}
                    onChange={(e) => setSelectedBinFilter(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">Semua Lokasi Bin</option>
                    {binFilterOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Bin {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {(selectedGudangFilter !== 'ALL' || selectedBinFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGudangFilter('ALL');
                      setSelectedBinFilter('ALL');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Filter</span>
                  </button>
                )}
              </div>
            </div>

            {/* Selector aktif SJ bila jumlahSuratJalan > 1 */}
            {jumlahSuratJalan > 1 && availableOutboundPallets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs">
                <span className="font-bold text-blue-900 dark:text-blue-200 mr-1">
                  Pilih Pallet untuk:
                </span>
                {armadaEntries.slice(0, jumlahSuratJalan).map((entry, idx) => {
                  const isActive = activeSjIndex === idx;
                  const count = perSjSummaries[idx]?.pallets.length || 0;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSjIndex(idx)}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      SJ #{idx + 1} {entry.noPolisi ? `(${entry.noPolisi})` : ''} &bull; {count} Pallet
                    </button>
                  );
                })}
              </div>
            )}

            {availableOutboundPallets.length === 0 ? (
              <div className="py-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                  {selectedGudangFilter !== 'ALL' || selectedBinFilter !== 'ALL'
                    ? 'Tidak Ada Pallet Diambil pada Filter Lokasi Tersebut'
                    : `Belum Ada Pallet Tersedia untuk Tujuan "${ruteTujuanObj?.kodeLokasi || 'Semua'}"`}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  {selectedGudangFilter !== 'ALL' || selectedBinFilter !== 'ALL'
                    ? 'Ubah atau reset filter Lokasi Gudang / Lokasi Bin untuk melihat pallet siap muat lainnya.'
                    : `Semua pallet yang sudah masuk Surat Jalan otomatis disembunyikan. Anda tetap dapat mencetak Surat Jalan tanpa memilih pallet melalui tombol di bawah.`}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    {selectedCountForActiveSj === availableOutboundPallets.length ? (
                      <>
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                        <span>
                          Batalkan Pilih Semua{' '}
                          {jumlahSuratJalan > 1 ? `(SJ #${activeSjIndex + 1})` : ''}
                        </span>
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4 text-slate-400" />
                        <span>
                          Pilih Semua ({availableOutboundPallets.length} Pallet)
                          {jumlahSuratJalan > 1 ? ` untuk SJ #${activeSjIndex + 1}` : ''}
                        </span>
                      </>
                    )}
                  </button>

                  <div className="text-slate-500">
                    Total dipilih:{' '}
                    <span className="font-bold text-blue-600">{totalAssignedPallets}</span> dari{' '}
                    {availableOutboundPallets.length} pallet
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              availableOutboundPallets.length > 0 &&
                              selectedCountForActiveSj === availableOutboundPallets.length
                            }
                            onChange={handleSelectAll}
                            className="rounded text-blue-600"
                          />
                        </th>
                        {jumlahSuratJalan > 1 && (
                          <th className="py-2.5 px-3 text-center">Masuk Ke SJ</th>
                        )}
                        <th className="py-2.5 px-3">No. Pallet</th>
                        <th className="py-2.5 px-3">Kode Item</th>
                        <th className="py-2.5 px-3">Nama Barang</th>
                        <th className="py-2.5 px-3">Asal Bin</th>
                        <th className="py-2.5 px-3 text-center">No. Batch</th>
                        <th className="py-2.5 px-3 text-center">Range Box</th>
                        <th className="py-2.5 px-3 text-center">Qty (Box)</th>
                        <th className="py-2.5 px-3 text-right">Berat (Kg)</th>
                        <th className="py-2.5 px-3">Waktu Outbound</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {availableOutboundPallets.map((pallet) => {
                        const assignedSjIdx = palletAssignments[pallet.id];
                        const isSelectedForActive = assignedSjIdx === activeSjIndex;
                        const isAssignedAnywhere = assignedSjIdx !== undefined;
                        const master = masterItems.find(
                          (m) =>
                            m.kodeItem.toLowerCase() === pallet.kodeItem.toLowerCase() ||
                            m.namaBarang.toLowerCase() === pallet.namaBarang.toLowerCase()
                        );
                        const beratPerBox = master?.beratPerBoxKg ?? 30;
                        const totalBeratRow = (Number(pallet.qtyPallet) || 1) * beratPerBox;

                        return (
                          <tr
                            key={pallet.id}
                            onClick={() => handleToggleSelectPallet(pallet.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelectedForActive
                                ? 'bg-blue-50/80 dark:bg-blue-950/40'
                                : isAssignedAnywhere
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelectedForActive}
                                onChange={() => handleToggleSelectPallet(pallet.id)}
                                className="rounded text-blue-600"
                              />
                            </td>
                            {jumlahSuratJalan > 1 && (
                              <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {Array.from({ length: jumlahSuratJalan }, (_, sIdx) => {
                                    const active = assignedSjIdx === sIdx;
                                    return (
                                      <button
                                        key={sIdx}
                                        type="button"
                                        onClick={() => handleAssignPalletToSj(pallet.id, sIdx)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                                          active
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-100'
                                        }`}
                                      >
                                        SJ {sIdx + 1}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                            )}
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                              {pallet.nomorPallet}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-blue-600 dark:text-blue-400">
                              {pallet.kodeItem}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                              {pallet.namaBarang}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {pallet.lokasiBin}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-slate-300">
                              {(() => {
                                const batches = getPalletBatches(pallet);
                                if (batches.length > 1) {
                                  return (
                                    <div className="space-y-0.5">
                                      {batches.map((b, bIdx) => (
                                        <div key={bIdx}>{b.noBatch || '-'}</div>
                                      ))}
                                    </div>
                                  );
                                }
                                return pallet.noBatch || '-';
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono text-slate-600 dark:text-slate-300">
                              {(() => {
                                const batches = getPalletBatches(pallet);
                                if (batches.length > 1) {
                                  return (
                                    <div className="space-y-0.5">
                                      {batches.map((b, bIdx) => (
                                        <div key={bIdx}>
                                          {b.boxAwal && b.boxAkhir
                                            ? `${b.boxAwal} - ${b.boxAkhir}`
                                            : b.boxAwal || b.boxAkhir || '-'}
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return pallet.boxAwal && pallet.boxAkhir
                                  ? `${pallet.boxAwal} - ${pallet.boxAkhir}`
                                  : '-';
                              })()}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-900 dark:text-white">
                              {pallet.qtyPallet} Box
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                              {totalBeratRow.toLocaleString('id-ID')} Kg
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                              {pallet.tanggalPengambilan
                                ? new Date(pallet.tanggalPengambilan).toLocaleString('id-ID', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Input Barang Manual Wajib jika ada Surat Jalan yang 0 pallet dipilih */}
            {perSjSummaries.some((s) => s.pallets.length === 0) && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800/70 space-y-3">
                <div className="flex items-start gap-2.5">
                  <PackagePlus className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Input Nama Barang &amp; Jumlah Box (Wajib karena tidak ada pallet dipilih)
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/80 mt-0.5">
                      Isi produk dan jumlah Box agar nama barang tercetak pada formulir Surat Jalan.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {perSjSummaries
                    .filter((s) => s.pallets.length === 0)
                    .map((sjSum) => {
                      const sjIdx = sjSum.sjIndex;
                      const entry = armadaEntries[sjIdx];
                      const manualRows = getManualRowsForSj(sjIdx);

                      return (
                        <div
                          key={sjIdx}
                          className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-slate-700 p-3 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 text-xs">
                              {jumlahSuratJalan > 1 && (
                                <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[11px]">
                                  SJ #{sjIdx + 1}
                                </span>
                              )}
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                                {entry?.noSuratJalan || `Surat Jalan #${sjIdx + 1}`}
                              </span>
                              {entry?.noPolisi && (
                                <span className="text-[11px] font-semibold text-slate-500">
                                  ({entry.noPolisi})
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddManualRow(sjIdx)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Tambah Baris Barang</span>
                            </button>
                          </div>

                          <div className="space-y-2">
                            {manualRows.map((row, rowIdx) => {
                              const qtyVal = parseFloat(row.qtyBox) || 0;
                              const beratVal = parseFloat(row.beratPerBoxKg);
                              const effectiveBerat = !isNaN(beratVal) && beratVal >= 0 ? beratVal : 30;
                              const rowTotalKg = qtyVal * effectiveBerat;
                              const selectedMaster = masterItems.find(
                                (m) =>
                                  m.id === row.masterItemId ||
                                  (!row.isCustom &&
                                    row.namaBarang &&
                                    m.namaBarang.toLowerCase() === row.namaBarang.trim().toLowerCase())
                              );
                              const selectVal = row.isCustom
                                ? '__CUSTOM__'
                                : selectedMaster?.id || '';

                              return (
                                <div
                                  key={row.id}
                                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-slate-50/70 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700/70 text-xs"
                                >
                                  <div className="md:col-span-5">
                                    <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                      Nama Barang (Sesuai Master Barang) *
                                    </label>
                                    <select
                                      value={selectVal}
                                      onChange={(e) =>
                                        handleSelectMasterForManualRow(sjIdx, rowIdx, e.target.value)
                                      }
                                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                                    >
                                      <option value="">-- Pilih Nama Barang dari Master --</option>
                                      {masterItems.map((m) => (
                                        <option key={m.id} value={m.id}>
                                          {m.namaBarang} ({m.kodeItem})
                                        </option>
                                      ))}
                                      <option value="__CUSTOM__">+ Ketik Nama Barang Manual</option>
                                    </select>
                                    {row.isCustom && (
                                      <input
                                        type="text"
                                        value={row.namaBarang}
                                        onChange={(e) =>
                                          handleUpdateManualRow(sjIdx, rowIdx, {
                                            namaBarang: e.target.value
                                          })
                                        }
                                        placeholder="Ketik nama barang manual..."
                                        className="w-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold text-slate-900 dark:text-slate-100"
                                      />
                                    )}
                                  </div>

                                  <div className="md:col-span-3">
                                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                      Kode Item / Detail
                                    </label>
                                    <input
                                      type="text"
                                      value={row.kodeItem}
                                      onChange={(e) =>
                                        handleUpdateManualRow(sjIdx, rowIdx, {
                                          kodeItem: e.target.value
                                        })
                                      }
                                      placeholder="Otomatis dari master / opsional"
                                      className="w-full font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100"
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                      Jumlah Box *
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={row.qtyBox}
                                      onChange={(e) =>
                                        handleUpdateManualRow(sjIdx, rowIdx, {
                                          qtyBox: e.target.value
                                        })
                                      }
                                      placeholder="0"
                                      className="w-full font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-blue-700 dark:text-blue-300"
                                    />
                                  </div>

                                  <div className="md:col-span-2 flex items-end gap-1.5">
                                    <div className="flex-1">
                                      <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                                        Kg/Box ({rowTotalKg.toLocaleString('id-ID')} Kg)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={row.beratPerBoxKg}
                                        onChange={(e) =>
                                          handleUpdateManualRow(sjIdx, rowIdx, {
                                            beratPerBoxKg: e.target.value
                                          })
                                        }
                                        className="w-full font-mono bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100"
                                      />
                                    </div>
                                    {manualRows.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveManualRow(sjIdx, rowIdx)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                                        title="Hapus baris"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Inline error validation banner */}
            {formError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Aggregated Live Preview + Submit Button */}
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3">
              {hasAnySummaryItems ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        Ringkasan Barang yang Masuk ke {jumlahSuratJalan > 1 ? `${jumlahSuratJalan} Surat Jalan` : 'Form Surat Jalan'}
                      </span>
                    </h4>
                    <div className="flex items-center gap-4 text-xs font-mono font-bold">
                      <span>Total Pallet: {totalAssignedPallets}</span>
                      <span className="text-blue-600">
                        Total: {perSjSummaries.reduce((s, x) => s + x.grandTotalBox, 0)} Box
                      </span>
                      <span className="text-emerald-600">
                        Total: {perSjSummaries.reduce((s, x) => s + x.grandTotalKg, 0).toLocaleString('id-ID')} Kg
                      </span>
                    </div>
                  </div>

                  {jumlahSuratJalan === 1 ? (
                    <div className="space-y-1 text-xs">
                      {perSjSummaries[0]?.itemsSummary.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1.5 px-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white mr-2">
                              {item.namaBarang}
                            </span>
                            <span className="font-mono text-slate-500 text-[11px]">
                              ({item.detailBarang})
                            </span>
                          </div>
                          <div className="flex items-center gap-4 font-mono font-semibold">
                            <span>{item.qtyBox} Box</span>
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {item.totalKg.toLocaleString('id-ID')} Kg
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {perSjSummaries.map((sjSum, idx) => {
                        const entry = armadaEntries[idx];
                        return (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-[11px]">
                                SJ #{idx + 1}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white">
                                {entry?.noPolisi || '(Nopol belum diisi)'}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {entry?.noSuratJalan}
                              </span>
                            </div>
                            <div className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {sjSum.itemsSummary.length > 0 ? (
                                <span>
                                  {sjSum.pallets.length > 0
                                    ? `${sjSum.pallets.length} Pallet`
                                    : `${sjSum.itemsSummary.length} Item Manual`}{' '}
                                  &bull; {sjSum.grandTotalBox} Box &bull;{' '}
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {sjSum.grandTotalKg.toLocaleString('id-ID')} Kg
                                  </span>
                                </span>
                              ) : (
                                <span className="text-amber-600 dark:text-amber-400 italic font-sans">
                                  Belum ada barang / pallet
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Pilih pallet di atas atau lengkapi <strong>Nama Barang &amp; Jumlah Box</strong> pada form Input Barang Manual di atas sebelum menerbitkan Surat Jalan.
                  </span>
                </div>
              )}

              {/* Submit action button */}
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleCreateSuratJalan}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? 'Memproses Dokumen...'
                      : jumlahSuratJalan > 1
                        ? `Terbitkan & Cetak ${jumlahSuratJalan} Surat Jalan`
                        : 'Terbitkan & Cetak Surat Jalan'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RIWAYAT SURAT JALAN */}
      {activeSubTab === 'history' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Daftar Riwayat Surat Jalan Terbit
              </h3>
              <p className="text-xs text-slate-500">
                Semua dokumen pengiriman yang pernah dicetak dan diterbitkan
              </p>
            </div>
            <div className="text-xs text-slate-500">
              Total: {suratJalanHistory.length} Surat Jalan
            </div>
          </div>

          {editSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{editSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditSuccessMsg(null)}
                className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {suratJalanHistory.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              Belum ada riwayat Surat Jalan yang diterbitkan.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">No. Surat Jalan</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">Rute Tujuan</th>
                    <th className="py-2.5 px-3">Nopol Kendaraan</th>
                    <th className="py-2.5 px-3">Vendor / Driver</th>
                    <th className="py-2.5 px-3 text-center">Total Box</th>
                    <th className="py-2.5 px-3 text-right">Total Berat (Kg)</th>
                    <th className="py-2.5 px-3 text-center w-44">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {suratJalanHistory.map((sj) => (
                    <tr key={sj.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {sj.noSuratJalan}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                        <div className="font-semibold">{sj.tanggalPengambilanFormatted || sj.tanggal}</div>
                        {sj.waktuCetakFormatted && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>Cetak: {sj.waktuCetakFormatted}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                        <div className="font-bold">{sj.ruteTujuanKode}</div>
                        <div className="text-[10px] text-slate-500 truncate max-w-xs">{sj.ruteTujuanNama}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold tracking-wider">
                        {sj.noPolisi}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {sj.namaVendorArmada}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {sj.namaDriver} ({sj.noHpDriver})
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold font-mono">
                        {sj.grandTotalBox} Box
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {sj.grandTotalKg.toLocaleString('id-ID')} Kg
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(sj)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer"
                            title="Edit Surat Jalan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewRecord(sj);
                              setPreviewRecords([sj]);
                              setIsPrintModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Cetak Ulang</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal Edit Surat Jalan */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Edit Surat Jalan — {editingRecord.noSuratJalan}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ubah informasi pengiriman, armada, rute, atau daftar barang yang tertera pada Surat Jalan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {editError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Metadata Dokumen & Waktu Cetak */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Surat Jalan *
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noSuratJalan}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noSuratJalan: e.target.value })
                    }
                    className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-blue-600 dark:text-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tgl &amp; Jam Cetak SJ (Cetak hanya tanggal)
                  </label>
                  <input
                    type="datetime-local"
                    value={editTglJamInput}
                    onChange={(e) => setEditTglJamInput(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. PO
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noPo === '-' ? '' : editingRecord.noPo}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noPo: e.target.value })
                    }
                    placeholder="-"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Kontainer
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noKontainer === '-' ? '' : editingRecord.noKontainer || ''}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noKontainer: e.target.value })
                    }
                    placeholder="-"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Faktur
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noFaktur === '-' ? '' : editingRecord.noFaktur || ''}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noFaktur: e.target.value })
                    }
                    placeholder="-"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. Invoice
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noInvoice === '-' ? '' : editingRecord.noInvoice || ''}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noInvoice: e.target.value })
                    }
                    placeholder="-"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Rute Asal & Tujuan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/70">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rute Asal (Dari)
                  </label>
                  <select
                    value={
                      uniqueMasterRoutes.some((r) => r.id === editingRecord.ruteDariId)
                        ? editingRecord.ruteDariId
                        : ''
                    }
                    onChange={(e) => {
                      const found = uniqueMasterRoutes.find((r) => r.id === e.target.value);
                      if (found) {
                        setEditingRecord({
                          ...editingRecord,
                          ruteDariId: found.id,
                          ruteDariNama: found.namaLokasi,
                          ruteDariAlamat: found.alamat
                        });
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-semibold"
                  >
                    <option value="">-- Pilih / Gunakan: {editingRecord.ruteDariNama} --</option>
                    {uniqueMasterRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.namaLokasi}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rute Tujuan
                  </label>
                  <select
                    value={
                      uniqueMasterRoutes.some((r) => r.id === editingRecord.ruteTujuanId)
                        ? editingRecord.ruteTujuanId
                        : ''
                    }
                    onChange={(e) => {
                      const found = uniqueMasterRoutes.find((r) => r.id === e.target.value);
                      if (found) {
                        setEditingRecord({
                          ...editingRecord,
                          ruteTujuanId: found.id,
                          ruteTujuanKode: found.kodeLokasi,
                          ruteTujuanNama: found.namaLokasi,
                          ruteTujuanAlamat: found.alamat
                        });
                      }
                    }}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 font-semibold"
                  >
                    <option value="">-- Pilih / Gunakan: {editingRecord.ruteTujuanNama} --</option>
                    {uniqueMasterRoutes.map((r) => (
                      <option key={r.id} value={r.id}>
                        [{r.kodeLokasi}] {r.namaLokasi}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Armada, Vendor, Driver & Tarif */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nopol Kendaraan *
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noPolisi}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        noPolisi: e.target.value.toUpperCase()
                      })
                    }
                    className="w-full font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Driver
                  </label>
                  <input
                    type="text"
                    value={editingRecord.namaDriver}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, namaDriver: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    No. HP Driver
                  </label>
                  <input
                    type="text"
                    value={editingRecord.noHpDriver}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, noHpDriver: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Vendor Armada
                  </label>
                  <input
                    type="text"
                    value={editingRecord.namaVendorArmada}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, namaVendorArmada: e.target.value })
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tarif (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingRecord.tarif ?? 0}
                    onChange={(e) =>
                      setEditingRecord({
                        ...editingRecord,
                        tarif: parseFloat(e.target.value) || 0
                      })
                    }
                    className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PPN (%) — Total: Rp{' '}
                    {Math.round(
                      (editingRecord.tarif || 0) +
                        ((editingRecord.tarif || 0) * (editingRecord.ppnPersen || 0)) / 100
                    ).toLocaleString('id-ID')}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editPpnText}
                    onChange={(e) => {
                      setEditPpnText(e.target.value);
                      const parsed = parseFloat(e.target.value.replace(',', '.'));
                      setEditingRecord({
                        ...editingRecord,
                        ppnPersen: isNaN(parsed) || parsed < 0 ? 0 : parsed
                      });
                    }}
                    className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Catatan / Note Khusus
                  </label>
                  <input
                    type="text"
                    value={editingRecord.note || ''}
                    onChange={(e) =>
                      setEditingRecord({ ...editingRecord, note: e.target.value })
                    }
                    placeholder="Catatan di formulir Surat Jalan"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              {/* Daftar Barang pada Surat Jalan */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Daftar Barang pada Surat Jalan
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Grand Total: <strong>{editingRecord.grandTotalBox} Box</strong> &bull;{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {editingRecord.grandTotalKg.toLocaleString('id-ID')} Kg
                      </strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddEditItemRow}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Barang</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {editingRecord.itemsSummary.map((item, idx) => {
                    const matchedEditMaster = masterItems.find(
                      (m) =>
                        m.namaBarang.toLowerCase() === (item.namaBarang || '').trim().toLowerCase() ||
                        m.kodeItem.toLowerCase() === (item.kodeItem || '').trim().toLowerCase()
                    );
                    return (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      <div className="sm:col-span-4 space-y-1">
                        <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          Nama Barang (Master / Manual) *
                        </label>
                        <select
                          value={matchedEditMaster ? matchedEditMaster.id : '__MANUAL__'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__MANUAL__') return;
                            const found = masterItems.find((m) => m.id === val);
                            if (found) {
                              const berat = found.beratPerBoxKg ?? 30;
                              handleUpdateEditItemRow(idx, {
                                kodeItem: found.kodeItem,
                                namaBarang: found.namaBarang,
                                detailBarang: `${found.kodeItem} (1 X ${berat} KG)`,
                                beratPerBoxKg: berat
                              });
                            }
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                        >
                          <option value="__MANUAL__">
                            {matchedEditMaster ? '-- Pilih Master Barang --' : `-- Manual: ${item.namaBarang || 'Ketik di bawah'} --`}
                          </option>
                          {masterItems.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.namaBarang} ({m.kodeItem})
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={item.namaBarang}
                          onChange={(e) =>
                            handleUpdateEditItemRow(idx, { namaBarang: e.target.value })
                          }
                          placeholder="Nama barang..."
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold"
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Detail Barang
                        </label>
                        <input
                          type="text"
                          value={item.detailBarang}
                          onChange={(e) =>
                            handleUpdateEditItemRow(idx, { detailBarang: e.target.value })
                          }
                          className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          Qty (Box) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.qtyBox}
                          onChange={(e) =>
                            handleUpdateEditItemRow(idx, {
                              qtyBox: parseFloat(e.target.value) || 0
                            })
                          }
                          className="w-full font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5"
                        />
                      </div>

                      <div className="sm:col-span-2 flex items-end gap-1.5">
                        <div className="flex-1">
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            Kg/Box
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={item.beratPerBoxKg}
                            onChange={(e) =>
                              handleUpdateEditItemRow(idx, {
                                beratPerBoxKg: parseFloat(e.target.value) || 0
                              })
                            }
                            className="w-full font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5"
                          />
                        </div>
                        {editingRecord.itemsSummary.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEditItemRow(idx)}
                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Hapus baris barang"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => handleSaveEditedSuratJalan(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
              </button>
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={() => handleSaveEditedSuratJalan(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Simpan &amp; Cetak</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Preview & Download Modal */}
      <SuratJalanPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        record={previewRecord}
        records={previewRecords}
        palletRecords={records}
      />
    </div>
  );
};
