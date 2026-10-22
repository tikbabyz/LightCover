/**
 * ============================================================================
 * 🔵 [SLIT] & 🟢 [IPO TUBE] CALCULATION SERVICE
 * ============================================================================
 * รวมฟังก์ชันคำนวณ ตรวจสอบสเปก และจัดรูปแบบข้อมูลสำหรับกระบวนการผลิต:
 *  - 🔵 SECTION 1: SLIT PROCESS (PIPE LINE - ตัดม้วน/ฟอยล์/คำนวณ Yield)
 *  - 🌐 SECTION 2: SHARED UTILITIES (ฟังก์ชันใช้ร่วมกันทั้ง SLIT และ IPO TUBE)
 *  - 🟢 SECTION 3: IPO TUBE PROCESS (PIPE SET - ขนาดท่อ/เกณฑ์ยอมรับ OK-NG)
 *  - 🟢 SECTION 4: IPO MASTER SPECIFICATIONS (Master Data 21 สเปกของ IPO TUBE)
 * ============================================================================
 */
export class CalculationService {
  /* ========================================================================= */
  /* 🔵 SECTION 1: SLIT PROCESS (PIPE LINE - ตัดม้วน/คำนวณยอดผลิต/Yield/Scrap)  */
  /* ========================================================================= */
  /**
   * Business Logic & Formulas (อ้างอิงจากแผนก PIPE LINE - คิดเฉลี่ยต่อ 1 ROLL):
   * actualused_qty = ((First sheet 1 x Qty 1) + (First sheet 2 x Qty 2)) / rollUsed
   * remain_width   = std_width - actualused_qty
   * loss_overstd   = actualfoam_width - std_width
   * loss_product   = std_width - actualused_qty
   * yield          = (actualused_qty / std_width) * 100
   * Warning if yield < 95%
   */
  static calculatePipeLineMetrics(input) {
    const {
      stdWidth = 0,
      actualFoamWidth = 0,
      firstSheetWidth,
      firstSheetWidth1,
      productedQty,
      productedQty1,
      firstSheetWidth2 = 0,
      productedQty2 = 0,
      firstSheetEntries = [],
      rollUsed = 1,
      targetYieldStd = 95.0
    } = input;

    let totalCutWidth = 0;
    if (Array.isArray(firstSheetEntries) && firstSheetEntries.length > 0) {
      totalCutWidth = firstSheetEntries.reduce((sum, item) => {
        const w = parseFloat(item.width) || 0;
        const q = parseFloat(item.qty) || 0;
        return sum + (w * q);
      }, 0);
    } else {
      const w1 = parseFloat(firstSheetWidth1 ?? firstSheetWidth) || 0;
      const q1 = parseFloat(productedQty1 ?? productedQty) || 0;
      const w2 = parseFloat(firstSheetWidth2) || 0;
      const q2 = parseFloat(productedQty2) || 0;
      totalCutWidth = (w1 * q1) + (w2 * q2);
    }

    const rolls = rollUsed > 0 ? rollUsed : 1;

    // 1. จำนวนที่ใช้จริงเฉลี่ยต่อ 1 ROLL (mm.)
    const actualUsedQty = Number((totalCutWidth / rolls).toFixed(2));

    if (stdWidth <= 0 || actualUsedQty <= 0) {
      return {
        actualUsedQty: 0,
        remainWidth: stdWidth > 0 ? stdWidth : 0,
        lossOverStd: actualFoamWidth > 0 && stdWidth > 0 ? Math.max(0, Number((actualFoamWidth - stdWidth).toFixed(2))) : 0,
        lossProduct: 0,
        yield: 0,
        isYieldWarning: false
      };
    }

    // 2. เหลือกว้างต่อม้วน = กว้าง STD - จำนวนที่ใช้จริงต่อม้วน
    const remainWidth = Math.max(0, Number((stdWidth - actualUsedQty).toFixed(2)));

    // 3. Loss เกิน STD ต่อม้วน = (กว้างโฟมจริง - กว้าง STD)
    const lossOverStd = Math.max(0, Number((actualFoamWidth - stdWidth).toFixed(2)));

    // 4. Loss ฝ่ายผลิตต่อม้วน = กว้าง STD - จำนวนที่ใช้จริงต่อม้วน
    const lossProduct = Math.max(0, Number((stdWidth - actualUsedQty).toFixed(2)));

    // 5. % Yield = (จำนวนที่ใช้จริงต่อม้วน / กว้าง STD) * 100
    const rawYield = (actualUsedQty / stdWidth) * 100;
    const yieldPercent = Number(rawYield.toFixed(2));

    // Warning if Yield < target or < 95%
    const isYieldWarning = yieldPercent < targetYieldStd || yieldPercent < 95.0;

    return {
      actualUsedQty,
      remainWidth,
      lossOverStd,
      lossProduct,
      yield: Math.max(0, yieldPercent),
      isYieldWarning
    };
  }

  /**
   * Calculate summary metrics across all completed jobs in the shift/report
   */
  static calculateDailySummary(jobs, targetDailyYield = 95.0) {
    if (!jobs || jobs.length === 0) {
      return {
        totalJobs: 0,
        totalGoodPcs: 0,
        totalNgPcs: 0,
        totalRollUsed: 0,
        averageYieldPercent: 0,
        totalActualUsedMm: 0,
        totalLossProductMm: 0,
        totalLossOverStdMm: 0,
        isDailyYieldTargetMet: false
      };
    }

    const totalJobs = jobs.length;
    let totalGoodPcs = 0;
    let totalNgPcs = 0;
    let totalRollUsed = 0;
    let sumYield = 0;
    let totalActualUsedMm = 0;
    let totalLossProductMm = 0;
    let totalLossOverStdMm = 0;

    jobs.forEach((job) => {
      const goodPcs = job.totalProductedQty ||
        (job.firstSheetEntries && job.firstSheetEntries.length > 0
          ? job.firstSheetEntries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0)
          : ((job.productedQty || 0) + (job.productedQty2 || 0)));
      totalGoodPcs += goodPcs;
      totalNgPcs += job.ng || 0;
      totalRollUsed += job.rollUsed || 1;
      sumYield += job.yield || 0;
      totalActualUsedMm += job.actualUsedQty || 0;
      totalLossProductMm += job.lossProduct || 0;
      totalLossOverStdMm += job.lossOverStd || 0;
    });

