import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { PalletRecord } from '../types/warehouse';
import { encodeCode128B } from './code128';

/**
 * Generates and downloads a thermal label PDF (100mm x 150mm) for one or multiple pallet records.
 * Can be sent directly to thermal label printers (Zebra, TSC, Xprinter, Honeywell, Brother)
 * or standard printers, and saved as a crisp vector PDF file.
 */
export async function downloadPalletLabelPdf(
  records: PalletRecord[],
  filename?: string
): Promise<void> {
  if (!records || records.length === 0) return;

  // 100mm x 150mm standard thermal label size in portrait
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [100, 150]
  });

  for (let idx = 0; idx < records.length; idx++) {
    if (idx > 0) {
      doc.addPage([100, 150], 'portrait');
    }

    const record = records[idx];
    await renderSingleLabelOnDoc(doc, record);
  }

  const defaultFilename =
    records.length === 1
      ? `Label_Pallet_${records[0].nomorPallet || 'PLT'}_${records[0].lokasiBin || 'Bin'}.pdf`
      : `Label_Pallet_Multi_${records.length}_items.pdf`;

  doc.save(filename || defaultFilename);
}

/**
 * Generates an A4 Table Summary Report PDF of Pallet History
 */
export async function downloadPalletHistoryReportPdf(
  records: PalletRecord[],
  filename = 'Laporan_Riwayat_Pallet_Gudang5.pdf'
): Promise<void> {
  if (!records || records.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4' // 210 x 297 mm
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, margin, contentWidth, 18, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('LAPORAN RIWAYAT PALLET INBOUND - GUDANG 5', margin + 6, margin + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Total: ${records.length} Item · Dicetak pada: ${new Date().toLocaleString('id-ID')}`,
    margin + 6,
    margin + 14
  );

  // Table Headers
  let startY = margin + 24;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, startY, contentWidth, 8, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, startY, contentWidth, 8, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  doc.text('No', margin + 2, startY + 5.5);
  doc.text('No Pallet', margin + 10, startY + 5.5);
  doc.text('Bin', margin + 30, startY + 5.5);
  doc.text('Kode Item', margin + 45, startY + 5.5);
  doc.text('Nama Barang', margin + 74, startY + 5.5);
  doc.text('Qty', margin + 124, startY + 5.5);
  doc.text('No. Batch', margin + 142, startY + 5.5);
  doc.text('Rentang No. Box', margin + 162, startY + 5.5);

  startY += 8;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  records.forEach((r, i) => {
    // Check if new page needed
    if (startY > 275) {
      doc.addPage('a4', 'portrait');
      startY = margin + 10;
    }

    const rowBg = i % 2 === 0 ? 255 : 248;
    doc.setFillColor(rowBg, rowBg, rowBg);
    doc.rect(margin, startY, contentWidth, 7, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, startY, contentWidth, 7, 'S');

    doc.setTextColor(51, 65, 85);
    doc.text(String(i + 1), margin + 2, startY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(r.nomorPallet || '-', margin + 10, startY + 4.5);

    doc.setTextColor(29, 78, 216);
    doc.text(r.lokasiBin || '-', margin + 30, startY + 4.5);

    doc.setTextColor(51, 65, 85);
    doc.text(r.kodeItem || '-', margin + 45, startY + 4.5);

    doc.setFont('helvetica', 'normal');
    const truncatedName = r.namaBarang.length > 25 ? r.namaBarang.substring(0, 23) + '...' : r.namaBarang;
    doc.text(truncatedName, margin + 74, startY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.text(`${r.qtyPallet} ${r.unit}`, margin + 124, startY + 4.5);

    doc.setTextColor(29, 78, 216);
    doc.text(r.noBatch || '-', margin + 142, startY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    const boxRangeStr = `${r.boxAwal || r.batchAwal || '-'} - ${r.boxAkhir || r.batchAkhir || '-'}`;
    doc.text(boxRangeStr, margin + 162, startY + 4.5);

    startY += 7;
  });

  doc.save(filename);
}

/**
 * Helper to render a high-quality 100mm x 150mm thermal label into a jsPDF document instance
 */
async function renderSingleLabelOnDoc(doc: jsPDF, record: PalletRecord): Promise<void> {
  // Label border
  doc.setDrawColor(15, 23, 42); // slate-900
  doc.setLineWidth(0.8);
  doc.roundedRect(5, 5, 90, 140, 2, 2);

  // 1. Header: PALLET TAG & NOMOR PALLET
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(8, 8, 28, 7.5, 1, 1, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('PALLET TAG', 22, 13, { align: 'center' });

  // Nomor Pallet Badge
  doc.setFillColor(254, 240, 138); // yellow-200 / amber-200
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.roundedRect(38, 8, 34, 7.5, 1, 1, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`#${record.nomorPallet || 'PLT'}`, 55, 13.2, { align: 'center' });

  // Batch short code
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`#${record.batchId.slice(-6)}`, 91, 12.8, { align: 'right' });

  // Divider
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(8, 17.5, 92, 17.5);

  // 2. Lokasi Bin Box with QR Code (y: 20 to 45)
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.roundedRect(8, 20, 84, 24, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('LOKASI BIN GUDANG 5', 34, 26, { align: 'center' });

  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(record.lokasiBin || '5A.1', 34, 38, { align: 'center' });

  // Generate QR Code URL
  const binScanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(
          record.lokasiBin || '5A.1'
        )}`
      : `?bin=${record.lokasiBin || '5A.1'}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(binScanUrl, {
      margin: 1,
      width: 200,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    // Place QR Code inside right side of bin box
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.roundedRect(68, 21.5, 21, 21, 1, 1, 'FD');
    doc.addImage(qrDataUrl, 'PNG', 69, 22.5, 19, 19);
  } catch (err) {
    console.error('Failed to generate QR in PDF', err);
  }

  // 3. Kode Item & Nama Barang (y: 47 to 69)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(8, 47, 84, 21, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('KODE ITEM:', 11, 52.5);

  doc.setTextColor(29, 78, 216); // blue-700
  doc.setFontSize(8.5);
  doc.text(record.kodeItem || '-', 90, 52.5, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  const splitName = doc.splitTextToSize(record.namaBarang, 80);
  doc.text(splitName, 11, 59);

  // 4. QTY & Tanggal Input (y: 71 to 87)
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(8, 71, 92, 71);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('QTY DALAM PALLET', 11, 76);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`${record.qtyPallet.toLocaleString('id-ID')} ${record.unit}`, 11, 83);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('TANGGAL INPUT', 54, 76);

  const formattedDate = new Date(record.submittedAt).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);
  doc.text(formattedDate, 54, 82.5);

  doc.line(8, 87, 92, 87);

  // 5. No. Batch & Rentang No. Box (y: 89 to 107)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(8, 89, 84, 17, 1.5, 1.5, 'FD');

  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('NO. BATCH:', 11, 93.5);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text(record.noBatch || '-', 32, 93.5);

  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('RENTANG NO. BOX', 11, 99);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const boxStart = record.boxAwal || record.batchAwal || '-';
  const boxEnd = record.boxAkhir || record.batchAkhir || '-';
  doc.text(`Box: ${boxStart}`, 11, 104);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('s/d', 50, 104, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Box: ${boxEnd}`, 90, 104, { align: 'right' });

  // Keterangan if exists
  if (record.keterangan) {
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text(`Catatan: ${record.keterangan}`, 11, 108);
  }

  // 6. Barcode Code 128 (y: 110 to 138)
  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.line(8, 109.5, 92, 109.5);
  doc.setLineDashPattern([], 0); // reset dash

  const { valid, modules } = encodeCode128B(record.barcodeNumber);
  if (valid && modules.length > 0) {
    const barcodeStartX = 11;
    const barcodeWidth = 78; // 78mm width
    const barUnitWidth = barcodeWidth / modules.length;
    const barcodeHeight = 17; // 17mm tall
    const barcodeStartY = 113;

    doc.setFillColor(0, 0, 0);

    let currentBarStart: number | null = null;
    for (let m = 0; m < modules.length; m++) {
      if (modules[m]) {
        if (currentBarStart === null) currentBarStart = m;
      } else {
        if (currentBarStart !== null) {
          const x = barcodeStartX + currentBarStart * barUnitWidth;
          const w = (m - currentBarStart) * barUnitWidth;
          doc.rect(x, barcodeStartY, w, barcodeHeight, 'F');
          currentBarStart = null;
        }
      }
    }
    if (currentBarStart !== null) {
      const x = barcodeStartX + currentBarStart * barUnitWidth;
      const w = (modules.length - currentBarStart) * barUnitWidth;
      doc.rect(x, barcodeStartY, w, barcodeHeight, 'F');
    }

    // Barcode human readable text
    doc.setFontSize(9);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(record.barcodeNumber, 50, 136, { align: 'center' });
  }
}

/**
 * Generates and downloads an official A4 Bin Manifest Card (Lembar Muatan Bin)
 * with large Bin QR Code, prominent Bin Code and Item Name visible from afar,
 * Gudang 5 in top right, newest pallet as row No. 1, and no barcode column or signature lines.
 */
export async function downloadBinManifestPdf(
  binCode: string,
  records: PalletRecord[],
  filename?: string
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4' // 210 x 297 mm
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm

  // Sort: newest input at No. 1, earliest input at the bottom (slot 8)
  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );

  // Extract unique item names
  const dominantItemName =
    Array.from(new Set(records.map((r) => r.namaBarang).filter(Boolean))).join(' / ') || '-';

  const uniquePallets = new Set(records.map((r) => r.nomorPallet || r.id)).size;
  const totalQty = records.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);

  // Header Box
  const headerHeight = 48;
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, margin, contentWidth, headerHeight, 'F');

  // Top right: GUDANG 5 badge per user instruction
  doc.setFillColor(254, 240, 138); // amber/yellow badge
  doc.roundedRect(pageWidth - margin - 38, margin + 4, 34, 7.5, 1, 1, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('GUDANG 5', pageWidth - margin - 21, margin + 9.2, { align: 'center' });

  // Large QR Code in header (40mm x 40mm)
  const binScanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(binCode)}`
      : `?bin=${binCode}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(binScanUrl, {
      margin: 1,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    // White background card for QR
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - margin - 40, margin + 13.5, 38, 31, 1, 1, 'F');
    doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - 37.5, margin + 14.5, 26, 26);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`SCAN BIN ${binCode}`, pageWidth - margin - 21, margin + 43, { align: 'center' });
  } catch (err) {
    console.error('Failed to generate QR in PDF', err);
  }

  // Left Header Text: Extra Big Bold LOKASI BIN and direct NAMA BARANG (tanpa "BARANG:")
  doc.setTextColor(254, 240, 138); // Yellow-200
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text(`LOKASI BIN: ${binCode.toUpperCase()}`, margin + 6, margin + 17);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  const splitItemName = doc.splitTextToSize(dominantItemName.toUpperCase(), contentWidth - 46);
  doc.text(splitItemName, margin + 6, margin + 29);

  // Summary Metrics Bar
  let currentY = margin + headerHeight + 4;
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, currentY, contentWidth, 12, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, contentWidth, 12, 'S');

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Pallet: ${uniquePallets} Pallet`, margin + 4, currentY + 7.5);
  doc.text(`Total Muatan: ${totalQty.toLocaleString('id-ID')} Box`, margin + 48, currentY + 7.5);
  doc.text(`Jumlah Item: ${records.length} Baris`, margin + 98, currentY + 7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, margin + 138, currentY + 7.5);

  currentY += 16;

  // Table Headers (Barcode column removed per user instruction!)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, currentY, contentWidth, 8, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  doc.text('No', margin + 3, currentY + 5.5);
  doc.text('No Pallet', margin + 12, currentY + 5.5);
  doc.text('Kode Item', margin + 35, currentY + 5.5);
  doc.text('Nama Barang', margin + 70, currentY + 5.5);
  doc.text('Qty', margin + 124, currentY + 5.5);
  doc.text('No. Batch', margin + 140, currentY + 5.5);
  doc.text('No. Box (Awal - Akhir)', margin + 158, currentY + 5.5);

  currentY += 8;

  // Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  if (sortedRecords.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, currentY, contentWidth, 14, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, contentWidth, 14, 'S');
    doc.setTextColor(100, 116, 139);
    doc.text(`Belum ada muatan pallet tersimpan di Bin ${binCode}`, margin + 55, currentY + 8.5);
    currentY += 14;
  } else {
    sortedRecords.forEach((r, i) => {
      if (currentY > 275) {
        doc.addPage('a4', 'portrait');
        currentY = margin + 10;
      }

      const rowBg = i % 2 === 0 ? 255 : 248;
      doc.setFillColor(rowBg, rowBg, rowBg);
      doc.rect(margin, currentY, contentWidth, 7, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, currentY, contentWidth, 7, 'S');

      doc.setTextColor(71, 85, 105);
      doc.text(String(i + 1), margin + 3, currentY + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(r.nomorPallet || '-', margin + 12, currentY + 4.8);

      doc.setTextColor(29, 78, 216);
      doc.text(r.kodeItem || '-', margin + 35, currentY + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const name = r.namaBarang.length > 34 ? r.namaBarang.substring(0, 32) + '...' : r.namaBarang;
      doc.text(name, margin + 70, currentY + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.text(`${r.qtyPallet} ${r.unit}`, margin + 124, currentY + 4.8);

      doc.setTextColor(29, 78, 216);
      doc.text(r.noBatch || '-', margin + 140, currentY + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const boxRange = `${r.boxAwal || r.batchAwal || '-'} → ${r.boxAkhir || r.batchAkhir || '-'}`;
      doc.text(boxRange, margin + 158, currentY + 4.8);

      currentY += 7;
    });
  }

  // Note: Signature lines (Petugas & SPV) removed completely per user instructions

  const outputName = filename || `Kartu_Muatan_Bin_${binCode.replace('.', '_')}.pdf`;
  doc.save(outputName);
}


