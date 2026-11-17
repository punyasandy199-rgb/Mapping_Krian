import {
  PalletRecord,
  resolvePalletWarehouseLocation,
  computePalletStockStatus,
  resolvePalletQcStatus,
  deriveAsalPacking
} from '../types/warehouse';
import {
  formatPalletBatchNumbers,
  formatPalletBoxRanges,
  getPalletBatches
} from './batchCalculator';

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
    'Status In/Out',
    'Asal Packing',
    'Status',
    'Status Stok',
    'Lokasi Bin',
    'Lokasi Gudang',
    'Gudang Asal',
    'Oper Gudang 1 (Dari -> Ke)',
    'Tgl Oper Gudang 1',
    'Oper Gudang 2 (Dari -> Ke)',
    'Tgl Oper Gudang 2',
    'Kode Item',
    'Nama Barang',
    'Qty per Pallet',
    'Satuan',
    'No. Batch',
    'No. Box Awal',
    'No. Box Akhir',
    'Detail Multi-Batch',
    'ID Batch Transaksi',
    'Keterangan',
    'Waktu Input'
  ];

  const escapeCsv = (str: string | number | undefined | null): string => {
    if (str === undefined || str === null) return '""';
    const val = String(str).replace(/"/g, '""');
    return `"${val}"`;
  };

  const rows = records.map((item) => {
    const batches = getPalletBatches(item);
    const batchText = formatPalletBatchNumbers(item);
    const multiDetail =
      batches.length > 1
        ? batches.map((b) => `${b.noBatch || '-'} (${b.boxAwal || '-'}-${b.boxAkhir || '-'})`).join('; ')
        : formatPalletBoxRanges(item);

    const op1 = item.operHistory?.[0];
    const op2 = item.operHistory?.[1];

    return [
      escapeCsv(item.barcodeNumber),
      escapeCsv(item.nomorPallet || '-'),
      escapeCsv(item.status === 'OUT' ? 'OUT' : 'IN'),
      escapeCsv(deriveAsalPacking(batchText)),
      escapeCsv(resolvePalletQcStatus(item)),
      escapeCsv(computePalletStockStatus(item)),
      escapeCsv(item.lokasiBin),
      escapeCsv(resolvePalletWarehouseLocation(item)),
      escapeCsv(item.gudangAsal || op1?.dariGudang || '-'),
      escapeCsv(op1 ? `${op1.dariGudang} -> ${op1.keGudang}` : '-'),
      escapeCsv(op1?.tanggalOper ? new Date(op1.tanggalOper).toLocaleString('id-ID') : '-'),
      escapeCsv(op2 ? `${op2.dariGudang} -> ${op2.keGudang}` : '-'),
      escapeCsv(op2?.tanggalOper ? new Date(op2.tanggalOper).toLocaleString('id-ID') : '-'),
      escapeCsv(item.kodeItem || '-'),
      escapeCsv(item.namaBarang),
      item.qtyPallet,
      escapeCsv(item.unit || 'Box'),
      escapeCsv(batchText),
      escapeCsv(item.boxAwal || item.batchAwal || '-'),
      escapeCsv(item.boxAkhir || item.batchAkhir || '-'),
      escapeCsv(multiDetail),
      escapeCsv(item.batchId),
      escapeCsv(item.keterangan || '-'),
      escapeCsv(new Date(item.submittedAt).toLocaleString('id-ID'))
    ];
  });

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
