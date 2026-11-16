import React, { useState, useRef, useEffect } from 'react';
import {
  MasterItem,
  MasterRoute,
  MasterVendor,
  MasterRouteTariff,
  BlacklistRecord,
  WarehouseUser,
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
  Users,
  Check,
  AlertCircle,
  ChevronDown
} from 'lucide-react';

interface MasterItemModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  // Blacklist
  blacklistRecords?: BlacklistRecord[];
  onAddBlacklistRecord?: (bl: Omit<BlacklistRecord, 'id'>) => void;
  onDeleteBlacklistRecord?: (id: string) => void;
  // Warehouse Users
  warehouseUsers?: WarehouseUser[];
  onAddWarehouseUser?: (user: Omit<WarehouseUser, 'id'>) => void;
  onDeleteWarehouseUser?: (id: string) => void;
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
  blacklistRecords = [],
  onAddBlacklistRecord,
  onDeleteBlacklistRecord,
  warehouseUsers = [],
  onAddWarehouseUser,
  onDeleteWarehouseUser
}) => {
  // Tabs: 'tujuan_tarif' | 'armada' | 'barang' | 'blacklist' | 'users'
  const [activeMasterTab, setActiveMasterTab] = useState<
    'tujuan_tarif' | 'armada' | 'barang' | 'blacklist' | 'users'
  >('tujuan_tarif');

  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
  const handleSubmitBlacklist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blIdentifier.trim()) {
      setBlError('Nopol / Nama Driver / Identifier wajib diisi.');
      return;
    }
    if (!blAlasan.trim()) {
      setBlError('Alasan blacklist wajib diisi.');
      return;
    }
    const today = new Date().toLocaleDateString('id-ID');
    if (onAddBlacklistRecord) {
      onAddBlacklistRecord({
        tipe: blTipe,
        identifier: blIdentifier.trim(),
        alasan: blAlasan.trim(),
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
              setActiveMasterTab('blacklist');
              setSearchTerm('');
              setConfirmDeleteId(null);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
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
        {/* TAB 4: MASTER BLACKLIST                                       */}
        {/* ------------------------------------------------------------- */}
        {activeMasterTab === 'blacklist' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 pt-1 overflow-y-auto pr-1">
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
                      Identifier (Nopol / Nama) *
                    </label>
                    <input
                      type="text"
                      value={blIdentifier}
                      onChange={(e) => setBlIdentifier(e.target.value.toUpperCase())}
                      placeholder="Contoh: B 9999 XYZ atau Pallet P-99"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-rose-700 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">
                      Alasan Blacklist *
                    </label>
                    <input
                      type="text"
                      value={blAlasan}
                      onChange={(e) => setBlAlasan(e.target.value)}
                      placeholder="Contoh: Muatan rusak, tidak sesuai SOP"
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

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Tersinkronisasi otomatis dengan Cloud Firestore Gudang 5</span>
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
