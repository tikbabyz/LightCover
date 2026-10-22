import axios from 'axios';
import { CalculationService, extractCleanProductName } from './calculationService';

const getApiBaseUrl = () => import.meta.env.VITE_API_URL || '';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

/**
 * แปลงข้อมูลจาก Frontend Job/Roll Objects ให้เป็น DTO สำหรับส่งไปยัง API (/api/ipo/save หรือ /api/ipo/update)
 */
export const convertToIpoSaveRequest = (jobData, fallbackOperator = '', isEdit = false) => {
  const rolls = Array.isArray(jobData) ? jobData : (jobData.rolls || [jobData]);
  const primaryJob = rolls[0] || jobData;

  const todayYmd = (typeof CalculationService.getCurrentDateString === 'function')
    ? CalculationService.getCurrentDateString() 
    : new Date().toISOString().split('T')[0];

  const prodDateStr = CalculationService.formatToYYYYMMDD(
    primaryJob.productionDate || primaryJob.date || primaryJob.jobDate || todayYmd
  ) || todayYmd;

  // ดึงสเปกท่อจากชื่อสินค้า/คำอธิบาย เผื่อกรณีที่ไม่ได้ระบุมาตรงๆ
  const prodTitle = (primaryJob.productName || primaryJob.prodName || '').toUpperCase();
  const descTitle = (primaryJob.description || '').toUpperCase();
  const partNoTitle = (primaryJob.partNo || '').toUpperCase();
  const isCjcis = /^CJCIS/i.test(partNoTitle);

  // ยึดตามค่า isTwinTube ที่หน้างานระบุ หรือมีข้อมูล tube2 จริง 100% ไม่ตัดคำเดาเอง
  const isTwin = primaryJob.isTwinTube !== undefined 
    ? Boolean(primaryJob.isTwinTube) 
    : Boolean(primaryJob.tube2 || primaryJob.tube2Spec);

  const validTap = (v) => (v && v !== '-' && v !== 'ไม่มีไส้') ? String(v).trim() : '';

  const isExplicitWithCore = primaryJob.hasCore === true || primaryJob.hasNoCore === false;
  const isExplicitNoCore = primaryJob.hasNoCore === true || primaryJob.hasCore === false;
  const hasSpec = Boolean(validTap(primaryJob.tube1Spec) || validTap(primaryJob.tapTube));

  const isNoCoreJob = isExplicitWithCore
    ? false
    : Boolean(
        isExplicitNoCore ||
        !hasSpec ||
        primaryJob.tapTube === '-' ||
        primaryJob.tapTube === 'ไม่มีไส้' ||
        primaryJob.tube1Spec === '-' ||
        primaryJob.tube1Spec === 'ไม่มีไส้'
      );

  const effectiveLotTap1 = (!isNoCoreJob && primaryJob.lotNoTap && primaryJob.lotNoTap !== '-')
    ? primaryJob.lotNoTap
    : (!isNoCoreJob ? (primaryJob.lotNumber || new Date().toISOString().slice(0, 10)) : '-');
  const effectiveLotTap2 = (!isNoCoreJob && isTwin)
    ? ((primaryJob.tube2LotTap && primaryJob.tube2LotTap !== '-')
        ? primaryJob.tube2LotTap
        : ((primaryJob.tube2?.lotNoTap && primaryJob.tube2.lotNoTap !== '-') ? primaryJob.tube2.lotNoTap : effectiveLotTap1))
    : '-';

  const resolvedTube1 = isNoCoreJob ? '-' : (
    validTap(primaryJob.tube1Spec) || 
    validTap(primaryJob.tubeSpec) || 
    validTap(primaryJob.tapTube) || 
    (isCjcis ? partNoTitle.replace(/\D/g, '') : null) ||
    '2'
  );

  let resolvedTube2 = null;
  if (isTwin) {
    let fallbackTube2 = '3';
    if (prodTitle.includes('25') || partNoTitle.includes('25') || descTitle.includes('5/8')) {
      fallbackTube2 = '5';
    } else if (prodTitle.includes('24') || partNoTitle.includes('24') || descTitle.includes('1/2')) {
      fallbackTube2 = '4';
    }

    resolvedTube2 = isNoCoreJob ? '-' : (
      validTap(primaryJob.tube2Spec) || 
      validTap(primaryJob.tube2?.tubeSpec) || 
      validTap(primaryJob.tube2?.tapTube) || 
      validTap(primaryJob.tube2?.embossSlit) || 
      fallbackTube2
    );
  }

  const safeNum = (v) => {
    if (v === null || v === undefined || v === '' || v === '-') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const safeIsoDate = (v, fallbackIso) => {
    if (!v) return fallbackIso;
    const d = new Date(v);
    return isNaN(d.getTime()) ? fallbackIso : d.toISOString();
  };

  // รวบรวมหมายเหตุ / KPI Downtime แต่ละรอบแบบแยกเด็ดขาด ไม่รวมกัน
  const distinctNotes = [];
  rolls.forEach((r) => {
    const n = (r.downtimeNote || r.kpiNote || '').trim();
    if (!n) return;
    const cleanNote = String(n).replace(/^(?:รอบที่|เธฃเธญเธšเธ—เธตเนˆ)\s*\d+:\s*/gim, '').trim();
    if (cleanNote && !distinctNotes.includes(cleanNote)) {
      distinctNotes.push(cleanNote);
    }
  });

  // รวบรวมรายชื่อผู้บันทึกทั้งหมดของ Job นี้ (Distinct)
  const allDistinctRecorders = [];
  rolls.forEach((r) => {
    const op = (r.operatorName || r.employeeName || r.employee_name || '').trim();
    if (op && !allDistinctRecorders.includes(op)) {
      allDistinctRecorders.push(op);
    }
  });
  if (fallbackOperator && fallbackOperator.trim() && !allDistinctRecorders.includes(fallbackOperator.trim())) {
    allDistinctRecorders.push(fallbackOperator.trim());
  }
  const resolvedAllEmployees = allDistinctRecorders.join(', ') || (primaryJob.operatorName || primaryJob.employeeName || fallbackOperator || '').trim();

  const isAnyClosed = rolls.some(r => r.status === 'CLOSED' || r.isClosed === true);

  // lot_number ของ IPO คือ วันที่ผลิตของกระบวนการ IPO เอง (Production Date)
  const prodDateExtracted = primaryJob.productionDate ? CalculationService.safeExtractDate(primaryJob.productionDate) : '';
  const jobLotExtracted = primaryJob.lotNumber ? CalculationService.safeExtractDate(primaryJob.lotNumber) : '';

  let validLotNumber = prodDateExtracted || prodDateStr || jobLotExtracted || todayYmd;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validLotNumber)) {
    validLotNumber = todayYmd;
  }

  let headDtNote = rolls.length === 1 ? (distinctNotes[0] || null) : null;
  if (!isNoCoreJob && (effectiveLotTap1 !== '-' || effectiveLotTap2 !== '-')) {
    headDtNote = (headDtNote || '').replace(/\s*\[TAP_LOT:[^\]]*\]/gi, '').trim();
    const tapTag = `[TAP_LOT: ${effectiveLotTap1} | ${effectiveLotTap2}]`;
    headDtNote = headDtNote ? `${headDtNote} ${tapTag}` : tapTag;
  } else if (isNoCoreJob && headDtNote) {
    headDtNote = headDtNote.replace(/\s*\[TAP_LOT:[^\]]*\]/gi, '').trim() || null;
  }

  const head = {
    job: (primaryJob.jobNo || primaryJob.job || '').trim(),
    partNo: (primaryJob.partNo || '').trim(),
    description: (primaryJob.description || '').trim(),
    lotNumber: validLotNumber,
    employeeName: resolvedAllEmployees,
    prodName: (extractCleanProductName(primaryJob.productName || primaryJob.prodName || primaryJob.description, primaryJob.partNo) || primaryJob.productName || primaryJob.prodName || '').trim(),
    tube1Spec: resolvedTube1 || '-',
    tube2Spec: resolvedTube2,
    downtimeNote: headDtNote,
    status: isAnyClosed ? 'CLOSED' : (primaryJob.status || (primaryJob.isClosed ? 'CLOSED' : 'IN_PROGRESS')),
    createdAt: safeIsoDate(primaryJob.createdAt, new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };

  const details = [];
  const temperatures = [];
  const defects = [];
  const tube1List = [];
  const tube2List = [];

  // หากเป็นคำสั่งอัปเดตเฉพาะสถานะ Job โดยไม่มีข้อมูลม้วนงานจริง ไม่ต้องสร้างแถวลูกหลอก (เพื่อป้องกันการลบตารางลูกในฐานข้อมูล)
  const isJobLevelUpdateOnly = rolls.length === 1 && !rolls[0].id && !rolls[0].startTime && !rolls[0].productQty && (rolls[0].status || rolls[0].isClosed !== undefined);

  if (!isJobLevelUpdateOnly) {
    rolls.forEach((r, idx) => {
    const runNo = r.runNo || r.sequenceNo || r.rollNo || (idx + 1);
    const nowIso = safeIsoDate(r.createdAt, new Date(Date.now() + idx * 50).toISOString());

    // 1. Detail - บันทึก Downtime Note แยกเฉพาะรอบของตัวเอง พร้อมชื่อผู้บันทึกประจำรอบ
    let rollDtNote = String(r.downtimeNote || r.kpiNote || '').replace(/^(?:รอบที่|เธฃเธญเธšเธ—เธตเนˆ)\s*\d+:\s*/gim, '').trim();
    if (!isNoCoreJob && (effectiveLotTap1 !== '-' || effectiveLotTap2 !== '-')) {
      rollDtNote = rollDtNote.replace(/\s*\[TAP_LOT:[^\]]*\]/gi, '').trim();
      const tapTag = `[TAP_LOT: ${effectiveLotTap1} | ${effectiveLotTap2}]`;
      rollDtNote = rollDtNote ? `${rollDtNote} ${tapTag}` : tapTag;
    } else if (isNoCoreJob) {
      rollDtNote = rollDtNote.replace(/\s*\[TAP_LOT:[^\]]*\]/gi, '').trim();
    }
    const rawSlit1 = (r.lotNoSlit || r.lotSlit || r.lotNoEmboss || r.embossLot || r.rawLotNo || '').trim();
    const rawSlit2 = (r.tube2?.lotNoSlit || r.tube2?.lotSlit || r.tube2LotNoSlit || r.tube2LotSlit || r.tube2?.lotNoEmboss || r.tube2LotEmboss || '').trim();

    const parsed1 = CalculationService.extractEmbossDetails(rawSlit1);
    const parsed2 = CalculationService.extractEmbossDetails(rawSlit2);

    const cleanSlit1 = parsed1.lotDate || rawSlit1.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || rawSlit1;
    const cleanSlit2 = parsed2.lotDate || rawSlit2.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || rawSlit2;

    const rollSlit1Val = (r.rollSlit !== undefined && r.rollSlit !== null && r.rollSlit !== '') 
      ? String(r.rollSlit).trim() 
      : (parsed1.rollNo || null);
    const totalRollSlit1Val = (r.totalRollSlit !== undefined && r.totalRollSlit !== null && r.totalRollSlit !== '') 
      ? String(r.totalRollSlit).trim() 
      : (parsed1.totalRolls || null);

    const rollSlit2Val = (r.tube2?.rollSlit !== undefined && r.tube2?.rollSlit !== null && r.tube2?.rollSlit !== '') 
      ? String(r.tube2.rollSlit).trim() 
      : ((r.tube2RollSlit !== undefined && r.tube2RollSlit !== null && r.tube2RollSlit !== '') 
          ? String(r.tube2RollSlit).trim() 
          : (parsed2.rollNo || null));
    const totalRollSlit2Val = (r.tube2?.totalRollSlit !== undefined && r.tube2?.totalRollSlit !== null && r.tube2?.totalRollSlit !== '') 
      ? String(r.tube2.totalRollSlit).trim() 
      : ((r.tube2TotalRollSlit !== undefined && r.tube2TotalRollSlit !== null && r.tube2TotalRollSlit !== '') 
          ? String(r.tube2TotalRollSlit).trim() 
          : (parsed2.totalRolls || null));

    const rollLotSlit = (isTwin && cleanSlit2 && cleanSlit2 !== cleanSlit1)
      ? `${cleanSlit1} / ${cleanSlit2}`
      : cleanSlit1;

    const rollLotTap1 = (!isNoCoreJob && (r.lotNoTap || r.lotTap))
      ? String(r.lotNoTap || r.lotTap).trim()
      : effectiveLotTap1;
    const rollLotTap2 = (!isNoCoreJob && isTwin)
      ? String(r.tube2?.lotNoTap || r.tube2LotTap || r.lotTap2 || effectiveLotTap2).trim()
      : (isNoCoreJob ? '-' : null);

    details.push({
      job: head.job,
      runNo: runNo,
      lotSlit: rollLotSlit,
      lotEmboss: rollLotSlit, // คงไว้สำหรับ backward-compatibility
      lotTap: rollLotTap1 || null,
      lotTap2: rollLotTap2 || null,
      lotSlit2: cleanSlit2 || null,
      rollSlit: rollSlit1Val,
      totalRollSlit: totalRollSlit1Val,
      rollSlit2: rollSlit2Val,
      totalRollSlit2: totalRollSlit2Val,
      startTime: (r.startTime || '').trim(),
      endTime: (r.endTime || '').trim(),
      totalMeters: safeNum(r.productQty || r.productedQty || r.totalMeters),
      downtimeNote: rollDtNote || null,
      employeeName: (r.operatorName || r.employeeName || fallbackOperator || '').trim(),
      createdAt: nowIso
    });

    // 2. Temperature
    temperatures.push({
      job: head.job,
      detailRunNo: runNo,
      speed: safeNum(r.speed),
      temp1: safeNum(r.temp1),
      temp2: safeNum(r.temp2),
      temp3: safeNum(r.temp3),
      temp4: safeNum(r.temp4),
      tempPipe: safeNum(r.tempPipe),
      createdAt: nowIso
    });

    // 3. Defect (บันทึกของเสียตามม้วนที่ระบุ)
    const def = r.defects || {};
    defects.push({
      job: head.job,
      detailRunNo: runNo,
      settingMachine: safeNum(def.setting || def.settingMachine),
      jointIpo: safeNum(def.jointIpo),
      splitSeam: safeNum(def.splitSeam),
      dimensionNg: safeNum(def.dimNg || def.dimensionNg),
      foamDetached: safeNum(def.foamDetached),
      jointMark: safeNum(def.jointMark),
      thickNg: safeNum(def.thickNg),
      filmBlemish: safeNum(def.filmBlemish),
      otherNg: safeNum(def.otherNg)
    });

    // 4. Tube1
    tube1List.push({
      job: head.job,
      detailRunNo: runNo,
      insideDia1: safeNum(r.id1),
      insideDia2: safeNum(r.id2),
      insideDiaAvg: safeNum(r.idAvg),
      thickness1: safeNum(r.t1),
      thickness2: safeNum(r.t2),
      thickness3: safeNum(r.t3),
      thickness4: safeNum(r.t4),
      thicknessAvg: safeNum(r.tAvg),
      judgement: (r.judgement || 'OK').trim(),
      createdAt: nowIso
    });

    // 5. Tube2 (ถ้ามีข้อมูลท่อที่ 2 และเป็นงานท่อคู่)
    if (isTwin && (r.tube2 || head.tube2Spec)) {
      const t2 = r.tube2 || {};
      tube2List.push({
        job: head.job,
        detailRunNo: runNo,
        insideDia1: safeNum(t2.id1),
        insideDia2: safeNum(t2.id2),
        insideDiaAvg: safeNum(t2.idAvg),
        thickness1: safeNum(t2.t1),
        thickness2: safeNum(t2.t2),
        thickness3: safeNum(t2.t3),
        thickness4: safeNum(t2.t4),
        thicknessAvg: safeNum(t2.tAvg),
        judgement: t2.judgement ? t2.judgement.trim() : null,
        createdAt: nowIso
      });
    }
  });
  }

  return {
    head,
    details,
    temperatures,
    defects,
    tube1List,
    tube2List,
    isEdit
  };
};

