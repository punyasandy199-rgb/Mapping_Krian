import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { PalletRecord } from '../types/warehouse';
import { encodeCode128B } from './code128';
import { sortBinRecordsByLoadingOrder } from './binSorting';

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
/**
 * Generates an official A4 Portrait Bin Manifest Card (Lembar Muatan Bin)
 * Formatted cleanly without black blocking, with centered QR code and standard range notation.
 */
export async function generateBinManifestPdfDoc(
  binCode: string,
  records: PalletRecord[]
): Promise<jsPDF> {
  // A4 Portrait (210mm wide x 297mm tall)
  // Formatted so the manifest is placed strictly on the top 1/2 of the A4 page (~115-120mm height)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4' // 210 x 297 mm
  });

  const pageWidth = 210;
  const margin = 8;
  const contentWidth = pageWidth - margin * 2; // 194mm

  // Separate active records from picked (OUT) records
  const activeRecords: PalletRecord[] = [];
  const pickedRecords: PalletRecord[] = [];

  records.forEach((r) => {
    if (r.status === 'OUT') {
      pickedRecords.push(r);
    } else {
      activeRecords.push(r);
    }
  });

  // Sort active records: newest input at No. 1, earliest input at the bottom (slot 8)
  const sortedActiveRecords = sortBinRecordsByLoadingOrder(activeRecords);

  // Picked records sorted newest pick first
  pickedRecords.sort((a, b) => {
    const timeA = a.tanggalPengambilan ? new Date(a.tanggalPengambilan).getTime() : 0;
    const timeB = b.tanggalPengambilan ? new Date(b.tanggalPengambilan).getTime() : 0;
    return timeB - timeA;
  });

  // Extract unique item names from active records (or fallback to all if empty)
  const dominantItemName =
    Array.from(
      new Set(
        (activeRecords.length > 0 ? activeRecords : records)
          .map((r) => r.namaBarang)
          .filter(Boolean)
      )
    ).join(' / ') || '-';

  const uniqueActivePallets = new Set(activeRecords.map((r) => r.nomorPallet || r.id)).size;
  const totalActiveQty = activeRecords.reduce((sum, r) => sum + (Number(r.qtyPallet) || 0), 0);

  // 1. Header Box (40mm height, maximized clean white card with crisp border)
  const headerHeight = 40;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(15, 23, 42); // slate-900 outline
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, margin, contentWidth, headerHeight, 1.5, 1.5, 'FD');

  // Top right: GUDANG 5 badge (large & bold)
  const badgeWidth = 32;
  const badgeX = pageWidth - margin - badgeWidth - 3; // 210 - 8 - 32 - 3 = 167
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.roundedRect(badgeX, margin + 3.5, badgeWidth, 7.5, 1, 1, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('GUDANG 5', badgeX + badgeWidth / 2, margin + 8.8, { align: 'center' });

  // Large QR Code centered in its box (22mm x 22mm inside 32mm x 26mm box)
  const qrBoxWidth = 32;
  const qrBoxHeight = 26;
  const qrBoxX = badgeX;
  const qrBoxY = margin + 12;
  const qrSize = 22; // 22 x 22 mm
  const qrX = qrBoxX + (qrBoxWidth - qrSize) / 2;
  const qrY = qrBoxY + (qrBoxHeight - qrSize) / 2;

  const binScanUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?bin=${encodeURIComponent(binCode)}`
      : `?bin=${binCode}`;

  try {
    const qrDataUrl = await QRCode.toDataURL(binScanUrl, {
      margin: 0,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.3);
    doc.roundedRect(qrBoxX, qrBoxY, qrBoxWidth, qrBoxHeight, 1, 1, 'FD');
    doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch (err) {
    console.error('Failed to generate QR in PDF', err);
  }

  // Left Header Text: ENLARGED EXTRA BOLD LOKASI BIN (26pt) & NAMA BARANG (16pt)
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(26);
  doc.setFont('helvetica', 'bold');
  doc.text(`LOKASI BIN: ${binCode.toUpperCase()}`, margin + 6, margin + 16);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  const splitItemName = doc.splitTextToSize(dominantItemName.toUpperCase(), contentWidth - 48);
  doc.text(splitItemName, margin + 6, margin + 28);

  // 2. Summary Metrics Bar (Enlarged to 8.5mm, 9pt font)
  let currentY = margin + headerHeight + 3;
  const metricsHeight = 8.5;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.rect(margin, currentY, contentWidth, metricsHeight, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Pallet: ${uniqueActivePallets} Pallet`, margin + 5, currentY + 5.8);
  doc.text(`Total Muatan: ${totalActiveQty.toLocaleString('id-ID')} Box`, margin + 46, currentY + 5.8);
  doc.text(`Item Aktif: ${sortedActiveRecords.length} Baris`, margin + 98, currentY + 5.8);

  if (pickedRecords.length > 0) {
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text(`Diambil: ${pickedRecords.length} Pallet`, margin + 138, currentY + 5.8);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, margin + 138, currentY + 5.8);
  }

  currentY += metricsHeight + 3;

  // 3. Table Headers (Enlarged to 8mm, 8.5pt font, with clear column dividers & generous spacing)
  const thHeight = 8;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.rect(margin, currentY, contentWidth, thHeight, 'FD');

  // Column boundaries:
  // Margin = 8
  // Col 1 (No): 8 -> 16 (width 8mm, center 12)
  // Col 2 (No Pallet): 16 -> 34 (width 18mm, text 18)
  // Col 3 (Kode Item): 34 -> 76 (width 42mm, text 36, ends at ~66 -> 10mm space before line at 76)
  // Col 4 (Nama Barang): 76 -> 124 (width 48mm, text 79)
  // Col 5 (Qty): 124 -> 140 (width 16mm, text 126)
  // Col 6 (No. Batch): 140 -> 156 (width 16mm, text 142)
  // Col 7 (No. Box): 156 -> 202 (width 46mm, center 179)
  const colDividers = [16, 34, 76, 124, 140, 156];

  // Draw vertical dividers in table header
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  colDividers.forEach((x) => {
    doc.line(x, currentY, x, currentY + thHeight);
  });

  doc.setTextColor(15, 23, 42); // Solid black text
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');

  doc.text('No', 12, currentY + 5.5, { align: 'center' });
  doc.text('No Pallet', 18, currentY + 5.5);
  doc.text('Kode Item', 36, currentY + 5.5);
  doc.text('Nama Barang', 79, currentY + 5.5);
  doc.text('Qty', 126, currentY + 5.5);
  doc.text('No. Batch', 142, currentY + 5.5);
  doc.text('No. Box (Awal - Akhir)', 179, currentY + 5.5, { align: 'center' });

  currentY += thHeight;

  // 4. Rows (Enlarged height 8mm, 8.5pt font, with crisp vertical dividers between all columns)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const rowHeight = 8;

  if (sortedActiveRecords.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, currentY, contentWidth, 12, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, contentWidth, 12, 'S');
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Semua pallet di Bin ${binCode} telah selesai diambil (Outbound).`,
      margin + 45,
      currentY + 7.5
    );
    currentY += 12;
  } else {
    sortedActiveRecords.forEach((r, i) => {
      // In case of extra items, add page
      if (currentY > 275) {
        doc.addPage('a4', 'portrait');
        currentY = margin + 4;
      }

      const rowBg = i % 2 === 0 ? 255 : 248;
      doc.setFillColor(rowBg, rowBg, rowBg);
      doc.rect(margin, currentY, contentWidth, rowHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, currentY, contentWidth, rowHeight, 'S');

      // Draw subtle vertical column divider lines in each row
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      colDividers.forEach((x) => {
        doc.line(x, currentY, x, currentY + rowHeight);
      });

      // Col 1: No
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8.5);
      doc.text(String(i + 1), 12, currentY + 5.3, { align: 'center' });

      // Col 2: No Pallet
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(r.nomorPallet || '-', 18, currentY + 5.3);

      // Col 3: Kode Item (8pt bold blue, starts at 36, clear gap before divider at 76)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(29, 78, 216);
      doc.text(r.kodeItem || '-', 36, currentY + 5.3);

      // Col 4: Nama Barang (Starts at 79 after vertical divider line at 76)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const name = r.namaBarang.length > 28 ? r.namaBarang.substring(0, 26) + '...' : r.namaBarang;
      doc.text(name, 79, currentY + 5.3);

      // Col 5: Qty
      doc.setFont('helvetica', 'bold');
      doc.text(`${r.qtyPallet} ${r.unit}`, 126, currentY + 5.3);

      // Col 6: No. Batch
      doc.setTextColor(29, 78, 216);
      doc.text(r.noBatch || '-', 142, currentY + 5.3);

      // Col 7: No. Box (Awal - Akhir) - Centered at 179
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const startBox = (r.boxAwal || r.batchAwal || '').trim();
      const endBox = (r.boxAkhir || r.batchAkhir || '').trim();
      let boxRangeText = '-';
      if (startBox && endBox) {
        boxRangeText = `${startBox} - ${endBox}`;
      } else if (startBox || endBox) {
        boxRangeText = startBox || endBox;
      }
      doc.text(boxRangeText, 179, currentY + 5.3, { align: 'center' });

      currentY += rowHeight;
    });
  }

  // 5. RIWAYAT PALLET YANG TELAH DIAMBIL (OUTBOUND)
  if (pickedRecords.length > 0) {
    currentY += 4;

    // Check page overflow
    if (currentY > 250) {
      doc.addPage('a4', 'portrait');
      currentY = margin + 4;
    }

    // Section Header Banner
    const historyHeaderHeight = 7.5;
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.rect(margin, currentY, contentWidth, historyHeaderHeight, 'FD');

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `RIWAYAT PALLET YANG DIAMBIL DARI BIN ${binCode.toUpperCase()} (${pickedRecords.length} PALLET)`,
      margin + 4,
      currentY + 5.2
    );

    currentY += historyHeaderHeight;

    // Table Header for Taken Items
    const thHistHeight = 7;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.rect(margin, currentY, contentWidth, thHistHeight, 'FD');

    // Dividers: Margin: 8 -> 202 (Width 194)
    const histDividers = [16, 34, 72, 116, 130, 156, 178];
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    histDividers.forEach((x) => {
      doc.line(x, currentY, x, currentY + thHistHeight);
    });

    doc.setTextColor(51, 65, 85);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('No', 12, currentY + 4.8, { align: 'center' });
    doc.text('No Pallet', 18, currentY + 4.8);
    doc.text('Kode Item', 36, currentY + 4.8);
    doc.text('Nama Barang', 74, currentY + 4.8);
    doc.text('Qty', 119, currentY + 4.8);
    doc.text('Batch / Box', 132, currentY + 4.8);
    doc.text('Tujuan', 158, currentY + 4.8);
    doc.text('Tgl Pengambilan', 180, currentY + 4.8);

    currentY += thHistHeight;

    // Rows of Taken Pallets
    const histRowHeight = 6.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    pickedRecords.forEach((r, i) => {
      if (currentY > 278) {
        doc.addPage('a4', 'portrait');
        currentY = margin + 4;
      }

      const rowBg = i % 2 === 0 ? 255 : 250;
      doc.setFillColor(rowBg, rowBg, rowBg);
      doc.rect(margin, currentY, contentWidth, histRowHeight, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, currentY, contentWidth, histRowHeight, 'S');

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      histDividers.forEach((x) => {
        doc.line(x, currentY, x, currentY + histRowHeight);
      });

      // No
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(String(i + 1), 12, currentY + 4.5, { align: 'center' });

      // No Pallet
      doc.setTextColor(15, 23, 42);
      doc.text(r.nomorPallet || '-', 18, currentY + 4.5);

      // Kode Item
      doc.setTextColor(29, 78, 216);
      doc.text(r.kodeItem || '-', 36, currentY + 4.5);

      // Nama Barang
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const name = r.namaBarang.length > 24 ? r.namaBarang.substring(0, 22) + '...' : r.namaBarang;
      doc.text(name, 74, currentY + 4.5);

      // Qty
      doc.setFont('helvetica', 'bold');
      doc.text(`${r.qtyPallet} ${r.unit}`, 119, currentY + 4.5);

      // Batch & Box
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const boxStr =
        r.boxAwal || r.batchAwal ? ` (${r.boxAwal || r.batchAwal}-${r.boxAkhir || r.batchAkhir})` : '';
      doc.text(`${r.noBatch || '-'}${boxStr}`, 132, currentY + 4.5);

      // Tujuan
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105); // emerald-600
      doc.text(r.tujuanPengambilan || '-', 158, currentY + 4.5);

      // Tanggal Pengambilan
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      let dateDisplay = '-';
      if (r.tanggalPengambilan) {
        try {
          const d = new Date(r.tanggalPengambilan);
          dateDisplay = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
            .toString()
            .padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;
        } catch {
          dateDisplay = r.tanggalPengambilan;
        }
      }
      doc.text(dateDisplay, 180, currentY + 4.5);

      currentY += histRowHeight;
    });
  }

  return doc;
}

/**
 * Downloads the official Bin Manifest PDF file.
 */
export async function downloadBinManifestPdf(
  binCode: string,
  records: PalletRecord[],
  filename?: string
): Promise<void> {
  const doc = await generateBinManifestPdfDoc(binCode, records);
  const outputName = filename || `Kartu_Muatan_Bin_${binCode.replace('.', '_')}.pdf`;
  doc.save(outputName);
}

/**
 * Opens the official Bin Manifest PDF directly in a new browser tab.
 */
export async function openBinManifestPdfInNewTab(
  binCode: string,
  records: PalletRecord[]
): Promise<void> {
  const doc = await generateBinManifestPdfDoc(binCode, records);
  const blobUrl = doc.output('bloburl');
  window.open(blobUrl, '_blank');
}



