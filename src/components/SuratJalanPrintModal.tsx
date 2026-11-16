import React, { useEffect, useState } from 'react';
import { PalletBatchEntry, PalletRecord, SuratJalanRecord } from '../types/warehouse';
import {
  formatPalletBatchNumbers,
  formatPalletBoxRanges,
  getPalletBatches
} from '../utils/batchCalculator';
import { X, Printer, Download, CheckCircle, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import jsPDF from 'jspdf';

interface SuratJalanPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: SuratJalanRecord | null;
  records?: SuratJalanRecord[];
  palletRecords?: PalletRecord[];
}

interface PickedItemRow {
  noPallet: string;
  kodeItem: string;
  namaBarang: string;
  lokasiBin: string;
  noBatch: string;
  rangeBox: string;
  batchEntries: PalletBatchEntry[];
  qtyBox: number;
  beratKg: number;
}

// Helper ambil tanggal saja (DD/MM/YYYY) tanpa jam
function extractDateOnly(val?: string): string {
  if (!val) return '';
  const beforeComma = val.trim().split(',')[0].trim();
  const datePart = beforeComma.split('T')[0].trim();
  const isoMatch = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return datePart;
}

function getRealtimeDateIndo(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function buildPickedRowsForRecord(
  targetRecord: SuratJalanRecord,
  palletRecords: PalletRecord[]
): PickedItemRow[] {
  if (!targetRecord.palletIds || targetRecord.palletIds.length === 0) {
    return [];
  }

  const matchedPallets = palletRecords.filter((p) =>
    (targetRecord.palletIds || []).includes(p.id)
  );
  if (matchedPallets.length > 0) {
    return matchedPallets.map((p) => {
      const summaryItem = targetRecord.itemsSummary.find(
        (item) => item.kodeItem === p.kodeItem || item.namaBarang === p.namaBarang
      );
      const beratPerBox = summaryItem?.beratPerBoxKg || 30;
      const batchEntries = getPalletBatches(p);
      const noBatch = formatPalletBatchNumbers(p);
      const rangeBox = formatPalletBoxRanges(p);

      return {
        noPallet: p.nomorPallet || p.barcodeNumber || '-',
        kodeItem: p.kodeItem || '-',
        namaBarang: p.namaBarang || '-',
        lokasiBin: p.lokasiBin || '-',
        noBatch,
        rangeBox,
        batchEntries,
        qtyBox: Number(p.qtyPallet) || 0,
        beratKg: (Number(p.qtyPallet) || 0) * beratPerBox
      };
    });
  }

  // Fallback ke itemsSummary jika palletRecords tidak tersedia / terhapus
  const fallback: PickedItemRow[] = [];
  targetRecord.itemsSummary.forEach((item) => {
    const pallets =
      item.nomorPalletList && item.nomorPalletList.length > 0 ? item.nomorPalletList : ['-'];
    const batches =
      item.noBatchList && item.noBatchList.length > 0 ? item.noBatchList : ['-'];
    if (pallets.length > 1) {
      pallets.forEach((plt, idx) => {
        fallback.push({
          noPallet: plt || '-',
          kodeItem: item.kodeItem,
          namaBarang: item.namaBarang,
          lokasiBin: '-',
          noBatch: batches[idx] || batches.join(', ') || '-',
          rangeBox: '-',
          batchEntries: [],
          qtyBox: Math.round(item.qtyBox / pallets.length),
          beratKg: Math.round(item.totalKg / pallets.length)
        });
      });
    } else {
      fallback.push({
        noPallet: pallets[0] || '-',
        kodeItem: item.kodeItem,
        namaBarang: item.namaBarang,
        lokasiBin: '-',
        noBatch: batches.join(', ') || '-',
        rangeBox: '-',
        batchEntries: [],
        qtyBox: item.qtyBox,
        beratKg: item.totalKg
      });
    }
  });
  return fallback;
}

function buildLeftMetaRows(targetRecord: SuratJalanRecord) {
  const displayTanggalCetak =
    extractDateOnly(targetRecord.tglJamCetakCustom) ||
    extractDateOnly(targetRecord.waktuCetakFormatted) ||
    extractDateOnly(targetRecord.tanggalPengambilanFormatted) ||
    extractDateOnly(targetRecord.tanggal) ||
    getRealtimeDateIndo();

  const leftMetaRows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Tanggal', value: displayTanggalCetak },
    { label: 'No Polisi', value: targetRecord.noPolisi, bold: true },
    { label: 'No PO', value: targetRecord.noPo || '-' },
    { label: 'No Surat Jalan', value: targetRecord.noSuratJalan, bold: true }
  ];

  if (
    targetRecord.noKontainer &&
    targetRecord.noKontainer.trim() !== '' &&
    targetRecord.noKontainer.trim() !== '-'
  ) {
    leftMetaRows.push({ label: 'No. Kontainer', value: targetRecord.noKontainer.trim() });
  }
  if (
    targetRecord.noFaktur &&
    targetRecord.noFaktur.trim() !== '' &&
    targetRecord.noFaktur.trim() !== '-'
  ) {
    leftMetaRows.push({ label: 'No. Faktur', value: targetRecord.noFaktur.trim() });
  }
  if (
    targetRecord.noInvoice &&
    targetRecord.noInvoice.trim() !== '' &&
    targetRecord.noInvoice.trim() !== '-'
  ) {
    leftMetaRows.push({ label: 'No. Invoice', value: targetRecord.noInvoice.trim() });
  }

  return leftMetaRows;
}

