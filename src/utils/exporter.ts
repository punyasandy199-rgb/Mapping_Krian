import { PalletRecord } from '../types/warehouse';

/**
 * Exports pallet records to a CSV file readable by Microsoft Excel, Google Sheets, etc.
 * Uses UTF-8 BOM so Excel opens it with correct encoding.
 */
export function exportPalletsToCsv(records: PalletRecord[], filenamePrefix = 'data_pallet_inbound'): void {
  if (records.length === 0) {
    return;
  }

  const headers = [
    'No Barcode',
    'Nomor Pallet',
    'Lokasi Bin',
    'Kode Item',
    'Nama Barang',
    'Qty per Pallet',
    'Satuan',
    'No. Batch',
    'No. Box Awal',
    'No. Box Akhir',
    'ID Batch Transaksi',
    'Keterangan',
    'Waktu Input'
  ];

  const escapeCsv = (str: string | number | undefined | null): string => {
    if (str === undefined || str === null) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = records.map((item) => [
    escapeCsv(item.barcodeNumber),
    escapeCsv(item.nomorPallet || '-'),
    escapeCsv(item.lokasiBin),
    escapeCsv(item.kodeItem || '-'),
    escapeCsv(item.namaBarang),
    item.qtyPallet,
    escapeCsv(item.unit || 'Box'),
    escapeCsv(item.noBatch || '-'),
    escapeCsv(item.boxAwal || item.batchAwal || '-'),
    escapeCsv(item.boxAkhir || item.batchAkhir || '-'),
    escapeCsv(item.batchId),
    escapeCsv(item.keterangan || '-'),
    escapeCsv(new Date(item.submittedAt).toLocaleString('id-ID'))
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(','))
  ].join('\r\n');

  // \uFEFF is UTF-8 Byte Order Mark for Excel
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;
  const filename = `${filenamePrefix}_${dateStr}_${timeStr}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