export const IpoService = {
  /**
   * ค้นหา Job จาก SyteLine (LiveApp)
   */
  async searchSyteLineJob(jobNumber) {
    if (!jobNumber) return [];
    const url = `${getApiBaseUrl()}/api/ipo/job/${encodeURIComponent(jobNumber.trim())}`;
    const res = await axios.get(url, { headers: getAuthHeaders(), timeout: 8000 });
    return Array.isArray(res.data) ? res.data : [res.data];
  },

  /**
   * ค้นหา BOM (สูตรวัตถุดิบ) จาก SyteLine ตาม Part No.
   */
  async getItemBom(item) {
    if (!item) return [];
    const url = `${getApiBaseUrl()}/api/ipo/bom/${encodeURIComponent(item.trim())}`;
    const res = await axios.get(url, { headers: getAuthHeaders(), timeout: 8000 });
    return Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
  },

  /**
   * ดึงรายการ Job ทั้งหมด หรือตามฟิลเตอร์ (วันที่, คำค้นหา)
   */
  async getFullJobs(params = {}) {
    const url = `${getApiBaseUrl()}/api/ipo/full`;
    const res = await axios.get(url, {
      params,
      headers: getAuthHeaders(),
      timeout: 10000
    });
    return Array.isArray(res.data) ? res.data : [];
  },

  /**
   * ดึงข้อมูล 1 Job แบบครบทุกตาราง
   */
  async getJobByNo(jobNumber) {
    if (!jobNumber) return null;
    try {
      const url = `${getApiBaseUrl()}/api/ipo/${encodeURIComponent(jobNumber.trim())}`;
      const res = await axios.get(url, { headers: getAuthHeaders(), timeout: 8000 });
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) {
        return null;
      }
      throw err;
    }
  },

  /**
   * บันทึกข้อมูล Job (POST /api/ipo/save หรือ PUT /api/ipo/update)
   */
  async saveJob(jobData, fallbackOperator = '', isEdit = false) {
    const payload = convertToIpoSaveRequest(jobData, fallbackOperator, isEdit);
    const apiBase = getApiBaseUrl();
    const endpoint = isEdit ? `${apiBase}/api/ipo/update` : `${apiBase}/api/ipo/save`;

    const res = isEdit
      ? await axios.put(endpoint, payload, { headers: getAuthHeaders(), timeout: 12000 })
      : await axios.post(endpoint, payload, { headers: getAuthHeaders(), timeout: 12000 });

    return res.data;
  },

  /**
   * ลบ Job ทั้งหมดออกจากระบบ (Head + ทุก Child tables)
   */
  async deleteJob(jobNumber) {
    if (!jobNumber) return false;
    const cleanJob = jobNumber.trim();
    const url = `${getApiBaseUrl()}/api/ipo?job=${encodeURIComponent(cleanJob)}`;
    const res = await axios.delete(url, { headers: getAuthHeaders(), timeout: 10000 });
    return res.data;
  },

  /**
   * ลบเฉพาะรอบการผลิตที่ระบุ (Run No) ของ Job นั้นๆ ออกจากระบบ
   */
  async deleteRoll(jobNumber, runNo) {
    if (!jobNumber || !runNo) return false;
    const cleanJob = jobNumber.trim();
    const url = `${getApiBaseUrl()}/api/ipo/${encodeURIComponent(cleanJob)}/roll/${encodeURIComponent(runNo)}`;
    const res = await axios.delete(url, { headers: getAuthHeaders(), timeout: 10000 });
    return res.data;
  },

  /**
   * สรุปรายงานสถิติการผลิตประจำเดือน / ช่วงวันที่ จาก SQL Server API
   */
  async getSummaryReport(startDate = '', endDate = '') {
    const apiBase = getApiBaseUrl();
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await axios.get(`${apiBase}/api/ipo/summary-report${queryString}`, {
      headers: getAuthHeaders(),
      timeout: 10000
    });
    return res.data;
  }
};

export default IpoService;
