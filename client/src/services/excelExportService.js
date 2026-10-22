import * as XLSX from 'xlsx';
import { CalculationService } from './calculationService';

/**
 * Helper: Format date to DD-MM-YYYY
 */
const formatDate = (dateVal) => {
  if (!dateVal) return '-';
  try {
    const clean = String(dateVal).split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  } catch {
    return String(dateVal);
  }
};

/**
 * Format Current Timestamp (DD-MM-YYYY HH:mm)
 */
const formatTimestamp = () => {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${d}-${m}-${y} ${h}:${min}`;
};

/**
 * Format duration in minutes to string (e.g. 2 ชม. 30 นาที)
 */
const formatDurationHoursMinutes = (totalMins) => {
  if (!totalMins || totalMins <= 0) return '-';
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม.`;
  return `${m} นาที`;
};

export const ExcelExportService = {
  /* ========================================================================= */
  /* 🔵 [SLIT] EXCEL KPI EXPORT (รายงานสรุป KPI ฝ่ายผลิต SLIT)                  */
  /* ========================================================================= */
  /**
   * ส่งออกรายงานสรุป KPI ฝ่ายผลิต SLIT เป็นไฟล์ Excel (.xlsx)
   */
  exportSlitKpiExcel(jobs = [], { startDate = '', endDate = '', keyword = '', sytelineSpecs = {} } = {}) {
    if (!jobs || jobs.length === 0) {
      throw new Error('ไม่พบข้อมูลสำหรับการส่งออก Excel');
    }

    if (startDate && endDate && startDate > endDate) {
      throw new Error('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
    }

    // กรองช่วงวันที่เพิ่มเติมเพื่อความถูกต้องและปลอดภัย (Defensive Date Filtering)
    let exportJobs = jobs;
    if (startDate || endDate) {
      exportJobs = jobs.filter((job) => {
        const jDate = CalculationService.safeExtractDate(job?.productionDate || job?.date || job?.createdAt || job?.lotNumber);
        if (startDate && jDate && jDate < startDate) return false;
        if (endDate && jDate && jDate > endDate) return false;
        return true;
      });
    }

    if (exportJobs.length === 0) {
      throw new Error('ไม่พบข้อมูลในช่วงวันที่ที่ระบุสำหรับการส่งออก Excel');
    }

    const todayStr = CalculationService.getCurrentDateString();
    let dateRangeText = 'ทั้งหมด';
    if (startDate && endDate) {
      dateRangeText = startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} ถึง ${formatDate(endDate)}`;
    } else if (startDate) {
      dateRangeText = `ตั้งแต่ ${formatDate(startDate)}`;
    } else if (endDate) {
      dateRangeText = `ถึง ${formatDate(endDate)}`;
    }

    // ── 1. คำนวณสรุป KPI รวม ──
    const totalJobs = exportJobs.length;
    let totalProducedQty = 0;
    let totalRollUsed = 0;
    let totalNg = 0;
    let totalStdWidth = 0;
    let totalActualUsed = 0;
    let totalLossOverStd = 0;
    let totalLossProduct = 0;
    let sumYield = 0;

    const dataRows = [];

    exportJobs.forEach((job, idx) => {
      const jDate = CalculationService.safeExtractDate(job?.productionDate || job?.date || job?.createdAt || job?.lotNumber) || '-';
      const cleanJobNo = (job.jobNo || job.rawJobNo || job.job || '-').trim();
      const rawJ = cleanJobNo.includes('#') ? cleanJobNo.split('#')[0] : cleanJobNo;
      const mainJ = rawJ.includes(',') ? rawJ.split(',')[0].trim() : rawJ;
      const spec = sytelineSpecs[mainJ] || {};

      const partNo = (job.partNo || job.itemMst || job.finishedItem || spec.finishedItem || '-').trim();
      const materialNo = (job.materialNo || job.MaterialNo || job.materialItem || spec.materialNo || '-').trim();
      const foamName = (spec.materialType || job.materialType || job.foamName || '-').trim();
      const color = (spec.colorName || job.colorName || job.color || '-').trim();
      const rawLot = (job.embossLot || job.lotNumber || job.lotNo || '-').trim();
      const lotDetails = CalculationService.extractEmbossDetails(rawLot);
      const lotNumber = lotDetails.lotDate || CalculationService.formatToYYYYMMDD(rawLot.replace(/\(.*?\)/g, ''), jDate) || rawLot;

      const rollVal = (job.embossRoll !== undefined && job.embossRoll !== null && String(job.embossRoll).trim() !== '')
        ? String(job.embossRoll).trim()
        : ((job.EmbossRoll !== undefined && job.EmbossRoll !== null && String(job.EmbossRoll).trim() !== '') ? String(job.EmbossRoll).trim() : (lotDetails.rollNo || ''));
      const totalRollVal = (job.embossTotalRoll !== undefined && job.embossTotalRoll !== null && String(job.embossTotalRoll).trim() !== '')
        ? String(job.embossTotalRoll).trim()
        : ((job.EmbossTotalRoll !== undefined && job.EmbossTotalRoll !== null && String(job.EmbossTotalRoll).trim() !== '') ? String(job.EmbossTotalRoll).trim() : (lotDetails.totalRolls || ''));
      const rollLot = rollVal && totalRollVal ? `${rollVal}/${totalRollVal}` : (rollVal || '-');

      const actualWidth = parseFloat(job.actualFoamWidth) || 0;
      const stdThick = parseFloat(job.stdThick) || 0;
      const stdWidth = parseFloat(job.stdWidth) || 0;
      const stdLength = parseFloat(job.stdLength) || 0;

      const firstShotThick = parseFloat(job.firstSheetThick || job.stdThick) || 0;
      const firstShotWidth = parseFloat(job.firstSheetWidth || job.firstShotWidth || job.firstSheetWidth1) || 0;

      const producedQty = Number(
        job.totalProductedQty ||
        job.productedQty ||
        (job.firstSheetEntries && job.firstSheetEntries.length > 0
          ? job.firstSheetEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0)
          : (Number(job.productedQty1 || 0) + Number(job.productedQty2 || 0)))
      ) || 0;

      const rollUsed = Number(job.rollUsed) || 1;
      const remainThick = parseFloat(job.remainThick || job.stdThick) || 0;
      const remainWidth = parseFloat(job.remainWidth) || 0;
      const remainLength = parseFloat(job.remainLength || job.stdLength) || 0;

      const ng = Number(job.ng) || 0;
      const lossOverStd = parseFloat(job.lossOverStd) || 0;
      const lossProduct = parseFloat(job.lossProduct) || 0;
      const actualUsed = parseFloat(job.actualUsedQty) || 0;
      const yieldPct = parseFloat(job.yield) || 0;
      const operator = (job.operatorName || job.employeeName || '-').trim();

      totalProducedQty += producedQty;
      totalRollUsed += rollUsed;
      totalNg += ng;
      totalStdWidth += stdWidth;
      totalActualUsed += actualUsed;
      totalLossOverStd += lossOverStd;
      totalLossProduct += lossProduct;
      sumYield += yieldPct;

      dataRows.push([
        idx + 1,
        formatDate(jDate),
        cleanJobNo,
        partNo,
        materialNo,
        foamName,
        color,
        lotNumber,
        rollLot,
        actualWidth || '-',
        stdThick || '-',
        stdWidth || '-',
        stdLength || '-',
        firstShotThick || '-',
        firstShotWidth || '-',
        producedQty,
        rollUsed,
        remainThick || '-',
        remainWidth || '-',
        remainLength || '-',
        ng,
        lossOverStd,
        lossProduct,
        actualUsed,
        `${yieldPct.toFixed(2)}%`,
        operator
      ]);
    });

    const avgYield = totalStdWidth > 0
      ? Number(((totalActualUsed / totalStdWidth) * 100).toFixed(2))
      : (totalJobs > 0 ? Number((sumYield / totalJobs).toFixed(2)) : 0);

    // ── 2. ประกอบ Header และส่วนสรุป KPI ──
    const rows = [
      ['รายงานสรุป KPI การผลิต SLIT (LIGHT COVER PRODUCTION)'],
      ['บริษัท อิโนแอค อินดัสตรี้ส์ (ประเทศไทย) จำกัด (แผนก PIPE LINE)'],
      [],
      ['เงื่อนไขการค้นหา:', dateRangeText, '', 'คำค้นหา:', keyword || 'ทั้งหมด', '', 'วันที่ส่งออกไฟล์:', formatTimestamp()],
      [],
      [' สรุป KPI รวม:', '', '', '', '', '', '', ''],
      ['จำนวน Job ทั้งหมด (Jobs)', totalJobs, '', 'ผลิตได้รวม (ม้วน Slit)', totalProducedQty, '', 'ของเสีย NG รวม (m.)', totalNg],
      ['รวมกว้าง STD (mm.)', totalStdWidth, '', 'รวมใช้จริง (mm.)', totalActualUsed, '', '% Yield รวมเฉลี่ย', `${avgYield.toFixed(2)}%`],
      ['Loss เกิน STD รวม (mm.)', Number(totalLossOverStd.toFixed(1)), '', 'Loss ฝ่ายผลิตรวม (mm.)', Number(totalLossProduct.toFixed(1)), '', 'จำนวนม้วนโฟมที่ใช้ (Roll)', totalRollUsed],
      [],
      // ── ตารางหัวคอลัมน์ ──
      [
        'ลำดับ',
        'วันที่ผลิต',
        'เลขที่ Job',
        'หมายเลขชิ้นส่วน (Part No.)',
        'หมายเลขวัตถุดิบ (Material No.)',
        'ชื่อโฟม (Foam Name)',
        'สี (Color)',
        'Lot Number Mat\'l',
        'ม้วน Lot (Roll)',
        'ความกว้างจริง (mm.)',
        'หนา STD (mm.)',
        'กว้าง STD (mm.)',
        'ยาว STD (m.)',
        'First Shot หนา (mm.)',
        'First Shot กว้าง (mm.)',
        'ผลิตได้ (ม้วน Slit)',
        'จำนวนโฟม (ROLL)',
        'เหลือ หนา (mm.)',
        'เหลือ กว้าง (mm.)',
        'เหลือ ยาว (m.)',
        'NG (m.)',
        'Loss เกิน STD (mm.)',
        'Loss ฝ่ายผลิต (mm.)',
        'ใช้จริง (mm.)',
        '% Yield',
        'ผู้ปฏิบัติงาน'
      ],
      ...dataRows,
      // ── แถวผลรวมท้ายตาราง ──
      [
        'รวมทั้งหมด (TOTAL)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        totalStdWidth,
        '',
        '',
        '',
        totalProducedQty,
        totalRollUsed,
        '',
        '',
        '',
        totalNg,
        Number(totalLossOverStd.toFixed(1)),
        Number(totalLossProduct.toFixed(1)),
        totalActualUsed,
        `${avgYield.toFixed(2)}%`,
        ''
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // กำหนดความกว้างคอลัมน์ (Column Widths) ให้อ่านง่าย
    ws['!cols'] = [
      { wch: 8 },  // ลำดับ
      { wch: 14 }, // วันที่ผลิต
      { wch: 16 }, // Job No
      { wch: 22 }, // Part No
      { wch: 18 }, // Material No
      { wch: 14 }, // ชื่อโฟม
      { wch: 10 }, // สี
      { wch: 16 }, // Lot No
      { wch: 14 }, // ม้วน Lot (Roll)
      { wch: 14 }, // ความกว้างจริง
      { wch: 12 }, // หนา STD
      { wch: 12 }, // กว้าง STD
      { wch: 12 }, // ยาว STD
      { wch: 14 }, // FS หนา
      { wch: 14 }, // FS กว้าง
      { wch: 16 }, // ผลิตได้
      { wch: 14 }, // จำนวนโฟม
      { wch: 12 }, // เหลือ หนา
      { wch: 12 }, // เหลือ กว้าง
      { wch: 12 }, // เหลือ ยาว
      { wch: 10 }, // NG
      { wch: 16 }, // Loss เกิน STD
      { wch: 16 }, // Loss ฝ่ายผลิต
      { wch: 14 }, // ใช้จริง
      { wch: 12 }, // % Yield
      { wch: 20 }, // ผู้ปฏิบัติงาน
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'สรุป KPI SLIT');

    // สร้างชื่อไฟล์ที่ระบุช่วงเวลาชัดเจน
    const cleanDateTag = (startDate && endDate)
      ? `${startDate}_to_${endDate}`
      : (startDate ? startDate : todayStr);
    const fileName = `SLIT_KPI_Report_${cleanDateTag}.xlsx`;

    XLSX.writeFile(wb, fileName);
    return fileName;
  },

  /* ========================================================================= */
  /* 🟢 [IPO TUBE] EXCEL KPI EXPORT (รายงานสรุป KPI ฝ่ายผลิต IPO TUBE)          */
  /* ========================================================================= */
  /**
   * ส่งออกรายงานสรุป KPI ฝ่ายผลิต IPO TUBE เป็นไฟล์ Excel (.xlsx)
   */
  exportIpoTubeKpiExcel(jobs = [], { startDate = '', endDate = '', keyword = '', sytelineDescriptions = {} } = {}) {
    if (!jobs || jobs.length === 0) {
      throw new Error('ไม่พบข้อมูลสำหรับการส่งออก Excel');
    }

    if (startDate && endDate && startDate > endDate) {
      throw new Error('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
    }

    // กรองช่วงวันที่เพิ่มเติมเพื่อความถูกต้องและปลอดภัย (Defensive Date Filtering)
    let exportJobs = jobs;
    if (startDate || endDate) {
      exportJobs = jobs.filter((jobItem) => {
        const rList = Array.isArray(jobItem.rolls) && jobItem.rolls.length > 0 ? jobItem.rolls : [jobItem];
        return rList.some((r) => {
          const jDate = CalculationService.safeExtractDate(r.productionDate || r.date || jobItem.date || r.createdAt || r.lotNumber);
          if (startDate && jDate && jDate < startDate) return false;
          if (endDate && jDate && jDate > endDate) return false;
          return true;
        });
      });
    }

    if (exportJobs.length === 0) {
      throw new Error('ไม่พบข้อมูลในช่วงวันที่ที่ระบุสำหรับการส่งออก Excel');
    }

    const todayStr = CalculationService.getCurrentDateString();
    let dateRangeText = 'ทั้งหมด';
    if (startDate && endDate) {
      dateRangeText = startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} ถึง ${formatDate(endDate)}`;
    } else if (startDate) {
      dateRangeText = `ตั้งแต่ ${formatDate(startDate)}`;
    } else if (endDate) {
      dateRangeText = `ถึง ${formatDate(endDate)}`;
    }

    // ── 1. คำนวณสรุป KPI รวม ──
    let totalJobs = exportJobs.length;
    let totalRollsCount = 0;
    let totalProducedMeters = 0;
    let totalGoodMeters = 0;
    let totalNgMeters = 0;
    let totalSplitSeamMeters = 0;
    let totalLossMeters = 0;
    let totalGrossMinutes = 0;
    let totalWorkMinutes = 0;
    let totalLostMinutes = 0;

    // ขยายแถวตามแต่ละ Roll / Run
    const dataRows = [];
    let rowSequence = 1;

    exportJobs.forEach((jobItem) => {
      // ตรวจสอบว่า jobItem เป็นแบบ Grouped Job หรือเป็น Single Roll
      let rolls = Array.isArray(jobItem.rolls) && jobItem.rolls.length > 0
        ? jobItem.rolls
        : [jobItem];

      // กรอง rolls ภายใน job ตามช่วงวันที่ด้วยถ้ามีการระบุ
      if (startDate || endDate) {
        rolls = rolls.filter((r) => {
          const jDate = CalculationService.safeExtractDate(r.productionDate || r.date || jobItem.date || r.createdAt || r.lotNumber);
          if (startDate && jDate && jDate < startDate) return false;
          if (endDate && jDate && jDate > endDate) return false;
          return true;
        });
      }

      rolls.forEach((r) => {
        totalRollsCount += 1;
        const jDate = CalculationService.safeExtractDate(r.productionDate || r.date || jobItem.date || r.createdAt || r.lotNumber) || '-';
        const jobNo = (r.jobNo || jobItem.jobNo || '-').trim();
        const runNo = r.runNo || r.rollNo || r.sequenceNo || '-';
        const partNo = (r.partNo || jobItem.partNo || '-').trim();
        const prodName = (r.productName || jobItem.productName || r.description || jobItem.description || sytelineDescriptions[jobNo] || '-').trim();

        const isNoCore = r.hasNoCore === true || r.hasCore === false || r.tapTube === '-' || r.tube1Spec === '-';
        const tapTube = isNoCore ? '-' : (r.tapTube || r.tube1Spec || '-');
        const lotNoTap = isNoCore ? '-' : (r.lotTap || r.lot_tap || r.lotNoTap || r.lotNumber || '-');
        const embossSlit = r.embossSlit || r.tube1Spec || '-';
        const rawLotEmboss = r.lotSlit || r.lot_slit || r.lotNoSlit || r.lotNoEmboss || r.embossLot || '-';
        const parsedEmboss = CalculationService.extractEmbossDetails(rawLotEmboss);
        const cleanLotEmboss = parsedEmboss.lotDate || String(rawLotEmboss).replace(/\(.*?\)/g, '').trim() || '-';

        const rRoll = (r.rollSlit !== undefined && r.rollSlit !== null && String(r.rollSlit).trim() !== '')
          ? String(r.rollSlit).trim()
          : ((r.roll_slit !== undefined && r.roll_slit !== null && String(r.roll_slit).trim() !== '')
            ? String(r.roll_slit).trim()
            : ((r.slitRoll !== undefined && r.slitRoll !== null && String(r.slitRoll).trim() !== '')
              ? String(r.slitRoll).trim()
              : (parsedEmboss.rollNo || '')));

        const rTotal = (r.totalRollSlit !== undefined && r.totalRollSlit !== null && String(r.totalRollSlit).trim() !== '')
          ? String(r.totalRollSlit).trim()
          : ((r.total_roll_slit !== undefined && r.total_roll_slit !== null && String(r.total_roll_slit).trim() !== '')
            ? String(r.total_roll_slit).trim()
            : ((r.slitTotalRoll !== undefined && r.slitTotalRoll !== null && String(r.slitTotalRoll).trim() !== '')
              ? String(r.slitTotalRoll).trim()
              : (parsedEmboss.totalRolls || '')));

        const rollDisplay = (rRoll && rTotal) ? `${rRoll}/${rTotal}` : (rRoll || '-');

        const id1 = r.id1 ?? '-';
        const id2 = r.id2 ?? '-';
        const idAvg = r.idAvg ?? '-';
        const t1 = r.t1 ?? '-';
        const t2 = r.t2 ?? '-';
        const t3 = r.t3 ?? '-';
        const t4 = r.t4 ?? '-';
        const tAvg = r.tAvg ?? '-';
        const judgement = r.judgement || (partNo !== '-' ? 'OK' : '-');

        const speed = r.speed ?? '-';
        const temp1 = r.temp1 ?? '-';
        const temp2 = r.temp2 ?? '-';
        const temp3 = r.temp3 ?? '-';
        const temp4 = r.temp4 ?? '-';
        const tempPipe = r.tempPipe ?? r.temp5 ?? '-';

        const startTime = r.startTime || '-';
        const endTime = r.endTime || '-';

        // ยอดผลิตทั้งหมดของแต่ละรอบ (PRODUCT M/Roll เช่น 4000, 4100)
        const rollProducedMeters = Number(r.productQty ?? r.goodQty ?? r.totalMeters ?? r.productedQty ?? 0) || 0;

        // Defects Prod 1 & 2
        const d = r.defects || {};
        const settingNg = Number(d.setting ?? r.setting ?? 0) || 0;
        const jointIpoNg = Number(d.jointIpo ?? r.jointIpo ?? 0) || 0;
        const splitSeamNg = Number(d.splitSeam ?? r.splitSeam ?? 0) || 0;
        const dimNg = Number(d.dimNg ?? r.dimNg ?? 0) || 0;
        const foamDetachedNg = Number(d.foamDetached ?? r.foamDetached ?? 0) || 0;

        const jointMarkNg = Number(d.jointMark ?? r.jointMark ?? 0) || 0;
        const thickNg = Number(d.thickNg ?? r.thickNg ?? 0) || 0;
        const filmBlemishNg = Number(d.filmBlemish ?? r.filmBlemish ?? 0) || 0;
        const otherNg = Number(d.otherNg ?? r.otherNg ?? 0) || 0;

        const totalRollNg = settingNg + jointIpoNg + splitSeamNg + dimNg + foamDetachedNg +
          jointMarkNg + thickNg + filmBlemishNg + otherNg;
        const rollLoss = Math.max(0, totalRollNg - splitSeamNg);

        // ผลผลิตดี = ยอดผลิตรอบนั้น ลบ รวมงานเสียและloss
        const rollGoodMeters = Math.max(0, rollProducedMeters - totalRollNg);

        totalProducedMeters += rollProducedMeters;
        totalGoodMeters += rollGoodMeters;
        totalNgMeters += totalRollNg;
        totalSplitSeamMeters += splitSeamNg;
        totalLossMeters += rollLoss;

        // คำนวณเวลาทำงานของแต่ละรอบ
        let rollWorkMins = 0;
        if (r.startTime && r.endTime) {
          const [sH, sM] = String(r.startTime).split(':').map(Number);
          const [eH, eM] = String(r.endTime).split(':').map(Number);
          if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
            let diff = (eH * 60 + eM) - (sH * 60 + sM);
            if (diff < 0) diff += 24 * 60;
            rollWorkMins = diff;
          }
        }
        if (rollWorkMins === 0 && r.totalTime) {
          const rawVal = String(r.totalTime);
          if (rawVal.includes('ชม.') || rawVal.includes('นาที')) {
            let h = 0, m = 0;
            const hMatch = rawVal.match(/(\d+)\s*ชม/);
            const mMatch = rawVal.match(/(\d+)\s*นาที/);
            if (hMatch) h = parseInt(hMatch[1], 10);
            if (mMatch) m = parseInt(mMatch[1], 10);
            rollWorkMins = h * 60 + m;
          } else {
            const num = parseFloat(rawVal);
            if (!isNaN(num)) rollWorkMins = Math.round(num * 60);
          }
        }

        // คำนวณเวลาเสียของแต่ละรอบ
        let rollLostMins = Number(r.lostTimeMinutes || 0);
        if (rollLostMins === 0 && r.lostTimeStart && r.lostTimeEnd) {
          const [lsH, lsM] = String(r.lostTimeStart).split(':').map(Number);
          const [leH, leM] = String(r.lostTimeEnd).split(':').map(Number);
          if (!isNaN(lsH) && !isNaN(lsM) && !isNaN(leH) && !isNaN(leM)) {
            let diff = (leH * 60 + leM) - (lsH * 60 + lsM);
            if (diff < 0) diff += 24 * 60;
            rollLostMins = diff;
          }
        }
        if (rollLostMins === 0 && (r.downtimeMinutes || r.downtime)) {
          rollLostMins = Number(r.downtimeMinutes || r.downtime || 0);
        }
        if (rollLostMins === 0 && (r.downtimeNote || r.kpiNote)) {
          const note = String(r.downtimeNote || r.kpiNote);
          const mMatch = note.match(/(\d+)\s*นาที/);
          const hMatch = note.match(/(\d+)\s*ชม/);
          if (hMatch) rollLostMins += parseInt(hMatch[1], 10) * 60;
          if (mMatch) rollLostMins += parseInt(mMatch[1], 10);
        }
        totalLostMinutes += rollLostMins;

        // คำนวณเวลาทำงานสุทธิ (หักเวลาที่เสียออก ตามแบบที่ 2)
        totalGrossMinutes += rollWorkMins;
        const rollNetWorkMins = Math.max(0, rollWorkMins - rollLostMins);
        totalWorkMinutes += rollNetWorkMins;

        // จัดรูปแบบการแสดงผลเวลา
        const totalTimeDisplay = (r.totalTime && (String(r.totalTime).includes('ชม.') || String(r.totalTime).includes('นาที')))
          ? String(r.totalTime)
          : (rollWorkMins > 0 ? formatDurationHoursMinutes(rollWorkMins) : (r.totalTime || '-'));

        const lostHoursDisplay = rollLostMins > 0 ? formatDurationHoursMinutes(rollLostMins) : '-';

        const netWorkTimeDisplay = rollNetWorkMins > 0
          ? formatDurationHoursMinutes(rollNetWorkMins)
          : (rollWorkMins > 0 ? formatDurationHoursMinutes(rollWorkMins) : '-');

        const op = (r.operatorName || r.employeeName || jobItem.operatorName || '-').trim();
        const downtimeNote = (r.downtimeNote || r.kpiNote || r.generalNote || '-').trim();

        dataRows.push([
          rowSequence++,
          formatDate(jDate),
          jobNo,
          runNo,
          partNo,
          prodName,
          tapTube,
          lotNoTap,
          embossSlit,
          cleanLotEmboss,
          rollDisplay,
          id1,
          id2,
          idAvg,
          t1,
          t2,
          t3,
          t4,
          tAvg,
          judgement,
          speed,
          temp1,
          temp2,
          temp3,
          temp4,
          tempPipe,
          startTime,
          endTime,
          totalTimeDisplay,
          lostHoursDisplay,
          netWorkTimeDisplay,
          rollGoodMeters,
          settingNg,
          jointIpoNg,
          splitSeamNg,
          dimNg,
          foamDetachedNg,
          jointMarkNg,
          thickNg,
          filmBlemishNg,
          otherNg,
          totalRollNg,
          rollProducedMeters,
          op,
          downtimeNote
        ]);
      });
    });

    const totalOverallMeters = totalProducedMeters;

    // ── 2. ประกอบ Header และส่วนสรุป KPI ──
    const rows = [
      ['รายงานสรุป KPI การผลิต IPO TUBE (LIGHT COVER PRODUCTION)'],
      ['บริษัท อิโนแอค อินดัสตรี้ส์ (ประเทศไทย) จำกัด (แผนก PIPE SET)'],
      [],
      ['เงื่อนไขการค้นหา:', dateRangeText, '', 'คำค้นหา:', keyword || 'ทั้งหมด', '', 'วันที่ส่งออกไฟล์:', formatTimestamp()],
      [],
      ['สรุป KPI รวม:', '', '', '', '', '', '', ''],
      ['จำนวน Job ทั้งหมด (Jobs)', totalJobs, '', 'รอบการผลิตรวม (Rolls/Runs)', totalRollsCount, '', 'ผลผลิตชิ้นงานดี (m.)', totalGoodMeters],
      ['รวมงานเสีย (ตะเข็บแตก) (m.)', totalSplitSeamMeters, '', 'LOSS (ของเสียอื่นๆ) (m.)', totalLossMeters, '', 'รวมผลิตทั้งหมด (m.)', totalOverallMeters],
      ['รวมเวลาที่เสีย', totalLostMinutes > 0 ? formatDurationHoursMinutes(totalLostMinutes) : '-', '', 'รวมเวลาทำงานทั้งหมด', totalWorkMinutes > 0 ? formatDurationHoursMinutes(totalWorkMinutes) : '-', '', '', ''],
      [],
      // ── ตารางหัวคอลัมน์ ──
      [
        'ลำดับ',
        'วันที่ผลิต',
        'เลขที่ Job',
        'รอบที่ (Run)',
        'รหัสควบคุม (Part No.)',
        'ชื่อสินค้าที่ผลิต',
        'TAP Tube',
        'Lot No. TAP',
        'Emboss Slit',
        'Lot No. Slit',
        'ม้วน Lot (Roll)',
        'ID 1',
        'ID 2',
        'ID Avg',
        'T 1',
        'T 2',
        'T 3',
        'T 4',
        'T Avg',
        'Judgement',
        'Speed (m/min)',
        'Temp 1',
        'Temp 2',
        'Temp 3',
        'Temp 4',
        'Temp Pipe',
        'เวลาเริ่ม',
        'เวลาสิ้นสุด',
        'ใช้เวลา',
        'ชั่วโมงที่เสีย',
        'เวลาสุทธิ',
        'ผลผลิตดี (m.)',
        'NG: Setting',
        'NG: รอยต่อ IPO',
        'NG: ตะเข็บแตก',
        'NG: ขนาด NG',
        'NG: โฟมไม่ติด',
        'NG: รอยมาร์ค',
        'NG: ความหนา',
        'NG: ฟิล์มด่าง',
        'NG: อื่นๆ',
        'รวมของเสีย (m.)',
        'รวมผลิตทั้งหมด (m.)',
        'ผู้ปฏิบัติงาน',
        'หมายเหตุ / Downtime'
      ],
      ...dataRows,
      // ── แถวผลรวมท้ายตาราง ──
      [
        'รวมทั้งหมด (TOTAL)',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        totalGrossMinutes > 0 ? formatDurationHoursMinutes(totalGrossMinutes) : '',
        totalLostMinutes > 0 ? formatDurationHoursMinutes(totalLostMinutes) : '',
        totalWorkMinutes > 0 ? formatDurationHoursMinutes(totalWorkMinutes) : '',
        totalGoodMeters,
        '',
        '',
        totalSplitSeamMeters,
        '',
        '',
        '',
        '',
        '',
        '',
        totalNgMeters,
        totalOverallMeters,
        '',
        ''
      ],
      [],
      ['สรุปผลการผลิตและเวลา (Footer Summary):'],
      ['รวมผลิตงานดี', totalGoodMeters, 'เมตร'],
      ['รวมงานเสีย (เฉพาะตะเข็บแตก)', totalSplitSeamMeters, 'เมตร'],
      ['LOSS (Prod.1 + Prod.2 รวมกัน ไม่รวมตะเข็บแตก)', totalLossMeters, 'เมตร'],
      ['รวมงานที่ผลิตทั้งหมด', totalOverallMeters, 'เมตร'],
      ['รวมเวลาที่เสีย', totalLostMinutes > 0 ? formatDurationHoursMinutes(totalLostMinutes) : '-'],
      ['รวมเวลาทำงานทั้งหมด', totalWorkMinutes > 0 ? formatDurationHoursMinutes(totalWorkMinutes) : '-']
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // กำหนดความกว้างคอลัมน์
    ws['!cols'] = [
      { wch: 8 },  // ลำดับ
      { wch: 14 }, // วันที่ผลิต
      { wch: 16 }, // Job No
      { wch: 12 }, // Run
      { wch: 22 }, // Part No
      { wch: 20 }, // ชื่อสินค้า
      { wch: 14 }, // TAP Tube
      { wch: 16 }, // Lot TAP
      { wch: 14 }, // Emboss Slit
      { wch: 16 }, // Lot Slit
      { wch: 15 }, // ม้วน Lot (Roll)
      { wch: 10 }, // ID 1
      { wch: 10 }, // ID 2
      { wch: 10 }, // ID Avg
      { wch: 10 }, // T 1
      { wch: 10 }, // T 2
      { wch: 10 }, // T 3
      { wch: 10 }, // T 4
      { wch: 10 }, // T Avg
      { wch: 12 }, // Judgement
      { wch: 14 }, // Speed
      { wch: 10 }, // Temp 1
      { wch: 10 }, // Temp 2
      { wch: 10 }, // Temp 3
      { wch: 10 }, // Temp 4
      { wch: 12 }, // Temp Pipe
      { wch: 10 }, // เวลาเริ่ม
      { wch: 10 }, // เวลาสิ้นสุด
      { wch: 12 }, // ใช้เวลา
      { wch: 14 }, // ชั่วโมงที่เสีย
      { wch: 12 }, // เวลาสุทธิ
      { wch: 16 }, // ผลผลิตดี
      { wch: 12 }, // NG Setting
      { wch: 14 }, // NG รอยต่อ
      { wch: 14 }, // NG ตะเข็บ
      { wch: 12 }, // NG ขนาด
      { wch: 14 }, // NG โฟมไม่ติด
      { wch: 14 }, // NG รอยมาร์ค
      { wch: 12 }, // NG ความหนา
      { wch: 12 }, // NG ฟิล์มด่าง
      { wch: 10 }, // NG อื่นๆ
      { wch: 16 }, // รวมของเสีย
      { wch: 18 }, // รวมผลิตทั้งหมด
      { wch: 20 }, // ผู้ปฏิบัติงาน
      { wch: 24 }, // หมายเหตุ
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'สรุป KPI IPO TUBE');

    const cleanDateTag = (startDate && endDate)
      ? `${startDate}_to_${endDate}`
      : (startDate ? startDate : todayStr);
    const fileName = `IPO_TUBE_KPI_Report_${cleanDateTag}.xlsx`;

    XLSX.writeFile(wb, fileName);
    return fileName;
  }
};