export const SuratJalanPrintModal: React.FC<SuratJalanPrintModalProps> = ({
  isOpen,
  onClose,
  record,
  records = [],
  palletRecords = []
}) => {
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [printFallbackUrl, setPrintFallbackUrl] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (printFallbackUrl) {
        URL.revokeObjectURL(printFallbackUrl);
      }
    };
  }, [printFallbackUrl]);

  useEffect(() => {
    if (isOpen) {
      setActiveDocIndex(0);
    } else {
      setPrintFallbackUrl(null);
      setPrintNotice(null);
    }
  }, [isOpen]);

  const docsList: SuratJalanRecord[] =
    records && records.length > 0 ? records : record ? [record] : [];

  if (!isOpen || docsList.length === 0) return null;

  const renderSingleRecordToPdf = (doc: jsPDF, targetRecord: SuratJalanRecord) => {
    // True Portrait continuous form 21,5 x 28 cm (215mm x 280mm, height > width agar TIDAK miring/rotasi 90°).
    // Margin kiri/kanan dipersempit ke 2.5mm (lebar konten 210mm, center) agar maksimal ke sisi luar
    // dan tinggi tiap kotak dibesarkan mengisi area atas kertas 14 cm (3mm - 132mm).
    const pageWidth = 215;
    const halfSheetLimitY = 133;
    const marginX = 2.5;
    const marginY = 3.0;
    const contentWidth = pageWidth - marginX * 2; // 210mm
    let currentY = marginY;

    const leftMetaRows = buildLeftMetaRows(targetRecord);
    const pickedRows = buildPickedRowsForRecord(targetRecord, palletRecords);

    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.32);

    // 1. TOP HEADER BLOCK (21.6mm tinggi agar lega dan font lebih besar)
    const rowH = 5.4;
    const headerTotalH = rowH * 4; // 21.6mm
    const col1W = contentWidth * 0.27;
    const col2W = contentWidth * 0.37;
    const col3W = contentWidth * 0.17;
    const leftHalfW = col1W + col2W; // 64%

    doc.rect(marginX, currentY, contentWidth, headerTotalH);
    doc.line(marginX + leftHalfW, currentY, marginX + leftHalfW, currentY + headerTotalH);
    doc.line(marginX + col1W, currentY, marginX + col1W, currentY + rowH * 2);
    doc.line(marginX, currentY + rowH * 2, marginX + contentWidth, currentY + rowH * 2);
    doc.line(marginX + leftHalfW, currentY + rowH, marginX + contentWidth, currentY + rowH);
    doc.line(marginX + leftHalfW, currentY + rowH * 3, marginX + contentWidth, currentY + rowH * 3);
    doc.line(marginX + leftHalfW + col3W, currentY, marginX + leftHalfW + col3W, currentY + headerTotalH);

    // Col 1: PT Santos Jaya Abadi (CENTER)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PT Santos Jaya Abadi', marginX + col1W / 2, currentY + 4.8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Sukodono - Sidoarjo', marginX + col1W / 2, currentY + 8.8, { align: 'center' });

    // Col 2: FORM (CENTER)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('FORM', marginX + col1W + col2W / 2, currentY + 7.6, { align: 'center' });

    // Title Row (spans col1 + col2, rows 3-4)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text('Surat Jalan / Delivery Note', marginX + leftHalfW / 2, currentY + rowH * 3 + 1.5, {
      align: 'center'
    });

    // Right Header 4 boxed rows
    const headerRightRows = [
      { label: 'No. Dokumen', val: `: ${targetRecord.noDokumen || 'F/SCM/01.08'}` },
      { label: 'Rev. No', val: `: ${targetRecord.revNo || '05'}` },
      { label: 'Halaman', val: `: ${targetRecord.halaman || '1/1'}` },
      { label: 'Berlaku Tanggal', val: `: ${targetRecord.berlakuTanggal || '10/10/2026'}` }
    ];
    doc.setFontSize(8);
    headerRightRows.forEach((r, idx) => {
      const yText = currentY + idx * rowH + 3.8;
      doc.setFont('helvetica', 'normal');
      doc.text(r.label, marginX + leftHalfW + 2, yText);
      doc.text(r.val, marginX + leftHalfW + col3W + 2, yText);
    });

    currentY += headerTotalH + 2.2;

    // 2. METADATA SECTION (Left boxed rows, Right Dari & Tujuan centered tanpa alamat)
    const metaRowH = leftMetaRows.length > 5 ? 4.4 : 5.8;
    const metaH = Math.max(leftMetaRows.length * metaRowH, 23.2);
    const actualMetaRowH = metaH / leftMetaRows.length;
    const metaMidX = marginX + contentWidth * 0.48;
    const metaLabelW = contentWidth * 0.19;

    doc.rect(marginX, currentY, contentWidth, metaH);
    doc.line(metaMidX, currentY, metaMidX, currentY + metaH);
    doc.line(marginX + metaLabelW, currentY, marginX + metaLabelW, currentY + metaH);

    leftMetaRows.forEach((row, idx) => {
      if (idx > 0) {
        doc.line(marginX, currentY + idx * actualMetaRowH, metaMidX, currentY + idx * actualMetaRowH);
      }
      const yText = currentY + idx * actualMetaRowH + actualMetaRowH * 0.68;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(row.label, marginX + 2.5, yText);
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      doc.text(`: ${row.value}`, marginX + metaLabelW + 2.5, yText);
    });

    const rightHalfH = metaH / 2;
    const rightHalfMidY = currentY + rightHalfH;
    const rightColW = contentWidth * 0.52;
    const rightCenterX = metaMidX + rightColW / 2;
    const rightTextW = rightColW - 8;
    doc.line(metaMidX, rightHalfMidY, marginX + contentWidth, rightHalfMidY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);

    const dariLines: string[] = doc
      .splitTextToSize(`Dari : ${targetRecord.ruteDariNama}`, rightTextW)
      .slice(0, 2);
    const dariLineH = 4.1;
    const dariStartY =
      currentY + rightHalfH / 2 - ((dariLines.length - 1) * dariLineH) / 2 + 1.3;
    dariLines.forEach((line, i) => {
      doc.text(line, rightCenterX, dariStartY + i * dariLineH, { align: 'center' });
    });

    const tujuanLines: string[] = doc
      .splitTextToSize(`Tujuan : ${targetRecord.ruteTujuanNama}`, rightTextW)
      .slice(0, 2);
    const tujuanStartY =
      rightHalfMidY + rightHalfH / 2 - ((tujuanLines.length - 1) * dariLineH) / 2 + 1.3;
    tujuanLines.forEach((line, i) => {
      doc.text(line, rightCenterX, tujuanStartY + i * dariLineH, { align: 'center' });
    });

    currentY += metaH + 2.2;

    // 3. ITEMS TABLE (Hitung ruang sisa agar kotak bawah selalu maksimal hingga ~131mm)
    const itemCount = targetRecord.itemsSummary.length;
    const effectiveBodyRows = itemCount > 0 ? itemCount : 2;
    const tableHeadH = 8.8;
    const blankRowH = itemCount <= 1 ? 5.2 : 3.6;
    const totalRowH = 6.6;
    const noteH = itemCount > 3 ? 7.2 : 9.0;
    const sigBoxH = itemCount > 3 ? 22.0 : 27.0;
    const distReserve = 8.0; // gap + 2 baris distribusi
    const gapsAfterHead = 2.2 + 2.2 + 3.2; // table->note, note->sig, sig->distribusi

    const fixedRemaining =
      tableHeadH + blankRowH + totalRowH + noteH + sigBoxH + distReserve + gapsAfterHead;
    const maxBodyBudget = Math.max(halfSheetLimitY - 1.5 - currentY - fixedRemaining, 10);
    const idealItemRowH = itemCount === 1 ? 10.0 : itemCount === 0 ? 7.5 : 8.0;
    const itemRowH = Math.max(
      4.8,
      Math.min(idealItemRowH, maxBodyBudget / effectiveBodyRows)
    );

    const tCol1W = contentWidth * 0.25;
    const tCol2W = contentWidth * 0.27;
    const tCol3W = contentWidth * 0.24;
    const tCol4W = contentWidth - tCol1W - tCol2W - tCol3W;

    doc.rect(marginX, currentY, contentWidth, tableHeadH);
    doc.line(marginX + tCol1W, currentY, marginX + tCol1W, currentY + tableHeadH);
    doc.line(marginX + tCol1W + tCol2W, currentY, marginX + tCol1W + tCol2W, currentY + tableHeadH);
    doc.line(
      marginX + tCol1W + tCol2W + tCol3W,
      currentY,
      marginX + tCol1W + tCol2W + tCol3W,
      currentY + tableHeadH
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('NAMA BARANG', marginX + tCol1W / 2, currentY + 5.6, { align: 'center' });
    doc.text('DETAIL BARANG', marginX + tCol1W + tCol2W / 2, currentY + 5.6, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text('JUMLAH\n(KARUNG/PAIL/ZAK/PCS/BOX)', marginX + tCol1W + tCol2W + tCol3W / 2, currentY + 3.6, {
      align: 'center'
    });
    doc.text('JUMLAH\n(KG/LITER/METER)', marginX + tCol1W + tCol2W + tCol3W + tCol4W / 2, currentY + 3.6, {
      align: 'center'
    });

    currentY += tableHeadH;

    // Body rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (itemCount > 0) {
      targetRecord.itemsSummary.forEach((item) => {
        doc.rect(marginX, currentY, contentWidth, itemRowH);
        doc.line(marginX + tCol1W, currentY, marginX + tCol1W, currentY + itemRowH);
        doc.line(marginX + tCol1W + tCol2W, currentY, marginX + tCol1W + tCol2W, currentY + itemRowH);
        doc.line(
          marginX + tCol1W + tCol2W + tCol3W,
          currentY,
          marginX + tCol1W + tCol2W + tCol3W,
          currentY + itemRowH
        );

        const textY = currentY + itemRowH * 0.62;
        const namaClipped = doc.splitTextToSize(item.namaBarang, tCol1W - 4)[0] || '';
        const detailClipped = doc.splitTextToSize(item.detailBarang, tCol2W - 4)[0] || '';
        doc.text(namaClipped, marginX + tCol1W / 2, textY, { align: 'center' });
        doc.text(detailClipped, marginX + tCol1W + tCol2W / 2, textY, { align: 'center' });
        doc.text(String(item.qtyBox), marginX + tCol1W + tCol2W + tCol3W / 2, textY, {
          align: 'center'
        });
        doc.text(
          item.totalKg.toLocaleString('id-ID'),
          marginX + tCol1W + tCol2W + tCol3W + tCol4W / 2,
          textY,
          { align: 'center' }
        );
        currentY += itemRowH;
      });
    } else {
      for (let b = 0; b < 2; b++) {
        doc.rect(marginX, currentY, contentWidth, itemRowH);
        doc.line(marginX + tCol1W, currentY, marginX + tCol1W, currentY + itemRowH);
        doc.line(marginX + tCol1W + tCol2W, currentY, marginX + tCol1W + tCol2W, currentY + itemRowH);
        doc.line(
          marginX + tCol1W + tCol2W + tCol3W,
          currentY,
          marginX + tCol1W + tCol2W + tCol3W,
          currentY + itemRowH
        );
        currentY += itemRowH;
      }
    }

    // Spacer blank row
    doc.rect(marginX, currentY, contentWidth, blankRowH);
    doc.line(marginX + tCol1W, currentY, marginX + tCol1W, currentY + blankRowH);
    doc.line(marginX + tCol1W + tCol2W, currentY, marginX + tCol1W + tCol2W, currentY + blankRowH);
    doc.line(
      marginX + tCol1W + tCol2W + tCol3W,
      currentY,
      marginX + tCol1W + tCol2W + tCol3W,
      currentY + blankRowH
    );
    currentY += blankRowH;

    // Grand Total row
    doc.rect(marginX, currentY, contentWidth, totalRowH);
    doc.line(marginX + tCol1W + tCol2W, currentY, marginX + tCol1W + tCol2W, currentY + totalRowH);
    doc.line(
      marginX + tCol1W + tCol2W + tCol3W,
      currentY,
      marginX + tCol1W + tCol2W + tCol3W,
      currentY + totalRowH
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Grand Total', marginX + (tCol1W + tCol2W) / 2, currentY + totalRowH * 0.68, {
      align: 'center'
    });
    if (itemCount > 0) {
      doc.text(
        String(targetRecord.grandTotalBox),
        marginX + tCol1W + tCol2W + tCol3W / 2,
        currentY + totalRowH * 0.68,
        { align: 'center' }
      );
      doc.text(
        targetRecord.grandTotalKg.toLocaleString('id-ID'),
        marginX + tCol1W + tCol2W + tCol3W + tCol4W / 2,
        currentY + totalRowH * 0.68,
        { align: 'center' }
      );
    }

    currentY += totalRowH + 2.2;

    // 4. NOTE BOX (Lebih tinggi agar leluasa)
    doc.rect(marginX, currentY, contentWidth, noteH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('Note :', marginX + 2.5, currentY + noteH * 0.64);
    if (targetRecord.note && targetRecord.note !== '-') {
      doc.setFont('helvetica', 'normal');
      doc.text(targetRecord.note, marginX + 14, currentY + noteH * 0.64);
    }

    currentY += noteH + 2.2;

    // 5. SIGNATURE BOXES (Lebih lebar & tinggi agar tanda tangan dan stempel leluasa)
    const sigColW = contentWidth / 4;
    const sigRoles = ['PENERIMA', 'TRANSPORTER', 'WAREHOUSE ADMIN', 'WAREHOUSE SPV.'];
    const innerPad = 2.5;
    const innerBoxTop = 5.4;
    const hasVendor =
      Boolean(targetRecord.namaVendorArmada) && targetRecord.namaVendorArmada.trim() !== '-';
    const innerBoxH = hasVendor ? sigBoxH - 13.4 : sigBoxH - 11.4; // untuk 27mm -> 13.6mm / 15.6mm

    for (let i = 0; i < 4; i++) {
      const x = marginX + i * sigColW;
      doc.rect(x, currentY, sigColW, sigBoxH);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(sigRoles[i], x + sigColW / 2, currentY + 4.0, { align: 'center' });

      doc.rect(x + innerPad, currentY + innerBoxTop, sigColW - innerPad * 2, innerBoxH);

      doc.setFontSize(8);
      const namaY = hasVendor ? currentY + sigBoxH - 4.9 : currentY + sigBoxH - 2.0;
      doc.text('Nama : ............................', x + innerPad, namaY);

      if (i === 1 && hasVendor) {
        const vendorText = targetRecord.namaVendorArmada.trim();
        const fullLabel = `Vendor : ${vendorText}`;
        const maxVendorW = sigColW - innerPad * 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        if (doc.getTextWidth(fullLabel) > maxVendorW) {
          doc.setFontSize(6.0);
        }
        const clippedVendor = doc.splitTextToSize(fullLabel, maxVendorW)[0] || fullLabel;
        doc.text(clippedVendor, x + innerPad, currentY + sigBoxH - 1.5);
        doc.setFont('helvetica', 'normal');
      }
    }

    currentY += sigBoxH + 3.2;

    // 6. DISTRIBUSI LEGEND (Rapi penuh selebar kertas)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.text('Distribusi :', marginX, currentY);
    currentY += 3.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const distItems = [
      'Putih : DAFT PT.SJA',
      'Merah : Customer',
      'Kuning : Security PT. SJA',
      'Hijau : Warehouse PT. SJA',
      'Biru : Transporter / Other'
    ];
    const distSlotW = contentWidth / 5;
    distItems.forEach((txt, idx) => {
      if (idx === distItems.length - 1) {
        doc.text(txt, marginX + contentWidth, currentY, { align: 'right' });
      } else {
        doc.text(txt, marginX + idx * distSlotW, currentY);
      }
    });

    // 7. LANJUTAN LANGSUNG DI HALAMAN YANG SAMA: LIST ITEM / PALLET YANG DIAMBIL (1-2 spasi di bawah Distribusi)
    if (pickedRows.length > 0) {
      const fullPageLimitY = 272;
      currentY += 6; // 1-2 spasi di bawah Distribusi

      if (currentY + 18 > fullPageLimitY) {
        doc.addPage([215, 280], 'portrait');
        currentY = marginY;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(
        `LIST ITEM / PALLET YANG DIAMBIL (${pickedRows.length} Pallet) - No. SJ: ${targetRecord.noSuratJalan} | Vendor: ${targetRecord.namaVendorArmada || '-'}`,
        marginX,
        currentY + 2
      );
      currentY += 4.5;

      // Sum = 210mm
      const pWidths = [8, 24, 26, 50, 15, 26, 28, 16, 17];
      const pHeaders = ['No', 'No. Pallet', 'Kode Item', 'Nama Barang', 'Bin', 'No. Batch', 'Range Box', 'Qty', 'Kg'];

      const drawPickedHeader = (yPos: number) => {
        doc.rect(marginX, yPos, contentWidth, 5.5);
        let curX = marginX;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        pWidths.forEach((w, idx) => {
          if (idx > 0) doc.line(curX, yPos, curX, yPos + 5.5);
          doc.text(pHeaders[idx], curX + w / 2, yPos + 3.8, { align: 'center' });
          curX += w;
        });
      };

      drawPickedHeader(currentY);
      currentY += 5.5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      pickedRows.forEach((row, idx) => {
        const lineCount = row.batchEntries.length > 1 ? row.batchEntries.length : 1;
        const rH = lineCount > 1 ? Math.max(5.2, lineCount * 3.6 + 1.6) : 5.2;
        if (currentY + rH > fullPageLimitY) {
          doc.addPage([215, 280], 'portrait');
          currentY = marginY;
          drawPickedHeader(currentY);
          currentY += 5.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.8);
        }

        doc.rect(marginX, currentY, contentWidth, rH);
        let curX = marginX;
        const cells = [
          String(idx + 1),
          row.noPallet,
          row.kodeItem,
          row.namaBarang,
          row.lokasiBin,
          row.noBatch,
          row.rangeBox,
          String(row.qtyBox),
          row.beratKg.toLocaleString('id-ID')
        ];
        pWidths.forEach((w, cIdx) => {
          if (cIdx > 0) doc.line(curX, currentY, curX, currentY + rH);
          const align = cIdx === 2 || cIdx === 3 ? 'left' : 'center';
          const textX = align === 'left' ? curX + 1.5 : curX + w / 2;

          if (lineCount > 1 && cIdx === 5) {
            row.batchEntries.forEach((b, bIdx) => {
              const bText = doc.splitTextToSize(b.noBatch || '-', w - 2.5)[0] || '';
              doc.text(bText, textX, currentY + 3.4 + bIdx * 3.6, { align });
            });
          } else if (lineCount > 1 && cIdx === 6) {
            row.batchEntries.forEach((b, bIdx) => {
              const s = (b.boxAwal || '').trim();
              const e = (b.boxAkhir || '').trim();
              const rStr = s && e ? `${s} - ${e}` : s || e || '-';
              const rText = doc.splitTextToSize(rStr, w - 2.5)[0] || '';
              doc.text(rText, textX, currentY + 3.4 + bIdx * 3.6, { align });
            });
          } else {
            const clipped = doc.splitTextToSize(cells[cIdx], w - 2.5)[0] || '';
            doc.text(clipped, textX, currentY + 3.6, { align });
          }
          curX += w;
        });
        currentY += rH;
      });
    }
  };

  const buildSuratJalanPdfDoc = (enableAutoPrint = false): jsPDF => {
    // True Portrait 21,5 x 28 cm (height > width) agar printer & PDF viewer selalu mencetak tegak lurus
    // tanpa merotasi halaman menjadi miring 90 derajat, dengan layout muat di setengah halaman atas (21,5 x 14 cm).
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [215, 280]
    });

    if (enableAutoPrint) {
      doc.autoPrint();
    }

    docsList.forEach((sjRec, idx) => {
      if (idx > 0) {
        doc.addPage([215, 280], 'portrait');
      }
      renderSingleRecordToPdf(doc, sjRec);
    });

    return doc;
  };

  const triggerBlobOpenInNewTab = (blobUrl: string) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdf = () => {
    try {
      const doc = buildSuratJalanPdfDoc(false);
      const firstNo = docsList[0]?.noSuratJalan || 'Dokumen';
      const safeFilename =
        docsList.length > 1
          ? `Surat_Jalan_${docsList.length}_Dokumen_${firstNo.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`
          : `Surat_Jalan_${firstNo.replace(/[/\\?%*:|"<>]/g, '_')}.pdf`;
      doc.save(safeFilename);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setPrintNotice('Gagal membuat file PDF Surat Jalan. Silakan coba lagi.');
    }
  };

  const handlePrint = () => {
    let printDialogOpened = false;
    const onBeforePrint = () => {
      printDialogOpened = true;
    };
    window.addEventListener('beforeprint', onBeforePrint);
    try {
      window.print();
    } catch {
      printDialogOpened = false;
    } finally {
      window.removeEventListener('beforeprint', onBeforePrint);
    }

    if (!printDialogOpened) {
      try {
        const doc = buildSuratJalanPdfDoc(true);
        const pdfBlob = doc.output('blob');
        if (printFallbackUrl) {
          URL.revokeObjectURL(printFallbackUrl);
        }
        const blobUrl = URL.createObjectURL(pdfBlob);
        setPrintFallbackUrl(blobUrl);
        setPrintNotice(
          docsList.length > 1
            ? `Browser preview membatasi cetak langsung. ${docsList.length} Surat Jalan terpisah telah disiapkan dalam PDF siap cetak.`
            : 'Browser preview membatasi cetak langsung. Dokumen PDF siap cetak telah disiapkan — silakan buka di tab baru atau unduh untuk langsung dicetak ke printer.'
        );
        triggerBlobOpenInNewTab(blobUrl);
      } catch (err) {
        console.error('Gagal menyiapkan dokumen cetak:', err);
        setPrintNotice('Gagal membuka dialog printer. Gunakan tombol Unduh PDF lalu cetak dari PDF viewer.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-3 overflow-y-auto print:static print:bg-white print:p-0 print:overflow-visible">
      {/* Print & Dot-Matrix CSS (True Portrait 21.5 x 27.9 cm, margin luar minimal agar lebar dan tinggi area atas 21.5 x 14 cm maksimal) */}
      <style>{`
        @media print {
          @page {
            size: 215mm 279mm portrait;
            margin: 2.5mm 2mm;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          body * {
            visibility: hidden !important;
          }
          #surat-jalan-printable-area,
          #surat-jalan-printable-area * {
            visibility: visible !important;
            font-family: Arial, Helvetica, sans-serif !important;
            color: #000000 !important;
            border-color: #000000 !important;
            background-color: #ffffff !important;
          }
          #surat-jalan-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .sj-print-sheet {
            display: block !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
          }
          .sj-print-page-break {
            page-break-after: always !important;
            break-after: page !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl max-w-[98vw] xl:max-w-[1260px] w-full border border-slate-300 dark:border-slate-800 shadow-2xl p-3 sm:p-4 my-auto flex flex-col max-h-[97vh] print:max-h-none print:border-none print:shadow-none print:p-0 print:bg-white">
        {/* Modal Toolbar (hidden on print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-lg">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Dokumen Resmi: Surat Jalan / Delivery Note
                {docsList.length > 1 ? ` (${docsList.length} Dokumen)` : ''}
              </h3>
              <p className="text-[11px] text-slate-500">
                Format standar FORM F/SCM/01.08 &bull; <strong>Portrait 21,5 x 28 cm</strong> (Area Cetak Tegak Atas <strong>21,5 x 14 cm</strong>)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Cetak ke Printer</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 ml-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multi-SJ preview switcher */}
        {docsList.length > 1 && (
          <div className="no-print mb-2.5 flex flex-wrap items-center gap-1.5 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs shrink-0">
            <span className="font-bold text-slate-600 dark:text-slate-300 mr-1">
              Pratinjau Dokumen:
            </span>
            {docsList.map((sj, idx) => (
              <button
                key={sj.id}
                type="button"
                onClick={() => setActiveDocIndex(idx)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  activeDocIndex === idx
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-blue-50'
                }`}
              >
                SJ #{idx + 1}: {sj.noSuratJalan} ({sj.noPolisi})
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-500">
              Saat dicetak / diunduh PDF, semua {docsList.length} Surat Jalan keluar terpisah halaman per dokumen
            </span>
          </div>
        )}

        {/* Fallback print notice bar if iframe blocks window.print() */}
        {printNotice && (
          <div className="no-print mb-2.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{printNotice}</span>
            </div>
            <div className="flex items-center gap-2">
              {printFallbackUrl && (
                <a
                  href={printFallbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka &amp; Cetak di Tab Baru</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 font-semibold hover:bg-amber-100/70 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Printable Document Container */}
        <div className="flex-1 overflow-y-auto bg-slate-200 dark:bg-slate-950 p-2 sm:p-3 rounded-xl flex justify-center items-start print:overflow-visible print:bg-white print:p-0">
          <div id="surat-jalan-printable-area" className="w-full max-w-[1240px] print:max-w-none">
            {docsList.map((targetRecord, docIdx) => {
              const leftMetaRows = buildLeftMetaRows(targetRecord);
              const pickedRows = buildPickedRowsForRecord(targetRecord, palletRecords);
              const isVisibleInPreview = docIdx === activeDocIndex;
              const isLastDoc = docIdx === docsList.length - 1;

              return (
                <div
                  key={targetRecord.id}
                  className={`sj-print-sheet bg-white text-black w-full px-4 py-3 print:px-0 print:py-0 border border-black shadow-md overflow-visible ${
                    isVisibleInPreview ? 'block' : 'hidden print:block'
                  } ${!isLastDoc ? 'sj-print-page-break' : ''}`}
                  style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                >
                  {/* 1. HEADER BOX */}
                  <table className="w-full border-collapse border border-black text-[12px] print:text-[10.5px] leading-tight">
                    <colgroup>
                      <col style={{ width: '27%' }} />
                      <col style={{ width: '37%' }} />
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '19%' }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td
                          rowSpan={2}
                          className="border border-black px-2 py-2 print:py-1 text-center align-middle"
                        >
                          <div className="font-bold text-[15px] print:text-[13px] text-black leading-snug">
                            PT Santos Jaya Abadi
                          </div>
                          <div className="text-[12px] print:text-[10px] text-black leading-snug">
                            Sukodono - Sidoarjo
                          </div>
                        </td>
                        <td
                          rowSpan={2}
                          className="border border-black px-2 py-2 print:py-1 text-center align-middle font-bold text-[24px] print:text-[21px] tracking-wider text-black"
                        >
                          FORM
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          No. Dokumen
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          : {targetRecord.noDokumen || 'F/SCM/01.08'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          Rev. No
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          : {targetRecord.revNo || '05'}
                        </td>
                      </tr>
                      <tr>
                        <td
                          colSpan={2}
                          rowSpan={2}
                          className="border border-black px-2 py-2 print:py-1 text-center align-middle font-bold text-[19px] print:text-[16px] text-black"
                        >
                          Surat Jalan / Delivery Note
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          Halaman
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          : {targetRecord.halaman || '1/1'}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          Berlaku Tanggal
                        </td>
                        <td className="border border-black px-2 py-1 print:py-0.5 text-[11px] print:text-[9.5px] text-black whitespace-nowrap">
                          : {targetRecord.berlakuTanggal || '10/10/2026'}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 2. METADATA SECTION */}
                  <div className="mt-2 print:mt-1.5 grid grid-cols-12 border border-black text-[11.5px] print:text-[10px] leading-snug">
                    <div className="col-span-6 border-r border-black flex flex-col divide-y divide-black">
                      {leftMetaRows.map((row) => (
                        <div key={row.label} className="grid grid-cols-12 flex-1">
                          <div className="col-span-5 px-2.5 py-1.5 print:py-1 border-r border-black flex items-center text-black">
                            {row.label}
                          </div>
                          <div
                            className={`col-span-7 px-2.5 py-1.5 print:py-1 flex items-center text-black ${
                              row.bold ? 'font-bold' : ''
                            }`}
                          >
                            : {row.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="col-span-6 grid grid-rows-2 divide-y divide-black">
                      <div className="px-3 py-2.5 print:py-1.5 flex items-center justify-center text-center">
                        <div className="font-bold text-[13.5px] print:text-[11.5px] text-black leading-snug">
                          Dari : {targetRecord.ruteDariNama}
                        </div>
                      </div>

                      <div className="px-3 py-2.5 print:py-1.5 flex items-center justify-center text-center">
                        <div className="font-bold text-[13.5px] print:text-[11.5px] text-black leading-snug">
                          Tujuan : {targetRecord.ruteTujuanNama}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. ITEMS TABLE */}
                  <table className="mt-2 print:mt-1.5 w-full border-collapse border border-black text-[11.5px] print:text-[10.5px] leading-tight">
                    <colgroup>
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '27%' }} />
                      <col style={{ width: '24%' }} />
                      <col style={{ width: '24%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="border border-black px-2 py-2 print:py-1.5 text-center font-normal text-black">
                          NAMA BARANG
                        </th>
                        <th className="border border-black px-2 py-2 print:py-1.5 text-center font-normal text-black">
                          DETAIL BARANG
                        </th>
                        <th className="border border-black px-2 py-1.5 print:py-1 text-center font-normal text-black">
                          JUMLAH
                          <br />
                          <span className="text-[10px] print:text-[9px]">(KARUNG/PAIL/ZAK/PCS/BOX)</span>
                        </th>
                        <th className="border border-black px-2 py-1.5 print:py-1 text-center font-normal text-black">
                          JUMLAH
                          <br />
                          <span className="text-[10px] print:text-[9px]">(KG/LITER/METER)</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetRecord.itemsSummary.length > 0 ? (
                        targetRecord.itemsSummary.map((item, idx) => (
                          <tr key={idx}>
                            <td className="border border-black px-2 py-2 print:py-2 text-center text-black">
                              {item.namaBarang}
                            </td>
                            <td className="border border-black px-2 py-2 print:py-2 text-center text-black">
                              {item.detailBarang}
                            </td>
                            <td className="border border-black px-2 py-2 print:py-2 text-center text-black">
                              {item.qtyBox}
                            </td>
                            <td className="border border-black px-2 py-2 print:py-2 text-center text-black">
                              {item.totalKg.toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <>
                          <tr className="h-8 print:h-6">
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                          </tr>
                          <tr className="h-8 print:h-6">
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                            <td className="border border-black"></td>
                          </tr>
                        </>
                      )}

                      {/* Spacer blank row */}
                      <tr className="h-5 print:h-4">
                        <td className="border border-black"></td>
                        <td className="border border-black"></td>
                        <td className="border border-black"></td>
                        <td className="border border-black"></td>
                      </tr>

                      {/* Grand Total */}
                      <tr>
                        <td colSpan={2} className="border border-black px-2 py-1.5 print:py-1.5 text-center text-black">
                          Grand Total
                        </td>
                        <td className="border border-black px-2 py-1.5 print:py-1.5 text-center text-black">
                          {targetRecord.itemsSummary.length > 0 ? targetRecord.grandTotalBox : ''}
                        </td>
                        <td className="border border-black px-2 py-1.5 print:py-1.5 text-center text-black">
                          {targetRecord.itemsSummary.length > 0
                            ? targetRecord.grandTotalKg.toLocaleString('id-ID')
                            : ''}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 4. NOTE BOX */}
                  <div className="mt-2 print:mt-1.5 border border-black px-2.5 py-2 print:py-1.5 min-h-[34px] print:min-h-[28px] text-[11.5px] print:text-[10.5px] text-black flex items-center">
                    <span>
                      <span className="font-bold">Note : </span>
                      <span>{targetRecord.note && targetRecord.note !== '-' ? targetRecord.note : ''}</span>
                    </span>
                  </div>

                  {/* 5. SIGNATURES SECTION */}
                  <div className="mt-2 print:mt-1.5 grid grid-cols-4 border border-black divide-x divide-black text-center text-[11px] print:text-[9.5px]">
                    {['PENERIMA', 'TRANSPORTER', 'WAREHOUSE ADMIN', 'WAREHOUSE SPV.'].map((role) => (
                      <div key={role} className="px-2.5 py-2 print:py-1 flex flex-col justify-between">
                        <div>
                          <div className="text-[11px] print:text-[9.5px] text-black pb-1.5 print:pb-1">{role}</div>
                          <div className="border border-black h-14 print:h-11 w-full mx-auto bg-white"></div>
                        </div>
                        <div className="text-[11px] print:text-[9.5px] text-left pt-1.5 print:pt-1 text-black leading-tight">
                          <div>Nama : ..........................</div>
                          {role === 'TRANSPORTER' &&
                            targetRecord.namaVendorArmada &&
                            targetRecord.namaVendorArmada.trim() !== '-' && (
                              <div
                                className="text-[9.5px] print:text-[8px] font-bold text-black mt-0.5 truncate"
                                title={targetRecord.namaVendorArmada}
                              >
                                Vendor : {targetRecord.namaVendorArmada}
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 6. DISTRIBUTION LEGEND */}
                  <div className="mt-2.5 print:mt-2 pt-0.5 text-[11px] print:text-[9px] text-black leading-snug">
                    <div className="font-bold text-black">Distribusi :</div>
                    <div className="flex items-center justify-between gap-2 mt-0.5 text-black">
                      <span>Putih : DAFT PT.SJA</span>
                      <span>Merah : Customer</span>
                      <span>Kuning : Security PT. SJA</span>
                      <span>Hijau : Warehouse PT. SJA</span>
                      <span>Biru : Transporter / Other</span>
                    </div>
                  </div>

                  {/* 7. SAME-PAGE CONTINUATION: LIST ITEM / PALLET YANG DIAMBIL (1-2 SPASI DI BAWAH) */}
                  {pickedRows.length > 0 && (
                    <div className="mt-4 print:mt-3">
                      <div className="border border-black p-2 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-black text-[10.5px] text-black">
                          <span className="font-bold uppercase">
                            List Item / Pallet yang Diambil ({pickedRows.length} Pallet)
                          </span>
                          <span>
                            No. SJ: <strong>{targetRecord.noSuratJalan}</strong> &bull; Vendor:{' '}
                            <strong>{targetRecord.namaVendorArmada || '-'}</strong> &bull; Driver:{' '}
                            {targetRecord.namaDriver || '-'} ({targetRecord.noHpDriver || '-'})
                          </span>
                        </div>

                        <table className="w-full border-collapse border border-black text-[10.5px] leading-tight">
                          <thead>
                            <tr>
                              <th className="border border-black px-1.5 py-1 text-center font-bold w-8">
                                No
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                No. Pallet
                              </th>
                              <th className="border border-black px-2 py-1 text-left font-bold">
                                Kode Item
                              </th>
                              <th className="border border-black px-2 py-1 text-left font-bold">
                                Nama Barang
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                Lokasi Bin
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                No. Batch
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                Range Box
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                Qty (Box)
                              </th>
                              <th className="border border-black px-2 py-1 text-center font-bold">
                                Berat (Kg)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {pickedRows.map((row, idx) => (
                              <tr key={`${row.noPallet}-${row.kodeItem}-${idx}`}>
                                <td className="border border-black px-1.5 py-1 text-center">
                                  {idx + 1}
                                </td>
                                <td className="border border-black px-2 py-1 text-center font-bold">
                                  {row.noPallet}
                                </td>
                                <td className="border border-black px-2 py-1 text-left">
                                  {row.kodeItem}
                                </td>
                                <td className="border border-black px-2 py-1 text-left">
                                  {row.namaBarang}
                                </td>
                                <td className="border border-black px-2 py-1 text-center">
                                  {row.lokasiBin}
                                </td>
                                <td className="border border-black px-2 py-1 text-center">
                                  {row.batchEntries.length > 1 ? (
                                    <div className="space-y-0.5">
                                      {row.batchEntries.map((b, bIdx) => (
                                        <div key={bIdx}>{b.noBatch || '-'}</div>
                                      ))}
                                    </div>
                                  ) : (
                                    row.noBatch
                                  )}
                                </td>
                                <td className="border border-black px-2 py-1 text-center">
                                  {row.batchEntries.length > 1 ? (
                                    <div className="space-y-0.5">
                                      {row.batchEntries.map((b, bIdx) => {
                                        const s = (b.boxAwal || '').trim();
                                        const e = (b.boxAkhir || '').trim();
                                        return (
                                          <div key={bIdx}>
                                            {s && e ? `${s} - ${e}` : s || e || '-'}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    row.rangeBox
                                  )}
                                </td>
                                <td className="border border-black px-2 py-1 text-center font-bold">
                                  {row.qtyBox}
                                </td>
                                <td className="border border-black px-2 py-1 text-center">
                                  {row.beratKg.toLocaleString('id-ID')}
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
        </div>

        {/* Modal footer buttons */}
        <div className="no-print pt-2.5 mt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>
              Siap cetak Portrait (Orientasi: Portrait, Skala: 100%) di bagian atas kertas 21,5 x 14 cm agar tidak miring.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
          >
            Tutup Preview
          </button>
        </div>
      </div>
    </div>
  );
};