    const averageYieldPercent = Number((sumYield / totalJobs).toFixed(2));
    const isDailyYieldTargetMet = averageYieldPercent >= targetDailyYield;

    return {
      totalJobs,
      totalGoodPcs,
      totalNgPcs,
      totalRollUsed,
      averageYieldPercent,
      totalActualUsedMm: Number(totalActualUsedMm.toFixed(2)),
      totalLossProductMm: Number(totalLossProductMm.toFixed(2)),
      totalLossOverStdMm: Number(totalLossOverStdMm.toFixed(2)),
      isDailyYieldTargetMet
    };
  }

  /* ========================================================================= */
  /* 🌐 SECTION 2: SHARED UTILITIES (ฟังก์ชันใช้ร่วมกันทั้ง SLIT และ IPO TUBE)   */
  /* ========================================================================= */
  /**
   * Helper: Get current date string (YYYY-MM-DD)
   */
  static getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper: Safely extract YYYY-MM-DD from any job, date string, Date object, or timestamp
   */
  static safeExtractDate(jobOrDate) {
    if (!jobOrDate) return '';
    let val = jobOrDate;
    if (typeof jobOrDate === 'object' && !(jobOrDate instanceof Date)) {
      val = jobOrDate.productionDate || jobOrDate.date || jobOrDate.createdAt || jobOrDate.lotNumber || '';
    }
    if (!val) return '';
    if (val instanceof Date) {
      try {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      } catch {
        return '';
      }
    }
    if (typeof val === 'number') {
      try {
        const dObj = new Date(val);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      } catch {
        return '';
      }
    }
    const clean = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    const formatted = CalculationService.formatToYYYYMMDD(clean, '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    return '';
  }

  /**
   * Helper: Format YYYY-MM-DD or date object to DD/MM/YYYY
   */
  static formatDateDisplay(dateVal) {
    if (!dateVal || dateVal === 'ไม่ระบุวันที่') return '-';
    const str = CalculationService.safeExtractDate(dateVal) || String(dateVal);
    const parts = str.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str;
  }

  /**
   * สกัดรายละเอียดของ Emboss จาก Barcode/QR code ของ Emboss
   * รูปแบบ QR มาตรฐาน: Job|PartNo|Date|RollNo|TotalRolls|Process|
   * ตัวอย่าง QR: "S17G200243|P123778001|2026-10-08|8|8|EMBOSS|"
   * หรือ "S40G800011|P123778001|2026-08-13|1|2|EMBOSS|"
   */
  static extractEmbossDetails(rawInput) {
    if (!rawInput) return { raw: '', jobNo: '', materialNo: '', lotDate: '', rollNo: '', totalRolls: '', rollInfo: '', formattedLot: '' };
    const clean = rawInput.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    if (!clean) return { raw: '', jobNo: '', materialNo: '', lotDate: '', rollNo: '', totalRolls: '', rollInfo: '', formattedLot: '' };

    if (clean.includes('|')) {
      const rawParts = clean.split('|').map(p => p.trim()).filter(Boolean);
      // กรองคำระบุกระบวนการออก เช่น EMBOSS, SLIT, IPO, TUBE
      const parts = rawParts.filter(p => !/^(EMBOSS|SLIT|IPO(?:\s*TUBE)?)$/i.test(p));

      // 1. ค้นหาวันที่ผลิต (Lot Date: เช่น 2026-10-08 หรือ 26-08-2026 หรือ 2026/10/08)
      const datePart = parts.find(p => /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(p) || /^\d{2}[-/]\d{2}[-/]\d{2,4}$/.test(p));
      let lotDate = datePart ? CalculationService.formatToYYYYMMDD(datePart, '') : '';

      if (!lotDate) {
        const ym = clean.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/);
        if (ym) lotDate = CalculationService.formatToYYYYMMDD(ym[0], '');
      }

      // 2. ค้นหารหัสวัตถุดิบ / Part No (เช่น P123778001 หรือ T373778001 ขึ้นต้นด้วย P/T)
      const matPart = parts.find(p => /^[PT][0-9A-Z_-]{5,}/i.test(p) && p !== datePart);
      const materialNo = matPart ? matPart.trim() : '';

      // 3. ค้นหาเลขที่ Job (เช่น S40G900002, S17G200243 ขึ้นต้นด้วย S หรือชิ้นส่วนแรกที่ไม่ใช่วันที่/Part)
      const jobPart = parts.find(p => /^S\d{2}[A-Z0-9_-]+/i.test(p) && p !== materialNo && p !== datePart);
      let jobNo = jobPart ? jobPart.trim() : '';
      if (!jobNo && parts.length > 0) {
        const first = parts[0];
        if (first !== datePart && first !== materialNo && !/^\d+$/.test(first) && !/^\d+\/\d+$/.test(first)) {
          jobNo = first;
        }
      }

      // 4. สกัดเลขม้วน Roll No และ Total Rolls (เช่น 3|5 หรือ 1/9 หรือ 8|8)
      let rollNo = '';
      let totalRolls = '';

      // 4.1 ตรวจสอบว่ามี part ที่เป็นเศษส่วน เช่น '3/5', '1/9', 'Roll 3/5' หรือไม่
      const slashPart = parts.find(p => /^(?:(?:Roll|ม้วน)\s*)?(\d+)\s*[/]\s*(\d+)$/i.test(p));
      if (slashPart) {
        const sm = slashPart.match(/^(?:(?:Roll|ม้วน)\s*)?(\d+)\s*[/]\s*(\d+)$/i);
        if (sm) {
          rollNo = sm[1];
          totalRolls = sm[2];
        }
      }

      // 4.2 ถ้ายังไม่เจอ หาจาก numeric parts (เช่น '3' และ '5')
      if (!rollNo) {
        const numericParts = parts.filter(p => /^\d+$/.test(p) && p !== datePart);
        if (numericParts.length >= 2) {
          rollNo = numericParts[0];
          totalRolls = numericParts[1];
        } else if (numericParts.length === 1) {
          rollNo = numericParts[0];
        }
      }

      // 4.3 ถ้ายังไม่เจอ ตรวจสอบในข้อความว่ามี (Roll X/Y) หรือ Roll X หรือไม่
      if (!rollNo) {
        const rm = clean.match(/(?:\((?:ม้วน|Roll)?\s*(\d+)(?:\s*[/|]\s*(\d+))?\)|(?:ม้วน|Roll)\s*(\d+)(?:\s*[/|]\s*(\d+))?)/i);
        if (rm) {
          rollNo = rm[1] || rm[3] || '';
          totalRolls = rm[2] || rm[4] || '';
        }
      }

      let rollInfo = '';
      if (rollNo && totalRolls) {
        rollInfo = `Roll ${rollNo}/${totalRolls}`;
      } else if (rollNo) {
        rollInfo = `Roll ${rollNo}`;
      }

      // ถ้าไม่มีวันที่เลย และเป็นแค่ข้อความส่วนท้าย เช่น EMBOSS / SLIT ให้คืนค่าว่าง
      if (!lotDate && !materialNo && !rollInfo && /^(EMBOSS|SLIT)$/i.test(clean.replace(/\|/g, ''))) {
        return { raw: clean, jobNo: '', materialNo: '', lotDate: '', rollNo: '', totalRolls: '', rollInfo: '', formattedLot: '' };
      }

      const strippedClean = clean.replace(/\|?\b(EMBOSS|SLIT|IPO(?:\s*TUBE)?)\b\|?/gi, '').trim();
      const formattedLot = lotDate && rollInfo ? `${lotDate} (${rollInfo})` : (lotDate || (rollInfo ? `(${rollInfo})` : strippedClean));

      return {
        raw: clean,
        jobNo,
        materialNo,
        lotDate,
        rollNo,
        totalRolls,
        rollInfo,
        formattedLot
      };
    }

    // กรณีเป็นข้อความปกติหรือไม่มีเครื่องหมาย |
    const rollMatch = clean.match(/(?:\((?:ม้วน|Roll)?\s*(\d+)(?:\s*[/|]\s*(\d+))?\)|(?:ม้วน|Roll)\s*(\d+)(?:\s*[/|]\s*(\d+))?)/i);
    let rollInfo = '';
    let rollNo = '';
    let totalRolls = '';
    if (rollMatch) {
      rollNo = rollMatch[1] || rollMatch[3] || '';
      totalRolls = rollMatch[2] || rollMatch[4] || '';
      rollInfo = totalRolls ? `Roll ${rollNo}/${totalRolls}` : `Roll ${rollNo}`;
    }

    const ymdMatch = clean.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/);
    const lotDate = ymdMatch ? CalculationService.formatToYYYYMMDD(ymdMatch[0], '') : CalculationService.formatToYYYYMMDD(clean.replace(/\(.*?\)/g, '').trim(), '');
    const formattedLot = lotDate && rollInfo ? `${lotDate} (${rollInfo})` : (lotDate || clean.replace(/ม้วน/gi, 'Roll'));

    return {
      raw: clean,
      jobNo: '',
      materialNo: '',
      lotDate,
      rollNo,
      totalRolls,
      rollInfo,
      formattedLot
    };
  }

  /**
   * สกัด Lot No. จากข้อความที่สแกน Barcode/QR code ของ Emboss
   * พร้อมรวมข้อมูล Roll (เช่น "2026-10-08 (Roll 8/8)")
   */
  static extractEmbossLot(rawInput) {
    if (!rawInput) return '';
    const details = CalculationService.extractEmbossDetails(rawInput);
    return details.formattedLot || details.lotDate || details.raw || '';
  }

  /**
   * แปลง Emboss Lot สำหรับการบันทึกโดยรักษาวันที่ YYYY-MM-DD และระบุหมายเลขม้วน (Roll X/Y)
   */
  static formatEmbossLotForSave(lotStr, fallbackDate) {
    if (!lotStr && !fallbackDate) return '';
    let raw = String(lotStr || '').trim();
    if (!raw) return CalculationService.formatToYYYYMMDD('', fallbackDate);

    // แทนที่คำว่า ม้วน ด้วย Roll ทันทีหากมี
    raw = raw.replace(/ม้วน/gi, 'Roll');

    // ดึงส่วนในวงเล็บถ้ามี (เช่น "(Roll 8/8)")
    const bracketMatch = raw.match(/\(([^)]+)\)/);
    let bracketContent = bracketMatch ? bracketMatch[1].trim() : '';

    const cleanDatePart = raw.replace(/\(.*?\)/g, '').trim();
    const formattedDate = CalculationService.formatToYYYYMMDD(cleanDatePart, fallbackDate);

    if (bracketContent) {
      return `${formattedDate} (${bracketContent})`.trim();
    }
    return formattedDate;
  }

  /**
   * แปลงวันที่หรือ Lot No ให้เป็นรูปแบบ YYYY-MM-DD (ค.ศ. เช่น 2026-08-09) สำหรับบันทึกลง Database
   * รองรับทั้ง DD-MM-YYYY, YYYY-MM-DD, พ.ศ. 2569/69, ISO string, หรือตัวเลขติดกัน
   */
  static formatToYYYYMMDD(dateStr, fallbackDate) {
    if (!dateStr && !fallbackDate) return '';
    const raw = (dateStr || fallbackDate || '').toString().trim();
    if (!raw) return '';

    // ล้างคำนำหน้า เช่น LOT- หรือ LOT: หรือ JOB-
    const clean = raw.replace(/^(LOT\s*NO\.?[:\s]*|LOT[:\s]*|JOB[:\s]*)/i, '').trim();

    // กรณีมี T (ISO Date เช่น 2026-08-09T...)
    if (clean.includes('T')) {
      return clean.split('T')[0];
    }

    // ตัดส่วนเวลาที่คั่นด้วย space ออก (เช่น "9/16/2026 12:00:00 AM" -> "9/16/2026")
    const dateOnly = clean.split(/\s+/)[0];

    // ตรวจสอบแบบมีเครื่องหมายคั่น -, /, .
    const delimiterMatch = dateOnly.match(/[-/.]/);
    if (delimiterMatch) {
      const delim = delimiterMatch[0];
      const parts = dateOnly.split(delim).map(p => p.trim()).filter(Boolean);
      if (parts.length === 3) {
        let day, month, year;
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          year = Number(parts[0]);
          month = Number(parts[1]);
          day = Number(parts[2]);
        } else {
          // DD-MM-YYYY หรือ M/D/YYYY
          year = Number(parts[2]);
          const p0 = Number(parts[0]);
          const p1 = Number(parts[1]);
          if (p1 > 12) {
            // US format เช่น 9/16/2026
            month = p0;
            day = p1;
          } else if (p0 > 12) {
            // UK/Thai format เช่น 16/9/2026
            day = p0;
            month = p1;
          } else {
            // ค่า default: วัน/เดือน/ปี
            day = p0;
            month = p1;
          }
        }

        if (!isNaN(day) && !isNaN(month) && !isNaN(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          let finalYear = year;
          if (year >= 2500) {
            finalYear = year - 543; // 2569 -> 2026
          } else if (year >= 50 && year < 100) {
            finalYear = (2500 + year) - 543; // 69 -> 2569 -> 2026
          } else if (year >= 0 && year < 50) {
            finalYear = 2000 + year; // 26 -> 2026
          }

          const yyyy = String(finalYear).padStart(4, '0');
          const mm = String(month).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
      }
    }

    // กรณีตัวเลขติดกัน 8 หลัก (DDMMYYYY หรือ YYYYMMDD)
    const digitsOnly = clean.replace(/\D/g, '');
    if (digitsOnly.length === 8) {
      const first4 = Number(digitsOnly.slice(0, 4));
      if (first4 >= 2000 && first4 <= 2600) {
        const year = first4 >= 2500 ? first4 - 543 : first4;
        const mm = digitsOnly.slice(4, 6);
        const dd = digitsOnly.slice(6, 8);
        return `${year}-${mm}-${dd}`;
      } else {
        const dd = digitsOnly.slice(0, 2);
        const mm = digitsOnly.slice(2, 4);
        const last4 = Number(digitsOnly.slice(4, 8));
        const year = last4 >= 2500 ? last4 - 543 : last4;
        return `${year}-${mm}-${dd}`;
      }
    }

    // กรณีตัวเลขติดกัน 6 หลัก เช่น 080969 (DDMMYY)
    if (digitsOnly.length === 6) {
      const dd = digitsOnly.slice(0, 2);
      const mm = digitsOnly.slice(2, 4);
      const yy = Number(digitsOnly.slice(4, 6));
      const year = yy >= 50 ? (2500 + yy) - 543 : 2000 + yy;
      return `${year}-${mm}-${dd}`;
    }

    // หากแปลงไม่ได้ ให้ลองใช้ safeExtractDate หรือ fallbackDate
    if (fallbackDate) {
      const extracted = CalculationService.safeExtractDate(fallbackDate);
      if (extracted) return extracted;
    }

    return clean;
  }

  /**
   * แปลง Lot No. หรือวันที่ที่สแกนจาก Emboss ให้เป็นรูปแบบ YYYY-MM-DD (ค.ศ. เช่น 2026-08-09) เสมอ พร้อมรักษารายละเอียด Roll
   */
  static formatLotNoToAD(lotStr, fallbackDate) {
    if (!lotStr && !fallbackDate) return '';
    const cleanLot = CalculationService.extractEmbossLot(lotStr) || lotStr;
    return CalculationService.formatEmbossLotForSave(cleanLot, fallbackDate);
  }

  /**
   * Helper: Generate standard report number
   */
  static generateReportNo(dateStr, shift) {
    const cleanDate = (dateStr || '').replace(/-/g, '');
    return `RPT-${cleanDate}-${(shift || 'DAY').toUpperCase()}`;
  }

  /* ========================================================================= */
  /* 🟢 SECTION 3: IPO TUBE PROCESS (PIPE SET - คำนวณขนาดท่อ/เกณฑ์ยอมรับ OK-NG) */
  /* ========================================================================= */
  /**
   * สกัดชื่อสินค้าจริง เช่น ALP6-25, ALP6-23, AS-2, AP-23, CJCIS2 จาก SyteLine Description หรือ Part No
   */
  static extractCleanProductName(description = '', partNo = '') {
    const desc = String(description || '').trim();
    const pNo = String(partNo || '').trim();
    if (/^(?:CJCIS|CJCIP|ALP6|AS-|AP-|APFR|ASFR)/i.test(pNo)) return pNo.toUpperCase();
    if (!desc) return pNo || '-';
    // จับคู่ชื่อโมเดลหลังคำว่า IPO หรือ IPO_
    const matchIpo = desc.match(/^IPO[_\s]+([A-Za-z0-9_-]+?)(?=\s*[\(\[]|\s*ID|ID|\s+T\d|\s*$)/i);
    if (matchIpo && matchIpo[1]) return matchIpo[1].trim().toUpperCase();
    const matchModel = desc.match(/\b([A-Za-z0-9]+-\d+)\b/i);
    if (matchModel && matchModel[1]) return matchModel[1].trim().toUpperCase();
    const matchCj = desc.match(/\b(CJCIS\d+|CJCIP\d+)\b/i);
    if (matchCj && matchCj[1]) return matchCj[1].trim().toUpperCase();
    const cleanPrefix = desc.replace(/^IPO[_\s]+/i, '').trim();
    const firstWord = cleanPrefix.split(/[\s(\[]/)[0];
    if (firstWord && firstWord.length <= 15) return firstWord.toUpperCase();
    return desc.length > 20 ? (pNo || desc.slice(0, 15)) : desc;
  }

  /**
   * สกัดสเปกท่อ IPO และระบุว่าเป็นท่อคู่หรือไม่ จากชื่อโมเดลหรือ Part No.
   * เช่น ALP6-23 -> spec1: '2', spec2: '3', isTwin: true
   *     ALP6-25 -> spec1: '2', spec2: '5', isTwin: true
   *     ALP6-35 -> spec1: '3', spec2: '5', isTwin: true
   *     AS-2 -> spec1: '2', spec2: '', isTwin: false
   *     ASFR-2 -> spec1: '2', spec2: '', isTwin: false
   *     AP-23 -> spec1: '2', spec2: '3', isTwin: true
   *     CJCIS2 -> spec1: '2', spec2: '', isTwin: false
   *     CJCIP23 -> spec1: '2', spec2: '3', isTwin: true
   */
  static extractIpoTubeSpecs(productName = '', partNo = '') {
    const text = `${productName} ${partNo}`.toUpperCase();

    // 1. ตรวจจับเลข 2 หลักหลัง hyphen หรือโมเดลท่อคู่ เช่น ALP6-23, ALP6-24, ALP6-25, ALP6-35, AP-23, AP-24, AP-25, AP-34, AP-35, AP-36, AP-46, APFR-23, CJCIP23
    const twinMatch = text.match(/(?:ALP6-|ALP-|AS-|AP-|ASFR-|APFR-|CJCIP)(\d)(\d)/i)
      || text.match(/\b(?:ALP6|AP|AS|CJCIP)(\d)(\d)\b/i);

    if (twinMatch) {
      return {
        isTwin: true,
        spec1: twinMatch[1],
        spec2: twinMatch[2],
        model: twinMatch[0]
      };
    }

    // 2. ตรวจจับท่อเดี่ยว เช่น AS-2, AS-3, AS-4, AS-5, AS-6, AS-7, ASFR-2, ASFR-3, CJCIS2, CJCIS3, CJCIS4, CJCIS5, CJCIS6
    const singleMatch = text.match(/(?:AS-|ASFR-|CJCIS)(\d)/i)
      || text.match(/\bAS-(\d)\b/i)
      || text.match(/\bCJCIS(\d)\b/i);

    if (singleMatch) {
      return {
        isTwin: false,
        spec1: singleMatch[1],
        spec2: '',
        model: singleMatch[0]
      };
    }

    return {
      isTwin: false,
      spec1: '',
      spec2: '',
      model: ''
    };
  }

  /**
   * ค่าเกณฑ์ยอมรับ (Tolerance) ของขนาดรูใน ID (mm.)
   * AS-2: 7 - 10 mm
   * AS-3: 10 - 13 mm
   * AS-4: 13 - 16 mm
   * AS-5: 16 - 20 mm (รองรับทั้ง 16-19 และ 17-20 ตามเอกสาร)
   * AS-6: 20 - 23 mm
   * AS-7: 22 - 26 mm
   */
  static getIpoIdTolerance(spec) {
    const s = String(spec || '').trim();
    switch (s) {
      case '2':
        return { min: 7.0, max: 10.0, label: '7 - 10 mm' };
      case '3':
        return { min: 10.0, max: 13.0, label: '10 - 13 mm' };
      case '4':
        return { min: 13.0, max: 16.0, label: '13 - 16 mm' };
      case '5':
        return { min: 16.0, max: 20.0, label: '17 - 20 mm' };
      case '6':
        return { min: 20.0, max: 23.0, label: '20 - 23 mm' };
      case '7':
        return { min: 22.0, max: 26.0, label: '22 - 26 mm' };
      default:
        return null;
    }
  }

  /**
   * ตรวจสอบว่าค่า ID อยู่ในช่วงพิกัดยอมรับหรือไม่ (null = ยังไม่ได้ระบุ)
   */
  static isIpoIdValid(val, spec) {
    if (val === undefined || val === null || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    const tol = CalculationService.getIpoIdTolerance(spec);
    if (!tol) return true;
    return num >= tol.min && num <= tol.max;
  }

  /**
   * ค่าเกณฑ์ยอมรับ (Tolerance) ของความหนา T (Thickness mm.)
   * - งานไม่มีไส้: 6 mm (ALP6-, TURKEY ไม่มีไส้, ค่า 6 +1.5 / -1.0): 5.0 - 7.5 mm
   * - งานมีไส้: 10 mm (ค่า 10 +2.0 / -1.5): 8.5 - 12.0 mm
   */
  static getIpoThicknessTolerance(productName = '', partNo = '', tubeIndex = 1, hasNoCore = null) {
    // 1. ตรวจสอบตามโหมดที่ระบุมาโดยตรง (hasNoCore: true = ไม่มีไส้, false = มีไส้)
    if (hasNoCore === true) {
      return { min: 5.0, max: 7.5, target: 6.0, tolPlus: 1.5, tolMinus: 1.0, label: '5.0 - 7.5 mm' };
    }
    if (hasNoCore === false) {
      return { min: 8.5, max: 12.0, target: 10.0, tolPlus: 2.0, tolMinus: 1.5, label: '8.5 - 12.0 mm' };
    }

    const text = `${productName} ${partNo}`.toUpperCase();
    const pNo = String(partNo || '').trim().toUpperCase();

    // 2. ตรวจสอบใน Master List ก่อน เพื่อความแม่นยำสูงสุด
    const master = IPO_MASTER_SPECS.find(m => m.partNo === pNo) ||
      IPO_MASTER_SPECS.find(m => text.includes(m.model.toUpperCase()));

    if (master) {
      if (master.hasNoCore) {
        return { min: 5.0, max: 7.5, target: 6.0, tolPlus: 1.5, tolMinus: 1.0, label: '5.0 - 7.5 mm' };
      }
      return { min: 8.5, max: 12.0, target: 10.0, tolPlus: 2.0, tolMinus: 1.5, label: '8.5 - 12.0 mm' };
    }

    // 3. รายการไม่มีไส้ (ALP6-, TURKEY, ไม่มีไส้) -> 6 mm (+1.5 / -1.0)
    if (
      text.includes('ALP6-') ||
      text.includes('TURKEY') ||
      text.includes('ไม่มีไส้') ||
      text.includes('NO CORE') ||
      text.includes('NO-CORE') ||
      text.includes('WITHOUT CORE') ||
      text.includes('T323778001') ||
      text.includes('T323778002') ||
      text.includes('T323778003') ||
      text.includes('T323778004') ||
      text.includes('T6X') ||
      text.includes('XT6') ||
      text.includes('6MM')
    ) {
      return { min: 5.0, max: 7.5, target: 6.0, tolPlus: 1.5, tolMinus: 1.0, label: '5.0 - 7.5 mm' };
    }

    // 4. งานมีไส้ทั้งหมด (เช่น AS, AP, ASFR, APFR, CJCIS, CJCIP) -> 10 mm (+2.0 / -1.5)
    return { min: 8.5, max: 12.0, target: 10.0, tolPlus: 2.0, tolMinus: 1.5, label: '8.5 - 12.0 mm' };
  }

  /**
   * ตรวจสอบว่าค่าความหนา T อยู่ในช่วงพิกัดยอมรับหรือไม่ (null = ยังไม่ได้ระบุ)
   */
  static isIpoThicknessValid(val, productName = '', partNo = '', tubeIndex = 1, hasNoCore = null) {
    if (val === undefined || val === null || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    const tol = CalculationService.getIpoThicknessTolerance(productName, partNo, tubeIndex, hasNoCore);
    if (!tol) return true;
    return num >= tol.min && num <= tol.max;
  }

  /**
   * ตรวจจับอัตโนมัติว่าชิ้นงาน "มีไส้" หรือ "ไม่มีไส้", เป็นท่อเดี่ยวหรือท่อคู่, และสเปกท่อคืออะไร
   * อ้างอิงตาม Master Table (รูปที่ 2):
   * 1. TURKEY ไม่มีไส้: T323778001-4 (ALP6-23, ALP6-24, ALP6-25, ALP6-35)
   * 2. รายการมีไส้: T323778005-12 (ASFR, APFR) และ T323814001-13 (IPO_AS, IPO_AP)
   */
  static detectIpoCoreAndTubeType(partNo = '', productName = '', description = '') {
    const pNo = String(partNo || '').trim().toUpperCase();
    const pName = String(productName || '').trim().toUpperCase();
    const desc = String(description || '').trim().toUpperCase();
    const combined = `${pNo} ${pName} ${desc}`;

    // 1. ค้นหาใน Master List ด้วย Part No
    if (pNo) {
      const found = IPO_MASTER_SPECS.find(m => m.partNo === pNo);
      if (found) {
        return {
          ...found,
          masterMatched: true,
          label: found.hasNoCore ? `TURKEY ไม่มีไส้ (${found.model})` : `งานมีไส้ (${found.model})`
        };
      }
    }

    // 2. ค้นหาใน Master List ด้วย Model Name ที่ตรงกัน
    const foundByModel = IPO_MASTER_SPECS.find(m => {
      const reg = new RegExp(`\\b${m.model}\\b`, 'i');
      return reg.test(pName) || reg.test(desc) || reg.test(pNo);
    });
    if (foundByModel) {
      return {
        ...foundByModel,
        masterMatched: true,
        label: foundByModel.hasNoCore ? `TURKEY ไม่มีไส้ (${foundByModel.model})` : `งานมีไส้ (${foundByModel.model})`
      };
    }

    // 3. Fallback Heuristics สำหรับ Part No / Description อื่นๆ:
    const isNoCoreByKeyword = combined.includes('ไม่มีไส้') ||
      combined.includes('TURKEY') ||
      combined.includes('NO CORE') ||
      combined.includes('NO-CORE') ||
      combined.includes('WITHOUT CORE') ||
      combined.includes('ALP6');

    const specs = CalculationService.extractIpoTubeSpecs(`${pName} ${desc}`, pNo);

    if (isNoCoreByKeyword) {
      return {
        partNo: pNo,
        model: specs.model || 'ALP6',
        prodName: pName || desc,
        revision: 'TURKEY ไม่มีไส้',
        hasNoCore: true,
        isTwin: specs.isTwin,
        spec1: specs.spec1 || '2',
        spec2: specs.spec2 || (specs.isTwin ? '3' : ''),
        t1: 6,
        t2: specs.isTwin ? 6 : null,
        masterMatched: false,
        label: `ไม่มีไส้ (${specs.model || 'ALP6'})`
      };
    }

    // รายการมีไส้
    return {
      partNo: pNo,
      model: specs.model || 'IPO',
      prodName: pName || desc,
      revision: 'มีไส้',
      hasNoCore: false,
      isTwin: specs.isTwin,
      spec1: specs.spec1 || '2',
      spec2: specs.spec2 || (specs.isTwin ? '3' : ''),
      t1: 10,
      t2: specs.isTwin ? 10 : null,
      masterMatched: false,
      label: `มีไส้ (${specs.model || 'IPO'})`
    };
  }

  /**
   * ตรวจสอบความถูกต้องของบาร์โค้ดวัตถุดิบ Slit เทียบกับ Finished Good Part No หรือสูตร BOM
   */
  static validateSlitMaterialScan(scannedText = '', expectedPartNo = '', bomMaterials = []) {
    if (!scannedText) return { isValid: true, details: null };
    const details = CalculationService.extractEmbossDetails(scannedText);
    const scannedMat = (details.materialNo || '').trim().toUpperCase();

    if (!scannedMat) {
      return {
        isValid: true,
        details,
        isWarning: false,
        message: 'รูปแบบปกติ (ระบุเฉพาะวันที่หรือ Lot)'
      };
    }

    // 1. ตรวจสอบกับ BOM ในระบบ SyteLine หากมีข้อมูล
    if (Array.isArray(bomMaterials) && bomMaterials.length > 0) {
      const matchBom = bomMaterials.some(b => {
        const bItem = String(b.materialItem || b.MaterialItem || b.item || '').trim().toUpperCase();
        return bItem === scannedMat || scannedMat.includes(bItem) || bItem.includes(scannedMat);
      });
      if (matchBom) {
        return {
          isValid: true,
          details,
          isWarning: false,
          message: `ตรงตามสูตร BOM วัตถุดิบ (${scannedMat})`
        };
      }
    }

    // 2. ตรวจสอบ Pattern ของ Finished Part No (เช่น T323778001 กับ P123778001)
    const expPNo = String(expectedPartNo || '').trim().toUpperCase();
    if (expPNo) {
      const cleanExpDigits = expPNo.replace(/\D/g, '');
      const cleanScannedDigits = scannedMat.replace(/\D/g, '');
      // เทียบตัวเลขหลักท้าย 6-7 หลัก
      if (cleanExpDigits.length >= 6 && cleanScannedDigits.length >= 6) {
        const expTail = cleanExpDigits.slice(-6);
        const scanTail = cleanScannedDigits.slice(-6);
        if (expTail === scanTail) {
          return {
            isValid: true,
            details,
            isWarning: false,
            message: `รหัสวัตถุดิบสอดคล้องกับชิ้นงาน (${scannedMat})`
          };
        }
      }
    }

    // หากไม่ตรงกับทั้ง BOM และ Part No ให้แจ้งเตือน แต่ไม่บล็อกกรณีสเปกพิเศษ
    return {
      isValid: true,
      details,
      isWarning: true,
      message: `โปรดตรวจสอบ: รหัสวัตถุดิบ ${scannedMat} อาจไม่ตรงกับสินค้าหลัก ${expPNo || ''}`
    };
  }
}

/* ========================================================================= */
/* 🟢 SECTION 4: IPO MASTER SPECIFICATIONS (Master Data 21 สเปกของ IPO TUBE) */
/* ========================================================================= */
/**
 * รายการ Master Table 21 รายการ (รูปที่ 2):
 * 1. TURKEY ไม่มีไส้ (T323778001 - T323778004)
 * 2. รายการมีไส้: EU SCAN (T323778005 - T323778012)
 * 3. รายการมีไส้: EU , CJC (T323814001 - T323814013)
 */
export const IPO_MASTER_SPECS = [
  // 1. TURKEY ไม่มีไส้ (4 รายการ)
  {
    partNo: 'T323778001',
    prodName: 'IPO ALP6-23(NT)ID7XT6X1000M+ID10XT6X1000',
    model: 'ALP6-23',
    revision: 'TURKEY ไม่มีไส้',
    hasNoCore: true,
    isTwin: true,
    spec1: '2',
    spec2: '3',
    t1: 6,
    t2: 6
  },
  {
    partNo: 'T323778002',
    prodName: 'IPO ALP6-24(NT) ID7XT6X900M+ID13XT6X900M',
    model: 'ALP6-24',
    revision: 'TURKEY ไม่มีไส้',
    hasNoCore: true,
    isTwin: true,
    spec1: '2',
    spec2: '4',
    t1: 6,
    t2: 6
  },
  {
    partNo: 'T323778003',
    prodName: 'IPO ALP6-25(NT) ID7XT6X800M+ID16XT6X800M',
    model: 'ALP6-25',
    revision: 'TURKEY ไม่มีไส้',
    hasNoCore: true,
    isTwin: true,
    spec1: '2',
    spec2: '5',
    t1: 6,
    t2: 6
  },
  {
    partNo: 'T323778004',
    prodName: 'IPO ALP6-35(NT)ID10XT6X800M+ID16XT6X800M',
    model: 'ALP6-35',
    revision: 'TURKEY ไม่มีไส้',
    hasNoCore: true,
    isTwin: true,
    spec1: '3',
    spec2: '5',
    t1: 6,
    t2: 6
  },

  // 2. รายการด้านล่างมีไส้: EU SCAN - ASFR ท่อเดี่ยว (4 รายการ)
  {
    partNo: 'T323778005',
    prodName: 'IPO ASFR-2-EN(NT) ID7X9TX1100M',
    model: 'ASFR-2',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: false,
    spec1: '2',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323778006',
    prodName: 'IPO ASFR-3-EN(NT) ID10X9TX1000M',
    model: 'ASFR-3',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: false,
    spec1: '3',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323778007',
    prodName: 'IPO ASFR-4-EN(NT) ID13X10TX900M',
    model: 'ASFR-4',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: false,
    spec1: '4',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323778008',
    prodName: 'IPO ASFR-5-EN(NT) ID16X10TX800M',
    model: 'ASFR-5',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: false,
    spec1: '5',
    spec2: '',
    t1: 10,
    t2: null
  },

  // 3. รายการด้านล่างมีไส้: EU SCAN - APFR ท่อคู่ (4 รายการ)
  {
    partNo: 'T323778009',
    prodName: 'IPO APFR-23-EN(NT) 7X9TX600M+10X9TX600M',
    model: 'APFR-23',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '3',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323778010',
    prodName: 'IPO APFR-24-EN(NT) 7X9TX500M+13X10TX500M',
    model: 'APFR-24',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '4',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323778011',
    prodName: 'IPO APFR-25-EN(NT) 7X9TX400M+16X10TX400M',
    model: 'APFR-25',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '5',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323778012',
    prodName: 'IPO APFR-35-EN(NT)10X9TX400M+16X10TX400M',
    model: 'APFR-35',
    revision: 'EU SCAN',
    hasNoCore: false,
    isTwin: true,
    spec1: '3',
    spec2: '5',
    t1: 10,
    t2: 10
  },

  // 4. รายการด้านล่างมีไส้: EU , CJC - IPO_AS ท่อเดี่ยว (6 รายการ)
  {
    partNo: 'T323814001',
    prodName: 'IPO_AS-2(NT) ID7XT9X1100M',
    model: 'AS-2',
    revision: 'EU , CJC ไม่มี EN',
    hasNoCore: false,
    isTwin: false,
    spec1: '2',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323814002',
    prodName: 'IPO_AS-3(NT) ID10XT9X1000M',
    model: 'AS-3',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: false,
    spec1: '3',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323814003',
    prodName: 'IPO_AS-4(NT) ID13XT10X900M',
    model: 'AS-4',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: false,
    spec1: '4',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323814004',
    prodName: 'IPO_AS-5(NT) ID16XT10X800M',
    model: 'AS-5',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: false,
    spec1: '5',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323814005',
    prodName: 'IPO_AS-6(NT) ID20XT10X800M',
    model: 'AS-6',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: false,
    spec1: '6',
    spec2: '',
    t1: 10,
    t2: null
  },
  {
    partNo: 'T323814006',
    prodName: 'IPO_AS-7(NT) ID22XT10X700M',
    model: 'AS-7',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: false,
    spec1: '7',
    spec2: '',
    t1: 10,
    t2: null
  },

  // 5. รายการด้านล่างมีไส้: EU , CJC - IPO_AP ท่อคู่ (7 รายการ)
  {
    partNo: 'T323814007',
    prodName: 'IPO_AP-23(NT) ID7XT9X600M+ID10XT9X600M',
    model: 'AP-23',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '3',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814008',
    prodName: 'IPO_AP-24(NT) ID7XT9X500M+ID13XT10X500M',
    model: 'AP-24',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '4',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814009',
    prodName: 'IPO_AP-25(NT) ID7X9TX400M+ID16X9TX400M',
    model: 'AP-25',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '2',
    spec2: '5',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814010',
    prodName: 'IPO_AP-34(NT) ID10X9TX400M+ID13X9TX400M',
    model: 'AP-34',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '3',
    spec2: '4',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814011',
    prodName: 'IPO_AP-35(NT) ID10X9TX400M+ID16X9TX400M',
    model: 'AP-35',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '3',
    spec2: '5',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814012',
    prodName: 'IPO_AP-36(NT) ID10X9TX400M+ID20X9TX400M',
    model: 'AP-36',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '3',
    spec2: '6',
    t1: 10,
    t2: 10
  },
  {
    partNo: 'T323814013',
    prodName: 'IPO_AP-46(NT) ID13X9TX400M+ID20X9TX400M',
    model: 'AP-46',
    revision: 'EU , CJC',
    hasNoCore: false,
    isTwin: true,
    spec1: '4',
    spec2: '6',
    t1: 10,
    t2: 10
  }
];

export const extractCleanProductName = CalculationService.extractCleanProductName;
export const extractIpoTubeSpecs = CalculationService.extractIpoTubeSpecs;
export const detectIpoCoreAndTubeType = CalculationService.detectIpoCoreAndTubeType;
export const validateSlitMaterialScan = CalculationService.validateSlitMaterialScan;

export const getIpoIdTolerance = CalculationService.getIpoIdTolerance;
export const getIpoThicknessTolerance = CalculationService.getIpoThicknessTolerance;
export const isIpoThicknessValid = CalculationService.isIpoThicknessValid;

