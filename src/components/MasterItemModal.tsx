import React, { useState } from 'react';
import { MasterItem, COMMON_UNITS } from '../types/warehouse';
import { Database, Plus, Trash2, Search, X, Edit3, Check, Tag } from 'lucide-react';

interface MasterItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  masterItems: MasterItem[];
  onAddMasterItem: (item: Omit<MasterItem, 'id'>) => void;
  onUpdateMasterItem: (item: MasterItem) => void;
  onDeleteMasterItem: (id: string) => void;
}

export const MasterItemModal: React.FC<MasterItemModalProps> = ({
  isOpen,
  onClose,
  masterItems,
  onAddMasterItem,
  onUpdateMasterItem,
  onDeleteMasterItem
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Form states
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formSatuan, setFormSatuan] = useState('Box'); // default Box
  const [formQty, setFormQty] = useState('100');
  const [formKategori, setFormKategori] = useState('Umum');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const filteredItems = masterItems.filter(
    (item) =>
      item.namaBarang.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.kodeItem.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.kategori && item.kategori.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleStartAdd = () => {
    setEditingItemId(null);
    setFormKode('');
    setFormNama('');
    setFormSatuan('Box');
    setFormQty('100');
    setFormKategori('Umum');
    setError('');
    setIsFormOpen(true);
  };

  const handleStartEdit = (item: MasterItem) => {
    setEditingItemId(item.id);
    setFormKode(item.kodeItem);
    setFormNama(item.namaBarang);
    setFormSatuan(item.satuan || 'Box');
    setFormQty(String(item.defaultQty || 100));
    setFormKategori(item.kategori || 'Umum');
    setError('');
    setIsFormOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKode.trim()) {
      setError('Kode Item wajib diisi');
      return;
    }
    if (!formNama.trim()) {
      setError('Nama Barang wajib diisi');
      return;
    }

    const trimmedCode = formKode.trim().toUpperCase();

    // Check duplicate code (excluding current editing item)
    const duplicate = masterItems.find(
      (i) => i.kodeItem.toUpperCase() === trimmedCode && i.id !== editingItemId
    );
    if (duplicate) {
      setError(`Kode Item '${trimmedCode}' sudah digunakan oleh ${duplicate.namaBarang}`);
      return;
    }

    if (editingItemId) {
      // Update existing item
      onUpdateMasterItem({
        id: editingItemId,
        kodeItem: trimmedCode,
        namaBarang: formNama.trim(),
        satuan: formSatuan,
        defaultQty: Number(formQty) || 100,
        kategori: formKategori.trim() || 'Umum'
      });
    } else {
      // Add new item
      onAddMasterItem({
        kodeItem: trimmedCode,
        namaBarang: formNama.trim(),
        satuan: formSatuan,
        defaultQty: Number(formQty) || 100,
        kategori: formKategori.trim() || 'Umum'
      });
    }

    setIsFormOpen(false);
    setEditingItemId(null);
    setError('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Master Database Barang & Kode Item
              </h3>
              <p className="text-xs text-slate-500">
                Tambah, ubah (edit), dan kelola daftar barang referensi gudang
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar & Search */}
        <div className="flex items-center justify-between gap-3 my-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama barang atau kode item..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={handleStartAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Item Baru</span>
          </button>
        </div>

        {/* Add/Edit Form Expandable */}
        {isFormOpen && (
          <form
            onSubmit={handleSubmitForm}
            className="p-4 mb-4 rounded-xl bg-blue-50/50 dark:bg-slate-800/80 border border-blue-200 dark:border-blue-900/60 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {editingItemId ? 'Edit Data Barang Terpilih' : 'Tambah Master Barang Baru'}
                </span>
              </div>
              {editingItemId && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                  ID: #{editingItemId.slice(-4)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Kode Item *
                </label>
                <input
                  type="text"
                  required
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  placeholder="KDK-001"
                  className="w-full font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nama Barang *
                </label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Contoh: Susu Cokelat 250ml"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Satuan
                </label>
                <select
                  value={formSatuan}
                  onChange={(e) => setFormSatuan(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100"
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Std Qty/Pallet
                </label>
                <input
                  type="number"
                  min="1"
                  value={formQty}
                  onChange={(e) => setFormQty(e.target.value)}
                  className="w-full font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {error && <div className="text-xs text-red-600 font-semibold">{error}</div>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingItemId(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                {editingItemId ? 'Simpan Perubahan' : 'Simpan Item Baru'}
              </button>
            </div>
          </form>
        )}

        {/* Master Items Table */}
        <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Kode Item</th>
                <th className="py-2.5 px-3">Nama Barang</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-3 text-right">Std Qty</th>
                <th className="py-2.5 px-3 text-center w-20">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                    editingItemId === item.id ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {item.kodeItem}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                    {item.namaBarang}
                  </td>
                  <td className="py-2.5 px-3 text-slate-500">
                    {item.kategori || '-'}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                    {item.defaultQty || 100} {item.satuan}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition-colors"
                        title="Edit data barang ini"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Hapus ${item.namaBarang} dari master database?`)) {
                            onDeleteMasterItem(item.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                        title="Hapus dari master"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-4 mt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Total {masterItems.length} item terdaftar di database</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
