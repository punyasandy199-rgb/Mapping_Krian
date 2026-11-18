import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  MasterItem,
  MasterRoute,
  MasterVendor,
  MasterRouteTariff,
  BlacklistRecord,
  WarehouseUser,
  MasterWarehouse,
  SuratJalanRecord,
  WarehouseLocationGroup,
  WAREHOUSE_LOCATION_GROUPS,
  COMMON_UNITS
} from '../types/warehouse';
import {
  Database,
  Plus,
  Trash2,
  Search,
  X,
  Edit3,
  MapPin,
  Truck,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Users,
  Check,
  AlertCircle,
  ChevronDown,
  Building2,
  Wrench,
  History,
  User,
  Building
} from 'lucide-react';

function normalizeNopol(nopol?: string): string {
  return (nopol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface VehicleDriverHistoryVariant {
  namaDriver: string;
  noHpDriver: string;
  lastUsedDate: string;
  noSuratJalan: string;
}

interface VehicleNopolHistoryEntry {
  normalizedNopol: string;
  displayNopol: string;
  latestDriver: string;
  latestHp: string;
  latestVendor: string;
  tripCount: number;
  lastUsedDate: string;
  lastDestination: string;
  driverVariants: VehicleDriverHistoryVariant[];
  recentTrips: {
    id: string;
    noSuratJalan: string;
    tanggal: string;
    tujuan: string;
    vendor: string;
    namaDriver: string;
    noHpDriver: string;
  }[];
}

export type MasterModalTabKey =
  | 'tujuan_tarif'
  | 'armada'
  | 'barang'
  | 'gudang'
  | 'history_nopol'
  | 'blacklist'
  | 'users';

interface MasterItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: MasterModalTabKey;
  // Barang
  masterItems: MasterItem[];
  onAddMasterItem: (item: Omit<MasterItem, 'id'>) => void;
  onUpdateMasterItem: (item: MasterItem) => void;
  onDeleteMasterItem: (id: string) => void;
  // Rute
  masterRoutes?: MasterRoute[];
  onAddMasterRoute?: (route: Omit<MasterRoute, 'id'>) => void;
  onUpdateMasterRoute?: (route: MasterRoute) => void;
  onDeleteMasterRoute?: (id: string) => void;
  // Vendor
  masterVendors?: MasterVendor[];
  onAddMasterVendor?: (vendor: Omit<MasterVendor, 'id'>) => void;
  onUpdateMasterVendor?: (vendor: MasterVendor) => void;
  onDeleteMasterVendor?: (id: string) => void;
  // Tujuan & Tarif (Multi-Vendor & Bolak Balik)
  masterTariffs?: MasterRouteTariff[];
  onAddMasterTariff?: (tariff: Omit<MasterRouteTariff, 'id'>) => void;
  onUpdateMasterTariff?: (tariff: MasterRouteTariff) => void;
  onDeleteMasterTariff?: (id: string) => void;
  // Gudang & Sub-Location
  masterWarehouses?: MasterWarehouse[];
  onAddMasterWarehouse?: (warehouse: Omit<MasterWarehouse, 'id'>) => void;
  onUpdateMasterWarehouse?: (warehouse: MasterWarehouse) => void;
  onDeleteMasterWarehouse?: (id: string) => void;
  // Blacklist
  blacklistRecords?: BlacklistRecord[];
  onAddBlacklistRecord?: (bl: Omit<BlacklistRecord, 'id'>) => void;
  onDeleteBlacklistRecord?: (id: string) => void;
  // Warehouse Users
  warehouseUsers?: WarehouseUser[];
  onAddWarehouseUser?: (user: Omit<WarehouseUser, 'id'>) => void;
  onDeleteWarehouseUser?: (id: string) => void;
  // History Nopol dari Surat Jalan
  suratJalanHistory?: SuratJalanRecord[];
}

interface DestinationPreset {
  cityCode: string;
  branchName: string;
  fullName: string;
  address: string;
}

const PRESET_DESTINATIONS: DestinationPreset[] = [
  {
    cityCode: 'SUKODONO',
    branchName: 'SJA Sukodono',
    fullName: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO',
    address: 'Jl. Raya Panjunan No.KM 3, Babatan, Panjunan, Kec. Sukodono, Kabupaten Sidoarjo, Jawa Timur 61258'
  },
  {
    cityCode: 'KARAWANG',
    branchName: 'SJA Karawang',
    fullName: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - KARAWANG',
    address: 'Jl. Surya Madya Kav. I-18 Ds. Kuta Mekar Kec. Ciampel Karawang 41361'
  },
  {
    cityCode: 'SEMARANG',
    branchName: 'SJA Semarang',
    fullName: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG',
    address: 'Jl. Gatot Subroto Kawasan Industri Candi Blok G-H Ngaliyan Semarang'
  },
  {
    cityCode: 'SEPANJANG',
    branchName: 'SJA Sepanjang',
    fullName: 'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEPANJANG',
    address: 'Jl Raya Gilang no 159 Sepanjang Sidoarjo'
  },
  {
    cityCode: 'BEKASI',
    branchName: 'Agel Langgeng Bekasi',
    fullName: 'AGEL LANGGENG BEKASI',
    address: 'Kawasan Industri MM2100 Cikarang Barat Bekasi'
  },
  {
    cityCode: 'MERGONOTO',
    branchName: 'Mergonoto Abadi Land',
    fullName: 'MERGONOTO ABADI LAND PT.',
    address: 'HHXC+XF, Sidotemo, Sidomulyo, Kec. Krian, Kabupaten Sidoarjo'
  },
  {
    cityCode: 'KAWITAN',
    branchName: 'DC - GD Kawitan',
    fullName: 'DC - GD KAWITAN',
    address: 'Jl. Bypass Krian No.km.24, Tundungan, Sidomojo, Kec. Krian'
  }
];

export const MasterItemModal: React.FC<MasterItemModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  masterItems,
  onAddMasterItem,
  onUpdateMasterItem,
  onDeleteMasterItem,
  masterRoutes = [],
  onAddMasterRoute,
  onUpdateMasterRoute,
  onDeleteMasterRoute,
  masterVendors = [],
  onAddMasterVendor,
  onUpdateMasterVendor,
  onDeleteMasterVendor,
  masterTariffs = [],
  onAddMasterTariff,
  onUpdateMasterTariff,
  onDeleteMasterTariff,
  masterWarehouses = [],
  onAddMasterWarehouse,
  onUpdateMasterWarehouse,
  onDeleteMasterWarehouse,
  blacklistRecords = [],
  onAddBlacklistRecord,
  onDeleteBlacklistRecord,
  warehouseUsers = [],
  onAddWarehouseUser,
  onDeleteWarehouseUser,
  suratJalanHistory = []
}) => {
  // Tabs: 'tujuan_tarif' | 'armada' | 'barang' | 'gudang' | 'history_nopol' | 'blacklist' | 'users'
  const [activeMasterTab, setActiveMasterTab] = useState<MasterModalTabKey>(
    initialTab || 'tujuan_tarif'
  );

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveMasterTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nopolStatusFilter, setNopolStatusFilter] = useState<'ALL' | 'SAFE' | 'BLACKLIST'>('ALL');
  const [expandedNopolKey, setExpandedNopolKey] = useState<string | null>(null);

  // -------------------------------------------------------------
  // TAB 1: TUJUAN & TARIF FORM STATE
  // -------------------------------------------------------------
  const [isTariffFormOpen, setIsTariffFormOpen] = useState(false);
  const [editingTariffId, setEditingTariffId] = useState<string | null>(null);
  const [tariffRuteAwal, setTariffRuteAwal] = useState('PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO');
  const [tariffRuteTujuan, setTariffRuteTujuan] = useState('');
  const [tariffAlamatTujuan, setTariffAlamatTujuan] = useState('');
  const [tariffVendor, setTariffVendor] = useState('');
  const [tariffRp, setTariffRp] = useState('0');
  const [tariffPpn, setTariffPpn] = useState('0');
  const [tariffError, setTariffError] = useState('');

  // Custom Dropdown Open States
  const [isAsalDropdownOpen, setIsAsalDropdownOpen] = useState(false);
  const [isTujuanDropdownOpen, setIsTujuanDropdownOpen] = useState(false);
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);

  const asalDropdownRef = useRef<HTMLDivElement>(null);
  const tujuanDropdownRef = useRef<HTMLDivElement>(null);
  const vendorDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (asalDropdownRef.current && !asalDropdownRef.current.contains(event.target as Node)) {
        setIsAsalDropdownOpen(false);
      }
      if (tujuanDropdownRef.current && !tujuanDropdownRef.current.contains(event.target as Node)) {
        setIsTujuanDropdownOpen(false);
      }
      if (vendorDropdownRef.current && !vendorDropdownRef.current.contains(event.target as Node)) {
        setIsVendorDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------
  // TAB 2: ARMADA (VENDOR) FORM STATE
  // -------------------------------------------------------------
  const [isVendorFormOpen, setIsVendorFormOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [vendorNama, setVendorNama] = useState('');
  const [vendorKontak, setVendorKontak] = useState('');
  const [vendorKet, setVendorKet] = useState('');
  const [vendorError, setVendorError] = useState('');

  // -------------------------------------------------------------
  // TAB 3: BARANG FORM STATE
  // -------------------------------------------------------------
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formSatuan, setFormSatuan] = useState('Box');
  const [formQty, setFormQty] = useState('15');
  const [formBeratKg, setFormBeratKg] = useState('30');
  const [formKategori, setFormKategori] = useState('Bahan Baku');
  const [itemError, setItemError] = useState('');

  // -------------------------------------------------------------
  // TAB 4: BLACKLIST FORM STATE
  // -------------------------------------------------------------
  const [isBlacklistFormOpen, setIsBlacklistFormOpen] = useState(false);
  const [blTipe, setBlTipe] = useState<'NOPOL' | 'DRIVER' | 'VENDOR' | 'PALLET'>('NOPOL');
  const [blIdentifier, setBlIdentifier] = useState('');
  const [blAlasan, setBlAlasan] = useState('');
  const [blError, setBlError] = useState('');

  // -------------------------------------------------------------
  // TAB 5: USER MANAGEMENT FORM STATE
  // -------------------------------------------------------------
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [usrNama, setUsrNama] = useState('');
  const [usrUsername, setUsrUsername] = useState('');
  const [usrRole, setUsrRole] = useState<'Super Admin' | 'Warehouse Admin' | 'Operator Lapangan' | 'Supervisor'>('Operator Lapangan');
  const [usrError, setUsrError] = useState('');

  // -------------------------------------------------------------
  // TAB 6: GUDANG & SUB-LOCATION FORM STATE
  // -------------------------------------------------------------
  const [isWarehouseFormOpen, setIsWarehouseFormOpen] = useState(false);
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null);
  const [whLocationGroup, setWhLocationGroup] = useState<WarehouseLocationGroup>('Gd. KRIAN');
  const [whKodeGudang, setWhKodeGudang] = useState('');
  const [whNamaGudang, setWhNamaGudang] = useState('');
  const [whSubtitle, setWhSubtitle] = useState('');
  const [whStatus, setWhStatus] = useState<'ACTIVE' | 'MAINTENANCE'>('ACTIVE');
  const [whLeftPrefix, setWhLeftPrefix] = useState('');
  const [whRightPrefix, setWhRightPrefix] = useState('');
  const [whLeftCount, setWhLeftCount] = useState('50');
  const [whRightCount, setWhRightCount] = useState('50');
  const [whPrimaryCount, setWhPrimaryCount] = useState('6');
  const [whKeterangan, setWhKeterangan] = useState('');
  const [whError, setWhError] = useState('');

  if (!isOpen) return null;

  // Address lookup helper
  const addressLookup: Record<string, string> = {
    'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO':
      'Jl. Raya Panjunan No.KM 3, Babatan, Panjunan, Kec. Sukodono, Kabupaten Sidoarjo, Jawa Timur 61258',
    'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - KARAWANG':
      'Jl. Surya Madya Kav. I-18 Ds. Kuta Mekar Kec. Ciampel Karawang 41361',
    'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEMARANG':
      'Jl. Gatot Subroto Kawasan Industri Candi Blok G-H Ngaliyan Semarang',
    'PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SEPANJANG':
      'Jl Raya Gilang no 159 Sepanjang Sidoarjo',
    'AGEL LANGGENG BEKASI':
      'Kawasan Industri MM2100 Cikarang Barat Bekasi',
    'MERGONOTO ABADI LAND PT.':
      'HHXC+XF, Sidotemo, Sidomulyo, Kec. Krian, Kabupaten Sidoarjo',
    'DC - GD KAWITAN':
      'Jl. Bypass Krian No.km.24, Tundungan, Sidomojo, Kec. Krian'
  };

  // Helper when selecting Tujuan: auto-fill address if known
  const handleSelectTariffTujuan = (val: string, addr?: string) => {
    setTariffRuteTujuan(val);
    if (addr) {
      setTariffAlamatTujuan(addr);
    } else if (addressLookup[val]) {
      setTariffAlamatTujuan(addressLookup[val]);
    }
    setIsTujuanDropdownOpen(false);
  };

  const handleSelectTariffAwal = (val: string) => {
    setTariffRuteAwal(val);
    setIsAsalDropdownOpen(false);
  };

  // -------------------------------------------------------------
  // TAB 1 HANDLERS (TUJUAN & TARIF)
  // -------------------------------------------------------------
  const handleStartAddTariff = () => {
    setEditingTariffId(null);
    setTariffRuteAwal('PT. SANTOS JAYA ABADI GUDANG KONVERSI 1 - SUKODONO');
    setTariffRuteTujuan('');
    setTariffAlamatTujuan('');
    setTariffVendor('');
    setTariffRp('0');
    setTariffPpn('0');
    setTariffError('');
    setIsTariffFormOpen(true);
  };

  const handleStartEditTariff = (t: MasterRouteTariff) => {
    setEditingTariffId(t.id);
    setTariffRuteAwal(t.ruteAwal);
    setTariffRuteTujuan(t.ruteTujuan);
    setTariffAlamatTujuan(t.alamatTujuan || '');
    setTariffVendor(t.vendor);
    setTariffRp(String(t.tarif));
    setTariffPpn(String(t.ppnPersen).replace('.', ','));
    setTariffError('');
    setIsTariffFormOpen(true);
  };

  const handleSubmitTariff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tariffRuteAwal.trim()) {
      setTariffError('Rute Awal (Asal) wajib dipilih/diisi.');
      return;
    }
    if (!tariffRuteTujuan.trim()) {
      setTariffError('Rute Tujuan wajib dipilih/diisi.');
      return;
    }
    if (!tariffVendor.trim()) {
      setTariffError('Vendor Armada wajib diisi.');
      return;
    }

    // TARIF BISA DIISI 0 RP (User Request)
    const rawTariff = tariffRp.trim();
    const tarifNum = parseFloat(rawTariff);
    if (rawTariff === '' || isNaN(tarifNum) || tarifNum < 0) {
      setTariffError('Tarif pengiriman (Rp) wajib diisi angka (minimal 0 Rp).');
      return;
    }

    // PPN BISA DIBUAT KOMA (User Request: e.g. 0, 1,1 atau 1.1)
    const rawPpn = tariffPpn.replace(',', '.').trim();
    const ppnNum = parseFloat(rawPpn);
    const finalPpn = rawPpn === '' || isNaN(ppnNum) || ppnNum < 0 ? 0 : ppnNum;

    if (editingTariffId && onUpdateMasterTariff) {
      onUpdateMasterTariff({
        id: editingTariffId,
        ruteAwal: tariffRuteAwal.trim(),
        ruteTujuan: tariffRuteTujuan.trim(),
        alamatTujuan: tariffAlamatTujuan.trim(),
        vendor: tariffVendor.trim().toUpperCase(),
        tarif: tarifNum,
        ppnPersen: finalPpn
      });
    } else if (onAddMasterTariff) {
      onAddMasterTariff({
        ruteAwal: tariffRuteAwal.trim(),
        ruteTujuan: tariffRuteTujuan.trim(),
        alamatTujuan: tariffAlamatTujuan.trim(),
        vendor: tariffVendor.trim().toUpperCase(),
        tarif: tarifNum,
        ppnPersen: finalPpn
      });
    }
    setIsTariffFormOpen(false);
    setEditingTariffId(null);
  };

  // -------------------------------------------------------------
  // TAB 2 HANDLERS (ARMADA)
  // -------------------------------------------------------------
  const handleStartAddVendor = () => {
    setEditingVendorId(null);
    setVendorNama('');
    setVendorKontak('');
    setVendorKet('');
    setVendorError('');
    setIsVendorFormOpen(true);
  };

  const handleStartEditVendor = (v: MasterVendor) => {
    setEditingVendorId(v.id);
    setVendorNama(v.namaVendor);
    setVendorKontak(v.kontak || '');
    setVendorKet(v.keterangan || '');
    setVendorError('');
    setIsVendorFormOpen(true);
  };

  const handleSubmitVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorNama.trim()) {
      setVendorError('Nama Vendor armada wajib diisi.');
      return;
    }
    if (editingVendorId && onUpdateMasterVendor) {
      onUpdateMasterVendor({
        id: editingVendorId,
        namaVendor: vendorNama.trim(),
        kontak: vendorKontak.trim(),
        keterangan: vendorKet.trim()
      });
    } else if (onAddMasterVendor) {
      onAddMasterVendor({
        namaVendor: vendorNama.trim(),
        kontak: vendorKontak.trim(),
        keterangan: vendorKet.trim()
      });
    }
    setIsVendorFormOpen(false);
    setEditingVendorId(null);
  };

  // -------------------------------------------------------------
  // TAB 3 HANDLERS (BARANG)
  // -------------------------------------------------------------
  const handleStartAddItem = () => {
    setEditingItemId(null);
    setFormKode('');
    setFormNama('');
    setFormSatuan('Box');
    setFormQty('15');
    setFormBeratKg('30');
    setFormKategori('Bahan Baku');
    setItemError('');
    setIsItemFormOpen(true);
  };

  const handleStartEditItem = (item: MasterItem) => {
    setEditingItemId(item.id);
    setFormKode(item.kodeItem);
    setFormNama(item.namaBarang);
    setFormSatuan(item.satuan || 'Box');
    setFormQty(String(item.defaultQty || 15));
    setFormBeratKg(String(item.beratPerBoxKg ?? 30));
    setFormKategori(item.kategori || 'Bahan Baku');
    setItemError('');
    setIsItemFormOpen(true);
  };

  const handleSubmitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKode.trim()) {
      setItemError('Kode Item wajib diisi');
      return;
    }
    if (!formNama.trim()) {
      setItemError('Nama Barang wajib diisi');
      return;
    }
    const trimmedCode = formKode.trim().toUpperCase();
    const duplicate = masterItems.find(
      (i) => i.kodeItem.toUpperCase() === trimmedCode && i.id !== editingItemId
    );
    if (duplicate) {
      setItemError(`Kode Item '${trimmedCode}' sudah digunakan oleh ${duplicate.namaBarang}`);
      return;
    }

    const beratNum = parseFloat(formBeratKg) || 30;

    if (editingItemId) {
      onUpdateMasterItem({
        id: editingItemId,
        kodeItem: trimmedCode,
        namaBarang: formNama.trim(),
        satuan: formSatuan.trim() || 'Box',
        defaultQty: parseInt(formQty) || 15,
        beratPerBoxKg: beratNum,
        kategori: formKategori.trim() || 'Bahan Baku'
      });
    } else {
      onAddMasterItem({
        kodeItem: trimmedCode,
        namaBarang: formNama.trim(),
        satuan: formSatuan.trim() || 'Box',
        defaultQty: parseInt(formQty) || 15,
        beratPerBoxKg: beratNum,
        kategori: formKategori.trim() || 'Bahan Baku'
      });
    }
    setIsItemFormOpen(false);
    setEditingItemId(null);
  };

  // -------------------------------------------------------------
  // TAB 4 HANDLERS (BLACKLIST)
  // -------------------------------------------------------------
  const activeBlacklistRecords = useMemo(
    () => blacklistRecords.filter((b) => b.status !== 'RESOLVED'),
    [blacklistRecords]
  );

  const findBlacklistForNopol = (nopol?: string): BlacklistRecord | undefined => {
    const norm = normalizeNopol(nopol);
    if (!norm) return undefined;
    return activeBlacklistRecords.find(
      (b) => b.tipe === 'NOPOL' && normalizeNopol(b.identifier) === norm
    );
  };

  const vehicleHistoryList = useMemo<VehicleNopolHistoryEntry[]>(() => {
    const sorted = [...suratJalanHistory].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    const map = new Map<string, VehicleNopolHistoryEntry>();

    sorted.forEach((sj) => {
      const rawNopol = (sj.noPolisi || '').trim().toUpperCase();
      const norm = normalizeNopol(rawNopol);
      if (!norm) return;

      const driver = (sj.namaDriver || '').trim();
      const hp = (sj.noHpDriver || '').trim();
      const vendor = (sj.namaVendorArmada || '').trim();
      const tanggal = sj.tanggalPengambilanFormatted || sj.tanggal || '';
      const tujuan = sj.ruteTujuanKode || sj.ruteTujuanNama || '-';

      let entry = map.get(norm);
      if (!entry) {
        entry = {
          normalizedNopol: norm,
          displayNopol: rawNopol,
          latestDriver: driver,
          latestHp: hp,
          latestVendor: vendor,
          tripCount: 0,
          lastUsedDate: tanggal,
          lastDestination: tujuan,
          driverVariants: [],
          recentTrips: []
        };
        map.set(norm, entry);
      } else {
        if (!entry.displayNopol.includes(' ') && rawNopol.includes(' ')) {
          entry.displayNopol = rawNopol;
        }
        if (!entry.latestDriver && driver) entry.latestDriver = driver;
        if (!entry.latestHp && hp) entry.latestHp = hp;
      }

      entry.tripCount += 1;

      if (driver || hp) {
        const variantKey = `${driver.toLowerCase()}::${hp.replace(/\s+/g, '')}`;
        const alreadyHasVariant = entry.driverVariants.some(
          (v) => `${v.namaDriver.toLowerCase()}::${v.noHpDriver.replace(/\s+/g, '')}` === variantKey
        );
        if (!alreadyHasVariant) {
          entry.driverVariants.push({
            namaDriver: driver || '-',
            noHpDriver: hp || '-',
            lastUsedDate: tanggal,
            noSuratJalan: sj.noSuratJalan
          });
        }
      }

      entry.recentTrips.push({
        id: sj.id,
        noSuratJalan: sj.noSuratJalan,
        tanggal,
        tujuan,
        vendor,
        namaDriver: driver || '-',
        noHpDriver: hp || '-'
      });
    });

    return Array.from(map.values());
  }, [suratJalanHistory]);

  const handleSubmitBlacklist = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdentifier =
      blTipe === 'NOPOL' ? blIdentifier.trim().toUpperCase() : blIdentifier.trim();
    const cleanAlasan = blAlasan.trim();

    if (!cleanIdentifier) {
      setBlError(
        blTipe === 'NOPOL'
          ? 'Nopol kendaraan wajib diisi.'
          : 'Nopol / Nama Driver / Identifier wajib diisi.'
      );
      return;
    }
    if (!cleanAlasan) {
      setBlError('Keterangan ditolak / alasan blacklist wajib diisi.');
      return;
    }

    const duplicate = activeBlacklistRecords.find((b) => {
      if (b.tipe !== blTipe) return false;
      if (blTipe === 'NOPOL') {
        return normalizeNopol(b.identifier) === normalizeNopol(cleanIdentifier);
      }
      return b.identifier.trim().toLowerCase() === cleanIdentifier.toLowerCase();
    });
    if (duplicate) {
      setBlError(`${blTipe} "${cleanIdentifier}" sudah terdaftar dalam daftar blacklist aktif.`);
      return;
    }

    const today = new Date().toLocaleDateString('id-ID');
    if (onAddBlacklistRecord) {
      onAddBlacklistRecord({
        tipe: blTipe,
        identifier: cleanIdentifier,
        alasan: cleanAlasan,
        tanggal: today,
        status: 'ACTIVE'
      });
    }
    setBlIdentifier('');
    setBlAlasan('');
    setBlError('');
    setIsBlacklistFormOpen(false);
  };

  // -------------------------------------------------------------
  // TAB 5 HANDLERS (USERS)
  // -------------------------------------------------------------
  const handleSubmitUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usrNama.trim()) {
      setUsrError('Nama Petugas wajib diisi.');
      return;
    }
    if (!usrUsername.trim()) {
      setUsrError('Username wajib diisi.');
      return;
    }
    if (onAddWarehouseUser) {
      onAddWarehouseUser({
        nama: usrNama.trim(),
        username: usrUsername.trim().toLowerCase(),
        role: usrRole,
        status: 'Aktif'
      });
    }
    setUsrNama('');
    setUsrUsername('');
    setUsrError('');
    setIsUserFormOpen(false);
  };

  // -------------------------------------------------------------
  // TAB 6 HANDLERS (GUDANG & SUB-LOCATION)
  // -------------------------------------------------------------
  const handleStartAddWarehouse = () => {
    setEditingWarehouseId(null);
    setWhLocationGroup('Gd. KRIAN');
    setWhKodeGudang('');
    setWhNamaGudang('');
    setWhSubtitle('');
    setWhStatus('ACTIVE');
    setWhLeftPrefix('');
    setWhRightPrefix('');
    setWhLeftCount('50');
    setWhRightCount('50');
    setWhPrimaryCount('6');
    setWhKeterangan('');
    setWhError('');
    setIsWarehouseFormOpen(true);
  };

  const handleStartEditWarehouse = (wh: MasterWarehouse) => {
    setEditingWarehouseId(wh.id);
    setWhLocationGroup(wh.locationGroup);
    setWhKodeGudang(wh.kodeGudang || '');
    setWhNamaGudang(wh.namaGudang || '');
    setWhSubtitle(wh.subtitle || '');
    setWhStatus(wh.status || 'ACTIVE');
    setWhLeftPrefix(wh.rackLeftPrefix || '');
    setWhRightPrefix(wh.rackRightPrefix || '');
    setWhLeftCount(String(wh.leftSlotCount ?? 50));
    setWhRightCount(String(wh.rightSlotCount ?? 50));
    setWhPrimaryCount(String(wh.rightPrimaryCount ?? 6));
    setWhKeterangan(wh.keterangan || '');
    setWhError('');
    setIsWarehouseFormOpen(true);
  };

  const handleSubmitWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    const kode = whKodeGudang.trim().toUpperCase();
    const nama = whNamaGudang.trim();
    if (!kode) {
      setWhError('Kode Gudang wajib diisi (misal: GD-07, GD-SJA3-01).');
      return;
    }
    if (!nama) {
      setWhError('Nama Sub-Location / Gudang wajib diisi (misal: Gudang 07).');
      return;
    }

    const leftPrefix = (whLeftPrefix.trim() || `${kode.replace(/[^A-Z0-9]/g, '').slice(-2)}A`).toUpperCase();
    const rightPrefix = (whRightPrefix.trim() || `${kode.replace(/[^A-Z0-9]/g, '').slice(-2)}B`).toUpperCase();
    const leftCount = Math.max(1, Math.min(200, parseInt(whLeftCount, 10) || 50));
    const rightCount = Math.max(1, Math.min(200, parseInt(whRightCount, 10) || 50));
    const primaryCount = Math.max(1, Math.min(rightCount, parseInt(whPrimaryCount, 10) || 6));

    const payload: Omit<MasterWarehouse, 'id'> = {
      locationGroup: whLocationGroup,
      kodeGudang: kode,
      namaGudang: nama,
      subtitle: whSubtitle.trim() || `Peta Rak ${leftPrefix} & ${rightPrefix} · ${whLocationGroup}`,
      status: whStatus,
      rackLeftPrefix: leftPrefix,
      rackRightPrefix: rightPrefix,
      leftSlotCount: leftCount,
      rightSlotCount: rightCount,
      rightPrimaryCount: primaryCount,
      keterangan: whKeterangan.trim()
    };

    if (editingWarehouseId && onUpdateMasterWarehouse) {
      onUpdateMasterWarehouse({
        id: editingWarehouseId,
        ...payload
      });
    } else if (onAddMasterWarehouse) {
      onAddMasterWarehouse(payload);
    }

    setIsWarehouseFormOpen(false);
    setEditingWarehouseId(null);
  };

  // Dropdown Autocomplete Filters with auto-hide when no match (User Request)
  const filteredAsalPresets = PRESET_DESTINATIONS.filter((preset) => {
    const q = tariffRuteAwal.toLowerCase().trim();
    if (!q) return true;
    return (
      preset.cityCode.toLowerCase().includes(q) ||
      preset.branchName.toLowerCase().includes(q) ||
      preset.fullName.toLowerCase().includes(q)
    );
  });

  const filteredTujuanPresets = PRESET_DESTINATIONS.filter((preset) => {
    const q = tariffRuteTujuan.toLowerCase().trim();
    if (!q) return true;
    return (
      preset.cityCode.toLowerCase().includes(q) ||
      preset.branchName.toLowerCase().includes(q) ||
      preset.fullName.toLowerCase().includes(q) ||
      preset.address.toLowerCase().includes(q)
    );
  });

  const allVendorOptions = [
    'CTL',
    'DUTA LINTAS',
    'FLI',
    'LOGISTIK CANGGIH',
    ...masterVendors.map((v) => v.namaVendor)
  ].filter((v, i, a) => a.indexOf(v) === i);

  const filteredVendorPresets = allVendorOptions.filter((vendorName) => {
    const q = tariffVendor.toLowerCase().trim();
    if (!q) return true;
    return vendorName.toLowerCase().includes(q);
  });

  // Filtered lists
  const filteredTariffs = masterTariffs.filter(
    (t) =>
      t.ruteAwal.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.ruteTujuan.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.alamatTujuan && t.alamatTujuan.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredItems = masterItems.filter(
    (item) =>
      item.namaBarang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kodeItem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kategori && item.kategori.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredVendors = masterVendors.filter(
    (v) =>
      v.namaVendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.kontak && v.kontak.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredBlacklist = blacklistRecords.filter(
    (b) =>
      b.identifier.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.alasan.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = warehouseUsers.filter(
    (u) =>
      u.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredWarehouses = masterWarehouses.filter(
    (w) =>
      w.namaGudang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.kodeGudang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.locationGroup.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.rackLeftPrefix || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.rackRightPrefix || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
      {/* 
        USER REQUEST: 
        1. "background bisa dibuat putih" -> Clean White Card & High-Contrast Typography
        2. "tampilan bisa dibesarkan agar tampilan terlihat bagus" -> max-w-7xl w-[98vw] h-[94vh]
      */}
      <div className="bg-white text-slate-900 rounded-2xl max-w-7xl w-full border border-slate-200 shadow-2xl p-5 sm:p-7 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">
                  User Management & Master Data
                </h3>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-bold">
                  PT. Santos Jaya Abadi
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Kelola tujuan & tarif per rute multi-vendor, armada logistik, master barang, blacklist, dan akses operator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector - Crisp Light Badges */}
        <div className="flex items-center gap-2 pt-4 pb-3 border-b border-slate-200 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('tujuan_tarif');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeMasterTab === 'tujuan_tarif'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>TUJUAN & TARIF ({masterTariffs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('armada');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeMasterTab === 'armada'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>ARMADA ({masterVendors.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('barang');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeMasterTab === 'barang'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>BARANG ({masterItems.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('gudang');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
              activeMasterTab === 'gudang'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>GUDANG ({masterWarehouses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('history_nopol');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
              activeMasterTab === 'history_nopol'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-600/20'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>HISTORY NOPOL ({vehicleHistoryList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('blacklist');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
              activeMasterTab === 'blacklist'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/25'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>BLACKLIST ({blacklistRecords.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMasterTab('users');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${
              activeMasterTab === 'users'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>PENGGUNA ({warehouseUsers.length})</span>
          </button>
        </div>

        {/* Search Bar & Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 pb-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari dalam master data..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
            />
          </div>

          <div className="flex items-center gap-2">
            {activeMasterTab === 'tujuan_tarif' && (
              <button
                type="button"
                onClick={handleStartAddTariff}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Rute / Tarif</span>
              </button>
            )}

            {activeMasterTab === 'armada' && (
              <button
                type="button"
                onClick={handleStartAddVendor}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Vendor Armada</span>
              </button>
            )}

            {activeMasterTab === 'barang' && (
              <button
                type="button"
                onClick={handleStartAddItem}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Barang Baru</span>
              </button>
            )}

            {activeMasterTab === 'gudang' && (
              <button
                type="button"
                onClick={handleStartAddWarehouse}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Gudang / Sub-Location</span>
              </button>
            )}

            {activeMasterTab === 'history_nopol' && (
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setNopolStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    nopolStatusFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({vehicleHistoryList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setNopolStatusFilter('SAFE')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    nopolStatusFilter === 'SAFE'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Aman
                </button>
                <button
                  type="button"
                  onClick={() => setNopolStatusFilter('BLACKLIST')}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    nopolStatusFilter === 'BLACKLIST'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Blacklist
                </button>
              </div>
            )}

            {activeMasterTab === 'blacklist' && (
              <button
                type="button"
                onClick={() => setIsBlacklistFormOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Entri Blacklist</span>
              </button>
            )}

            {activeMasterTab === 'users' && (
              <button
                type="button"
                onClick={() => setIsUserFormOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Petugas</span>
              </button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: TUJUAN & TARIF (MULTI-VENDOR & BOLAK BALIK)            */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'tujuan_tarif' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            {/* Form Input Rute & Tarif */}
            {isTariffFormOpen && (
              <form
                onSubmit={handleSubmitTariff}
                className="p-5 rounded-2xl bg-blue-50/50 border-2 border-blue-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <div className="flex items-center gap-2 font-bold text-sm text-blue-900">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span>{editingTariffId ? 'Edit Rute & Tarif Pengiriman' : '+ Tambah Rute & Tarif Baru'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsTariffFormOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
                  {/* RUTE AWAL (ASAL) WITH CLEAR DROPDOWN */}
                  <div className="relative" ref={asalDropdownRef}>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Rute Awal (Asal) *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tariffRuteAwal}
                        onChange={(e) => setTariffRuteAwal(e.target.value)}
                        placeholder="Pilih atau ketik rute asal..."
                        onFocus={() => setIsAsalDropdownOpen(true)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setIsAsalDropdownOpen(!isAsalDropdownOpen)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Wide Custom Dropdown Menu for Asal - Auto-hide if no match */}
                    {isAsalDropdownOpen && filteredAsalPresets.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1">
                        <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Pilihan Lokasi Asal:
                        </div>
                        {filteredAsalPresets.map((preset, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSelectTariffAwal(preset.fullName)}
                            className="p-2 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors border border-transparent hover:border-blue-200"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-extrabold text-[11px]">
                                {preset.cityCode}
                              </span>
                              <span className="font-bold text-xs text-slate-800">{preset.branchName}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{preset.fullName}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* TUJUAN WITH CLEAR DROPDOWN (RESOLVING TRUNCATION / e3143aba.png) - Auto-hide if no match */}
                  <div className="relative" ref={tujuanDropdownRef}>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase flex items-center justify-between">
                      <span>Tujuan *</span>
                      <span className="text-[11px] font-normal text-blue-600">Klik pilihan untuk auto-isi alamat</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tariffRuteTujuan}
                        onChange={(e) => setTariffRuteTujuan(e.target.value)}
                        placeholder="Pilih tujuan (Karawang, Semarang, Sepanjang, dll)..."
                        onFocus={() => setIsTujuanDropdownOpen(true)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setIsTujuanDropdownOpen(!isTujuanDropdownOpen)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Wide Custom Dropdown Menu for Tujuan */}
                    {isTujuanDropdownOpen && filteredTujuanPresets.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-1.5 space-y-1.5">
                        <div className="px-2.5 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                          Pilihan Lokasi Tujuan (Terlihat Jelas Kota & Cabang):
                        </div>
                        {filteredTujuanPresets.map((preset, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleSelectTariffTujuan(preset.fullName, preset.address)}
                            className="p-2.5 rounded-lg hover:bg-blue-50 cursor-pointer transition-colors border border-transparent hover:border-blue-200"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-full bg-blue-600 text-white font-extrabold text-[11px] tracking-wide">
                                {preset.cityCode}
                              </span>
                              <span className="font-extrabold text-xs sm:text-sm text-slate-900">
                                {preset.branchName}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-slate-600 mt-1">{preset.fullName}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{preset.address}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ALAMAT TUJUAN */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Alamat Lengkap Tujuan
                    </label>
                    <input
                      type="text"
                      value={tariffAlamatTujuan}
                      onChange={(e) => setTariffAlamatTujuan(e.target.value)}
                      placeholder="Alamat lengkap pabrik / gudang tujuan..."
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  {/* VENDOR ARMADA - Auto-hide if no match */}
                  <div className="relative" ref={vendorDropdownRef}>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Vendor Armada *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={tariffVendor}
                        onChange={(e) => setTariffVendor(e.target.value.toUpperCase())}
                        placeholder="Contoh: CTL, DUTA LINTAS, FLI, dll..."
                        onFocus={() => setIsVendorDropdownOpen(true)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-extrabold text-blue-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 uppercase pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    {isVendorDropdownOpen && filteredVendorPresets.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl max-h-48 overflow-y-auto p-1.5 space-y-1">
                        {filteredVendorPresets.map((vendorName, idx) => (
                          <div
                            key={idx}
                            onClick={() => {
                              setTariffVendor(vendorName.toUpperCase());
                              setIsVendorDropdownOpen(false);
                            }}
                            className="px-3 py-2 rounded-lg hover:bg-blue-50 cursor-pointer font-bold text-xs text-blue-800 transition-colors"
                          >
                            {vendorName}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* TARIF RP & PPN */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                        Tarif (Rp) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={tariffRp}
                        onChange={(e) => setTariffRp(e.target.value)}
                        placeholder="Contoh: 4675000"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-extrabold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                        PPN % *
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={tariffPpn}
                        onChange={(e) => setTariffPpn(e.target.value)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>
                </div>

                {tariffError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{tariffError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsTariffFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    {editingTariffId ? 'Perbarui Rute & Tarif' : 'Simpan Rute & Tarif'}
                  </button>
                </div>
              </form>
            )}

            {/* TABEL TUJUAN & TARIF (White Background, Clean & Clear) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Rute Awal</th>
                      <th className="py-3 px-4">Tujuan</th>
                      <th className="py-3 px-4">Alamat Tujuan</th>
                      <th className="py-3 px-4">Vendor</th>
                      <th className="py-3 px-4 text-right">Tarif</th>
                      <th className="py-3 px-4 text-center">PPN</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTariffs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Belum ada data tarif rute. Klik <strong>+ Tambah Rute / Tarif</strong> untuk membuat data.
                        </td>
                      </tr>
                    ) : (
                      filteredTariffs.map((t) => (
                        <tr key={t.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {t.ruteAwal}
                          </td>
                          <td className="py-3 px-4 font-bold text-blue-900">
                            {t.ruteTujuan}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 max-w-xs">
                            {t.alamatTujuan || '-'}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-extrabold text-xs uppercase tracking-wide">
                              {t.vendor}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                            {t.tarif === 0 ? (
                              <span className="text-emerald-600">Rp 0 (Bebas Biaya)</span>
                            ) : (
                              `Rp ${t.tarif.toLocaleString('id-ID')}`
                            )}
                          </td>
                          <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                            {String(t.ppnPersen).replace('.', ',')}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === t.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onDeleteMasterTariff) onDeleteMasterTariff(t.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold shadow-xs transition-colors"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold transition-colors"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditTariff(t)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Edit Tarif"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(t.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Hapus Tarif"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: MASTER VENDOR ARMADA                                   */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'armada' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            {isVendorFormOpen && (
              <form
                onSubmit={handleSubmitVendor}
                className="p-5 rounded-2xl bg-blue-50/50 border-2 border-blue-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <div className="font-bold text-sm text-blue-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span>{editingVendorId ? 'Edit Vendor Armada' : '+ Tambah Vendor Armada'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVendorFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Nama Vendor Armada *
                    </label>
                    <input
                      type="text"
                      value={vendorNama}
                      onChange={(e) => setVendorNama(e.target.value)}
                      placeholder="Contoh: PT. Trans Sidoarjo Logistik"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Kontak PIC / Telepon
                    </label>
                    <input
                      type="text"
                      value={vendorKontak}
                      onChange={(e) => setVendorKontak(e.target.value)}
                      placeholder="0812-xxxx-xxxx (Bpk. Bambang)"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Keterangan / Jenis Armada
                    </label>
                    <input
                      type="text"
                      value={vendorKet}
                      onChange={(e) => setVendorKet(e.target.value)}
                      placeholder="Armada Wingbox, Fuso CDD, Tronton"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>

                {vendorError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{vendorError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsVendorFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    {editingVendorId ? 'Perbarui Vendor' : 'Simpan Vendor'}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Nama Vendor Armada</th>
                      <th className="py-3 px-4">Kontak PIC</th>
                      <th className="py-3 px-4">Keterangan Armada</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVendors.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          Belum ada vendor armada terdaftar.
                        </td>
                      </tr>
                    ) : (
                      filteredVendors.map((v) => (
                        <tr key={v.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-3 px-4 font-extrabold text-blue-900">
                            {v.namaVendor}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {v.kontak || '-'}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500">
                            {v.keterangan || '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === v.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onDeleteMasterVendor) onDeleteMasterVendor(v.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditVendor(v)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Edit Vendor"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(v.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Hapus Vendor"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: MASTER BARANG (SKU, SATUAN, BERAT KG/BOX)              */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'barang' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            {isItemFormOpen && (
              <form
                onSubmit={handleSubmitItem}
                className="p-5 rounded-2xl bg-blue-50/50 border-2 border-blue-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                  <div className="font-bold text-sm text-blue-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>{editingItemId ? 'Edit Master Barang' : '+ Tambah Master Barang Baru'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsItemFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Kode Item *
                    </label>
                    <input
                      type="text"
                      value={formKode}
                      onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                      placeholder="00J.KPI09.K0307001XX"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Nama Barang *
                    </label>
                    <input
                      type="text"
                      value={formNama}
                      onChange={(e) => setFormNama(e.target.value)}
                      placeholder="SIC 18 C1 (1 X 30 KG)"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Satuan Muatan
                    </label>
                    <select
                      value={formSatuan}
                      onChange={(e) => setFormSatuan(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Default Qty per Pallet
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      placeholder="15"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Berat per Box (Kg) *
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={formBeratKg}
                      onChange={(e) => setFormBeratKg(e.target.value)}
                      placeholder="30"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-emerald-700 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Kategori Produk
                    </label>
                    <input
                      type="text"
                      value={formKategori}
                      onChange={(e) => setFormKategori(e.target.value)}
                      placeholder="Bahan Baku, Raw Material, Finished Goods"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {itemError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{itemError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsItemFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition-all cursor-pointer"
                  >
                    {editingItemId ? 'Perbarui Barang' : 'Simpan Barang'}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Kode Item</th>
                      <th className="py-3 px-4">Nama Barang</th>
                      <th className="py-3 px-4 text-center">Satuan</th>
                      <th className="py-3 px-4 text-right">Default Qty</th>
                      <th className="py-3 px-4 text-right">Berat (Kg/Box)</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          Belum ada master barang. Klik <strong>+ Tambah Barang Baru</strong>.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-xs">
                              {item.kodeItem}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-extrabold text-slate-900">
                            {item.namaBarang}
                          </td>
                          <td className="py-3 px-4 text-center text-slate-700">
                            {item.satuan}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-800">
                            {item.defaultQty} {item.satuan}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            {item.beratPerBoxKg ?? 30} Kg
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {item.kategori || 'Bahan Baku'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === item.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteMasterItem(item.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditItem(item)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Edit Barang"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Hapus Barang"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4A: HISTORY NOPOL KENDARAAN                               */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'history_nopol' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-start gap-2.5">
                <History className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-indigo-950">
                    Direktori &amp; History Nopol Kendaraan Surat Jalan
                  </div>
                  <div className="text-indigo-800/80 mt-0.5">
                    Menampilkan seluruh riwayat Nopol kendaraan, sopir, nomor HP, vendor armada, tujuan terakhir, serta status blacklist yang terhubung otomatis saat input Surat Jalan.
                  </div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-800 shrink-0 self-start sm:self-center">
                {vehicleHistoryList.length} Nopol Terdaftar
              </span>
            </div>

            {(() => {
              const q = searchTerm.trim().toLowerCase();
              const qNorm = normalizeNopol(searchTerm);
              const filteredVehicles = vehicleHistoryList.filter((v) => {
                const bl = findBlacklistForNopol(v.displayNopol);
                if (nopolStatusFilter === 'SAFE' && bl) return false;
                if (nopolStatusFilter === 'BLACKLIST' && !bl) return false;
                if (!q) return true;
                const matchTrip = v.recentTrips.some(
                  (t) =>
                    t.noSuratJalan.toLowerCase().includes(q) ||
                    t.tujuan.toLowerCase().includes(q) ||
                    t.vendor.toLowerCase().includes(q) ||
                    t.namaDriver.toLowerCase().includes(q) ||
                    t.noHpDriver.toLowerCase().includes(q)
                );
                return (
                  (qNorm && v.normalizedNopol.includes(qNorm)) ||
                  v.displayNopol.toLowerCase().includes(q) ||
                  v.latestDriver.toLowerCase().includes(q) ||
                  v.latestHp.toLowerCase().includes(q) ||
                  v.latestVendor.toLowerCase().includes(q) ||
                  matchTrip
                );
              });

              if (vehicleHistoryList.length === 0) {
                return (
                  <div className="py-12 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                    Belum ada riwayat Nopol kendaraan dari Surat Jalan yang diterbitkan.
                  </div>
                );
              }

              if (filteredVehicles.length === 0) {
                return (
                  <div className="py-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                    Tidak ditemukan Nopol kendaraan sesuai pencarian/filter.
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {filteredVehicles.map((v) => {
                    const vBl = findBlacklistForNopol(v.displayNopol);
                    const isExpanded = expandedNopolKey === v.normalizedNopol;
                    return (
                      <div
                        key={v.normalizedNopol}
                        className={`rounded-xl border transition-colors ${
                          vBl
                            ? 'bg-rose-50/50 border-rose-300'
                            : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-mono font-extrabold text-sm tracking-wider">
                                {v.displayNopol}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                                {v.tripCount}x Pengiriman
                              </span>
                              {vBl ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold uppercase">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>Blacklist: {vBl.alasan}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                  <ShieldCheck className="w-3 h-3" />
                                  <span>Aman</span>
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              <span className="inline-flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                <strong>{v.latestDriver || '-'}</strong>
                                {v.latestHp && (
                                  <span className="font-mono text-slate-500">({v.latestHp})</span>
                                )}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Building className="w-3.5 h-3.5 text-slate-400" />
                                <span>{v.latestVendor || '-'}</span>
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                <span>
                                  Terakhir: {v.lastUsedDate || '-'} &rarr;{' '}
                                  <strong>{v.lastDestination}</strong>
                                </span>
                              </span>
                            </div>

                            {v.driverVariants.length > 1 && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="text-[10px] font-semibold text-slate-500">
                                  Sopir pernah membawa:
                                </span>
                                {v.driverVariants.map((dv, dvIdx) => (
                                  <span
                                    key={dvIdx}
                                    className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-semibold text-slate-700"
                                  >
                                    {dv.namaDriver} ({dv.noHpDriver})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedNopolKey(isExpanded ? null : v.normalizedNopol)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Tutup Riwayat' : `Lihat ${v.recentTrips.length} Trip`}</span>
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4">
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                  <tr>
                                    <th className="py-2 px-3">No. Surat Jalan</th>
                                    <th className="py-2 px-3">Tanggal</th>
                                    <th className="py-2 px-3">Rute Tujuan</th>
                                    <th className="py-2 px-3">Vendor Armada</th>
                                    <th className="py-2 px-3">Nama Sopir</th>
                                    <th className="py-2 px-3">No. HP Sopir</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {v.recentTrips.map((trip) => (
                                    <tr key={trip.id} className="hover:bg-slate-50">
                                      <td className="py-2 px-3 font-mono font-bold text-blue-600 whitespace-nowrap">
                                        {trip.noSuratJalan}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                                        {trip.tanggal}
                                      </td>
                                      <td className="py-2 px-3 font-medium text-slate-800">
                                        {trip.tujuan}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600">
                                        {trip.vendor}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-slate-900">
                                        {trip.namaDriver}
                                      </td>
                                      <td className="py-2 px-3 font-mono text-slate-600">
                                        {trip.noHpDriver}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: MASTER BLACKLIST                                       */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'blacklist' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>
                Nopol kendaraan, nama driver, atau vendor armada yang terdaftar di Master Blacklist akan otomatis memunculkan <strong>peringatan &amp; dialog konfirmasi</strong> apabila diinput saat pembuatan atau pengeditan Surat Jalan.
              </span>
            </div>
            {isBlacklistFormOpen && (
              <form
                onSubmit={handleSubmitBlacklist}
                className="p-5 rounded-2xl bg-rose-50/60 border-2 border-rose-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-rose-200">
                  <div className="font-bold text-sm text-rose-900 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>+ Tambah Entri Blacklist</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBlacklistFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Tipe Entri *
                    </label>
                    <select
                      value={blTipe}
                      onChange={(e) => setBlTipe(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                    >
                      <option value="NOPOL">NOPOL KENDARAAN</option>
                      <option value="DRIVER">NAMA DRIVER</option>
                      <option value="VENDOR">VENDOR LOGISTIK</option>
                      <option value="PALLET">NOMOR PALLET RUSAK</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Nopol Kendaraan / Identifier *
                    </label>
                    <input
                      type="text"
                      value={blIdentifier}
                      onChange={(e) => setBlIdentifier(e.target.value.toUpperCase())}
                      placeholder="Contoh: B 9999 XYZ atau W 9931 PB"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-rose-700 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Keterangan Ditolak / Alasan Blacklist *
                    </label>
                    <input
                      type="text"
                      value={blAlasan}
                      onChange={(e) => setBlAlasan(e.target.value)}
                      placeholder="Contoh: Bak bocor / armada ditolak QC"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>

                {blError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-100 text-red-800 border border-red-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{blError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsBlacklistFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20 transition-all cursor-pointer"
                  >
                    Simpan ke Blacklist
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Tipe</th>
                      <th className="py-3 px-4">Identifier Terblokir</th>
                      <th className="py-3 px-4">Alasan</th>
                      <th className="py-3 px-4">Tanggal Input</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBlacklist.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Tidak ada entri blacklist.
                        </td>
                      </tr>
                    ) : (
                      filteredBlacklist.map((b) => (
                        <tr key={b.id} className="hover:bg-rose-50/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700 border border-slate-200">
                              {b.tipe}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-extrabold text-rose-700">
                            {b.identifier}
                          </td>
                          <td className="py-3 px-4 text-slate-700 text-xs">
                            {b.alasan}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-xs">
                            {b.tanggal}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              DIBLOKIR
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === b.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onDeleteBlacklistRecord) onDeleteBlacklistRecord(b.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(b.id)}
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                title="Hapus Blacklist"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 5: USER MANAGEMENT (OPERATOR & SPV GUDANG)                */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'users' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            {isUserFormOpen && (
              <form
                onSubmit={handleSubmitUser}
                className="p-5 rounded-2xl bg-indigo-50/60 border-2 border-indigo-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-indigo-200">
                  <div className="font-bold text-sm text-indigo-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>+ Daftarkan Petugas / Akun Baru</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsUserFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Nama Lengkap Petugas *
                    </label>
                    <input
                      type="text"
                      value={usrNama}
                      onChange={(e) => setUsrNama(e.target.value)}
                      placeholder="Sandy Pradana"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Username / NIK *
                    </label>
                    <input
                      type="text"
                      value={usrUsername}
                      onChange={(e) => setUsrUsername(e.target.value)}
                      placeholder="sandy.p / 92048"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Peran / Hak Akses *
                    </label>
                    <select
                      value={usrRole}
                      onChange={(e) => setUsrRole(e.target.value as any)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Operator Lapangan">Operator Lapangan (Inbound/Outbound)</option>
                      <option value="Warehouse Admin">Warehouse Admin (Surat Jalan & Cetak)</option>
                      <option value="Supervisor">Supervisor Gudang (Full Kontrol)</option>
                      <option value="Super Admin">Super Admin Gudang</option>
                    </select>
                  </div>
                </div>

                {usrError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-100 text-red-800 border border-red-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{usrError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsUserFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all cursor-pointer"
                  >
                    Daftarkan Petugas
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Nama Petugas</th>
                      <th className="py-3 px-4">Username / ID</th>
                      <th className="py-3 px-4">Peran (Role)</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Belum ada data operator.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="py-3 px-4 font-extrabold text-slate-900">
                            {u.nama}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-600">
                            {u.username}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              {u.status || 'Aktif'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === u.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onDeleteWarehouseUser) onDeleteWarehouseUser(u.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(u.id)}
                                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                title="Hapus Akun Petugas"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 6: MASTER GUDANG & SUB-LOCATION (SJA 3 / GD.137 / KRIAN)  */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'gudang' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-bold">Struktur Location & Sub-Location Gudang:</span>{' '}
                Tambahkan atau aktifkan gudang baru di bawah Location{' '}
                <span className="font-mono font-bold">SJA 3</span>,{' '}
                <span className="font-mono font-bold">Gd. 137</span>, atau{' '}
                <span className="font-mono font-bold">Gd. KRIAN</span>. Gudang berstatus{' '}
                <span className="font-bold">Aktif</span> langsung tampil di menu portal &amp; peta rak Bin.
              </div>
            </div>

            {isWarehouseFormOpen && (
              <form
                onSubmit={handleSubmitWarehouse}
                className="p-5 rounded-2xl bg-emerald-50/50 border-2 border-emerald-200 space-y-4 shadow-sm animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                  <div className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      {editingWarehouseId
                        ? 'Edit Data Gudang & Sub-Location'
                        : '+ Tambah Gudang / Sub-Location Baru'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsWarehouseFormOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Location Induk *
                    </label>
                    <select
                      value={whLocationGroup}
                      onChange={(e) => setWhLocationGroup(e.target.value as WarehouseLocationGroup)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    >
                      {WAREHOUSE_LOCATION_GROUPS.map((grp) => (
                        <option key={grp} value={grp}>
                          {grp}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Kode Gudang *
                    </label>
                    <input
                      type="text"
                      value={whKodeGudang}
                      onChange={(e) => setWhKodeGudang(e.target.value.toUpperCase())}
                      placeholder="Contoh: GD-07 / GD-SJA3"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-emerald-700 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Nama Sub-Location *
                    </label>
                    <input
                      type="text"
                      value={whNamaGudang}
                      onChange={(e) => setWhNamaGudang(e.target.value)}
                      placeholder="Contoh: Gudang 07"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Status Operasional *
                    </label>
                    <select
                      value={whStatus}
                      onChange={(e) => setWhStatus(e.target.value as 'ACTIVE' | 'MAINTENANCE')}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="ACTIVE">Aktif (Siap Operasional)</option>
                      <option value="MAINTENANCE">Under Maintenance (Menyusul)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Prefix Rak Kiri
                    </label>
                    <input
                      type="text"
                      value={whLeftPrefix}
                      onChange={(e) => setWhLeftPrefix(e.target.value.toUpperCase())}
                      placeholder="Misal: 5A, 6A, 7A"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-blue-700 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Prefix Rak Kanan
                    </label>
                    <input
                      type="text"
                      value={whRightPrefix}
                      onChange={(e) => setWhRightPrefix(e.target.value.toUpperCase())}
                      placeholder="Misal: 5B, 6B, 7B"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold text-blue-700 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Jumlah Slot Kiri / Kanan
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={whLeftCount}
                        onChange={(e) => setWhLeftCount(e.target.value)}
                        title="Jumlah Slot Kiri"
                        placeholder="50"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={whRightCount}
                        onChange={(e) => setWhRightCount(e.target.value)}
                        title="Jumlah Slot Kanan"
                        placeholder="50"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Slot Utama Kanan
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={whPrimaryCount}
                      onChange={(e) => setWhPrimaryCount(e.target.value)}
                      placeholder="6"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Subtitle / Deskripsi Denah
                    </label>
                    <input
                      type="text"
                      value={whSubtitle}
                      onChange={(e) => setWhSubtitle(e.target.value)}
                      placeholder="Contoh: Peta Rak 7A & 7B · Area Krian Baru"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Keterangan Tambahan
                    </label>
                    <input
                      type="text"
                      value={whKeterangan}
                      onChange={(e) => setWhKeterangan(e.target.value)}
                      placeholder="Catatan area gudang / operasional"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {whError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-100 text-red-800 border border-red-300 text-xs font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{whError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsWarehouseFormOpen(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs sm:text-sm font-extrabold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    {editingWarehouseId ? 'Perbarui Gudang' : 'Simpan Gudang'}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex-1 flex flex-col">
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase tracking-wider text-[11px] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Kode</th>
                      <th className="py-3 px-4">Sub-Location (Gudang)</th>
                      <th className="py-3 px-4">Konfigurasi Rak Bin</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredWarehouses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Belum ada data gudang yang cocok. Klik{' '}
                          <strong>+ Tambah Gudang / Sub-Location</strong>.
                        </td>
                      </tr>
                    ) : (
                      filteredWarehouses.map((wh) => (
                        <tr key={wh.id} className="hover:bg-emerald-50/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold bg-blue-50 text-blue-800 border border-blue-200 whitespace-nowrap">
                              {wh.locationGroup}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700 text-xs">
                            {wh.kodeGudang}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-900">{wh.namaGudang}</div>
                            {wh.subtitle && (
                              <div className="text-[11px] text-slate-500 mt-0.5">{wh.subtitle}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700">
                            <div>
                              Kiri: <span className="font-bold text-blue-700">{wh.rackLeftPrefix || '5A'}.1–{wh.leftSlotCount ?? 50}</span>
                            </div>
                            <div>
                              Kanan: <span className="font-bold text-indigo-700">{wh.rackRightPrefix || '5B'}.1–{wh.rightSlotCount ?? 50}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {wh.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3" />
                                Aktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                <Wrench className="w-3 h-3" />
                                Maintenance
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {confirmDeleteId === wh.id ? (
                              <div className="flex items-center justify-center gap-1.5 animate-in fade-in">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onDeleteMasterWarehouse) onDeleteMasterWarehouse(wh.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold"
                                >
                                  Ya, Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-semibold"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditWarehouse(wh)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Edit Gudang"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(wh.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Hapus Gudang"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tersinkronisasi otomatis dengan Cloud Firestore PT. Santos Jaya Abadi</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-800 transition-colors cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
