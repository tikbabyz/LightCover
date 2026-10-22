import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { CalculationService } from '../services/calculationService';
import { getLoggedInUser, getDisplayNameFromUser } from './SlitContext';
import { IpoService } from '../services/ipoService';

/**
 * =============================================================================
 * IpoTubeContext: ศูนย์กลางจัดการ State ข้อมูลการผลิต IPO TUBE
 * =============================================================================
 * เชื่อมต่อกับ SQL Server (Database IIT_DB) ผ่าน IpoService
 * พร้อมระบบแคชสำรองบน LocalStorage เพื่อการทำงานที่รวดเร็วและรองรับออฟไลน์
 * =============================================================================
 */

export const LOCAL_STORAGE_IPO_SESSION_KEY = 'ipo_tube_production_session_v1';
export const LOCAL_STORAGE_IPO_JOBS_KEY = 'ipo_tube_production_jobs_v1';

import { parseDowntimeMinutesFromNote, extractLostTimeAndGeneralNote } from '../utils/downtimeUtils';
export { parseDowntimeMinutesFromNote, extractLostTimeAndGeneralNote };

export const renumberIpoJobsByDate = (jobList) => {
  if (!Array.isArray(jobList)) return [];
  const groups = {};
  const dateOrder = [];

  const parseTimeToMins = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 9999;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
    return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : 9999;
  };

  jobList.forEach((job) => {
    if (!job) return;
    const d = CalculationService.safeExtractDate(job) || 'unknown';
    if (!groups[d]) {
      groups[d] = [];
      dateOrder.push(d);
    }
    groups[d].push(job);
  });

  const result = [];
  dateOrder.forEach((d) => {
    const dailyJobs = groups[d] || [];

    // จัดกลุ่มตาม Job ก่อน เพื่อให้แต่ละ Job อยู่ด้วยกันเป็นกลุ่มชัดเจน
    const jobsByJobNo = {};
    const jobOrder = [];

    dailyJobs.forEach((r) => {
      const jKey = (r.jobNo || r.job || '').trim().toUpperCase() || 'UNKNOWN';
      if (!jobsByJobNo[jKey]) {
        jobsByJobNo[jKey] = [];
        jobOrder.push(jKey);
      }
      jobsByJobNo[jKey].push(r);
    });

    // ภายในแต่ละ Job เรียงรอบการผลิตตาม startTime จากเช้าไปบ่าย (หรือตาม runNo)
    jobOrder.forEach((jKey) => {
      jobsByJobNo[jKey].sort((a, b) => {
        const tA = parseTimeToMins(a.startTime);
        const tB = parseTimeToMins(b.startTime);
        if (tA !== tB) return tA - tB;
        const rA = Number(a.runNo || a.rollNo || a.sequenceNo || 0);
        const rB = Number(b.runNo || b.rollNo || b.sequenceNo || 0);
        if (rA !== rB && rA > 0 && rB > 0) return rA - rB;
        return (new Date(a.createdAt || 0).getTime() || 0) - (new Date(b.createdAt || 0).getTime() || 0);
      });
    });

    // เรียงลำดับระหว่างแต่ละ Job ตามเวลาเริ่มผลิตแรกสุดของ Job นั้นๆ
    jobOrder.sort((keyA, keyB) => {
      const firstA = jobsByJobNo[keyA][0];
      const firstB = jobsByJobNo[keyB][0];
      const tA = parseTimeToMins(firstA?.startTime);
      const tB = parseTimeToMins(firstB?.startTime);
      if (tA !== tB) return tA - tB;
      return (new Date(firstA?.createdAt || 0).getTime() || 0) - (new Date(firstB?.createdAt || 0).getTime() || 0);
    });

    let overallIdx = 1;
    jobOrder.forEach((jKey) => {
      const rolls = jobsByJobNo[jKey];
      rolls.forEach((job, rIdx) => {
        result.push({
          ...job,
          sequenceNo: overallIdx++,
          runNo: Number(job.runNo || job.rollNo || (rIdx + 1))
        });
      });
    });
  });
  return result;
};

/**
 * แปลงข้อมูล Full Job จาก Database Server ให้เป็นรายการม้วน (Rolls) สำหรับแสดงใน UI
 */
export const mapServerJobsToUiRolls = (serverJobs) => {
  if (!Array.isArray(serverJobs)) return [];
  const flattened = [];

  serverJobs.forEach((rawJob) => {
    if (!rawJob) return;
    const job = rawJob.head ? { ...rawJob.head, ...rawJob } : rawJob;
    if (job.details && job.details.length > 0) {
      job.details.forEach((d, dIdx) => {
        const runNum = d.runNo || d.detailRunNo || (dIdx + 1);
        const temp = (job.temperatures || []).find((t) => (t.detailRunNo || t.runNo) === runNum) || (job.temperatures || [])[dIdx] || {};
        const def = (job.defects || []).find((df) => (df.detailRunNo || df.runNo) === runNum) || (job.defects || [])[dIdx] || {};
        const t1 = (job.tube1List || []).find((t) => (t.detailRunNo || t.runNo) === runNum) || (job.tube1List || [])[dIdx] || {};
        const t2 = (job.tube2List || []).find((t) => (t.detailRunNo || t.runNo) === runNum) || (job.tube2List || [])[dIdx] || {};

        const totalDefect = (Number(def.settingMachine) || 0) + (Number(def.jointIpo) || 0) + (Number(def.splitSeam) || 0) +
          (Number(def.dimensionNg) || 0) + (Number(def.foamDetached) || 0) + (Number(def.jointMark) || 0) +
          (Number(def.thickNg) || 0) + (Number(def.filmBlemish) || 0) + (Number(def.otherNg) || 0);

        const mQty = Number(d.totalMeters) || 0;

        let calcTotalTime = '';
        if (d.startTime && d.endTime) {
          try {
            const [sH, sM] = d.startTime.split(':').map(Number);
            const [eH, eM] = d.endTime.split(':').map(Number);
            if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
              let diffM = (eH * 60 + eM) - (sH * 60 + sM);
              if (diffM < 0) diffM += 24 * 60;
              const h = Math.floor(diffM / 60);
              const m = diffM % 60;
              calcTotalTime = h > 0 && m > 0 ? `${h} ชม. ${m} นาที` : (h > 0 ? `${h} ชม.` : `${m} นาที`);
            }
          } catch {
            // ignore
          }
        }

        const stdLen = Number(job.stdLength) || 200;
        const calcRolls = stdLen > 0 ? (Math.ceil(mQty / stdLen) || 1) : 1;
        const dateStr = CalculationService.safeExtractDate(job.productionDate || job.date || job.createdAt || job.lotNumber);
        let rawLot1 = d.lotSlit || d.lotEmboss || job.lotNoSlit || job.lotNoEmboss || d.embossLot || '';
        let rawLot2 = job.tube2?.lotNoSlit || job.tube2?.lotSlit || job.tube2LotNoSlit || job.tube2LotSlit || job.tube2?.lotNoEmboss || job.tube2LotEmboss || '';

        if (rawLot1 && typeof rawLot1 === 'string' && (rawLot1.includes(' / ') || rawLot1.includes('|'))) {
          const delim = rawLot1.includes(' / ') ? ' / ' : '|';
          const parts = rawLot1.split(delim);
          rawLot1 = parts[0]?.trim() || '';
          if (!rawLot2) rawLot2 = parts[1]?.trim() || '';
        }

        const serverLotTap1 = String(d.lotTap || d.lot_tap || '').trim();
        const serverLotTap2 = String(d.lotTap2 || d.lot_tap_2 || '').trim();
        const serverLotSlit2 = String(d.lotSlit2 || d.lot_slit_2 || '').trim();

        const serverRollSlit1 = String(d.rollSlit !== undefined && d.rollSlit !== null ? d.rollSlit : (d.roll_slit !== undefined && d.roll_slit !== null ? d.roll_slit : (cachedRoll?.rollSlit || cachedRoll?.roll_slit || ''))).trim();
        const serverTotalRollSlit1 = String(d.totalRollSlit !== undefined && d.totalRollSlit !== null ? d.totalRollSlit : (d.total_roll_slit !== undefined && d.total_roll_slit !== null ? d.total_roll_slit : (cachedRoll?.totalRollSlit || cachedRoll?.total_roll_slit || ''))).trim();

        const serverRollSlit2 = String(d.rollSlit2 !== undefined && d.rollSlit2 !== null ? d.rollSlit2 : (d.roll_slit_2 !== undefined && d.roll_slit_2 !== null ? d.roll_slit_2 : (cachedRoll?.tube2?.rollSlit || cachedRoll?.tube2RollSlit || ''))).trim();
        const serverTotalRollSlit2 = String(d.totalRollSlit2 !== undefined && d.totalRollSlit2 !== null ? d.totalRollSlit2 : (d.total_roll_slit_2 !== undefined && d.total_roll_slit_2 !== null ? d.total_roll_slit_2 : (cachedRoll?.tube2?.totalRollSlit || cachedRoll?.tube2TotalRollSlit || ''))).trim();

        const parsedLotDetails1 = CalculationService.extractEmbossDetails(rawLot1);
        const resolvedRollSlit1 = serverRollSlit1 || parsedLotDetails1.rollNo || '';
        const resolvedTotalRollSlit1 = serverTotalRollSlit1 || parsedLotDetails1.totalRolls || '';
        const resolvedLot = parsedLotDetails1.lotDate || rawLot1.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || rawLot1;

        const resolvedRawLot2 = serverLotSlit2 || rawLot2;
        const parsedLotDetails2 = CalculationService.extractEmbossDetails(resolvedRawLot2);
        const resolvedRollSlit2 = serverRollSlit2 || parsedLotDetails2.rollNo || '';
        const resolvedTotalRollSlit2 = serverTotalRollSlit2 || parsedLotDetails2.totalRolls || '';
        const resolvedLot2 = parsedLotDetails2.lotDate || (resolvedRawLot2 ? resolvedRawLot2.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() : '');

        const rawNote = String((d.downtimeNote !== undefined && d.downtimeNote !== null && d.downtimeNote !== '') 
          ? d.downtimeNote 
          : (job.details?.length === 1 ? (job.downtimeNote || '') : '')).trim();
        const tapMatch = rawNote.match(/\[TAP_LOT:\s*([^\|\]]+)\s*\|\s*([^\]]+)\]/i);
        const parsedTap1 = tapMatch ? tapMatch[1].trim() : '';
        const parsedTap2 = tapMatch ? tapMatch[2].trim() : '';

        // Check local cache for fallback
        const cachedJobs = getStoredIpoJobs();
        const cachedRoll = cachedJobs.find(c => 
          (c.jobNo || c.job || '').trim() === (job.jobNo || job.job || '').trim() && 
          Number(c.runNo || c.sequenceNo || 0) === Number(runNum)
        );

        const hasValidTapVal = (v) => Boolean(v && v !== '-' && v !== 'ไม่มีไส้');
        const detectedMaster = CalculationService.detectIpoCoreAndTubeType(job.partNo, job.productName || job.prodName || job.description, job.description);
        const isExplicitWithCore = job.hasCore === true || job.hasNoCore === false || cachedRoll?.hasCore === true || cachedRoll?.hasNoCore === false || (detectedMaster.masterMatched && !detectedMaster.hasNoCore);
        const isExplicitNoCore = job.hasNoCore === true || job.hasCore === false || cachedRoll?.hasNoCore === true || (detectedMaster.masterMatched && detectedMaster.hasNoCore);
        const hasCoreSpec = hasValidTapVal(job.tube1Spec) || hasValidTapVal(job.tapTube) || hasValidTapVal(cachedRoll?.tapTube) || hasValidTapVal(cachedRoll?.tube1Spec);

        const isNoCoreJob = isExplicitWithCore
          ? false
          : Boolean(
              isExplicitNoCore ||
              !hasCoreSpec ||
              job.tube1Spec === '-' ||
              job.tapTube === '-' ||
              job.tube1Spec === 'ไม่มีไส้' ||
              job.tapTube === 'ไม่มีไส้'
            );

        const resolvedLotTap1 = isNoCoreJob
          ? '-'
          : ((serverLotTap1 && serverLotTap1 !== '-')
              ? serverLotTap1
              : ((parsedTap1 && parsedTap1 !== '-')
                  ? parsedTap1
                  : ((job.lotNoTap && job.lotNoTap !== '-' && job.lotNoTap !== 'ไม่มีไส้')
                      ? job.lotNoTap
                      : ((cachedRoll?.lotNoTap && cachedRoll.lotNoTap !== '-' && cachedRoll.lotNoTap !== 'ไม่มีไส้')
                          ? cachedRoll.lotNoTap
                          : (job.lotNumber || dateStr)))));

        const resolvedLotTap2 = isNoCoreJob
          ? '-'
          : ((serverLotTap2 && serverLotTap2 !== '-')
              ? serverLotTap2
              : ((parsedTap2 && parsedTap2 !== '-')
                  ? parsedTap2
                  : ((job.tube2LotTap && job.tube2LotTap !== '-' && job.tube2LotTap !== 'ไม่มีไส้')
                      ? job.tube2LotTap
                      : ((job.tube2?.lotNoTap && job.tube2.lotNoTap !== '-' && job.tube2.lotNoTap !== 'ไม่มีไส้')
                          ? job.tube2.lotNoTap
                          : ((cachedRoll?.tube2LotTap && cachedRoll.tube2LotTap !== '-' && cachedRoll.tube2LotTap !== 'ไม่มีไส้')
                              ? cachedRoll.tube2LotTap
                              : ((cachedRoll?.tube2?.lotNoTap && cachedRoll.tube2.lotNoTap !== '-' && cachedRoll.tube2.lotNoTap !== 'ไม่มีไส้')
                                  ? cachedRoll.tube2.lotNoTap
                                  : resolvedLotTap1))))));

        const cleanNoteText = rawNote.replace(/\s*\[TAP_LOT:[^\]]*\]/gi, '').replace(/^(?:รอบที่|เธฃเธญเธšเธ—เธตเนˆ)\s*\d+:\s*/gim, '').trim();

        // ตรวจสอบว่าม้วนงานนี้เป็นงานท่อคู่ (Twin Tube) หรือไม่
        const hasServerT2Spec = Boolean(job.tube2Spec && job.tube2Spec !== '-' && String(job.tube2Spec).trim() !== '');
        const hasServerT2Data = Boolean(
          (t2 && (t2.insideDia1 != null || t2.insideDiaAvg != null || t2.thickness1 != null || t2.thicknessAvg != null || (t2.judgement && t2.judgement !== ''))) ||
          (job.tube2List && job.tube2List.length > 0 && job.tube2List.some(x => (x.detailRunNo || x.runNo) === runNum && (x.insideDia1 != null || x.thickness1 != null)))
        );

        const isTwinModel = detectedMaster.masterMatched 
          ? Boolean(detectedMaster.isTwin) 
          : Boolean(CalculationService.extractIpoTubeSpecs(job.productName || job.prodName || job.description, job.partNo).isTwin);

        const hasCachedTwinData = Boolean(
          (cachedRoll?.tube2Spec && cachedRoll.tube2Spec !== '-' && String(cachedRoll.tube2Spec).trim() !== '') ||
          (typeof job.tube2 === 'object' && job.tube2 && (
            (job.tube2.tubeSpec && job.tube2.tubeSpec !== '-') ||
            (job.tube2.tapTube && job.tube2.tapTube !== '-') ||
            (job.tube2.embossSlit && job.tube2.embossSlit !== '-') ||
            job.tube2.id1 != null || job.tube2.t1 != null
          ))
        );

        // ถ้าไม่มีข้อมูล TUBE 2 ใน Server และไม่ใช่โมเดลท่อคู่ ให้ถือเป็นท่อเดี่ยวเด็ดขาด (ป้องกัน Cache เก่าค้าง)
        const isExplicitSingle = job.isTwinTube === false || cachedRoll?.isTwinTube === false || (!isTwinModel && !hasServerT2Spec && !hasServerT2Data);

        const isTwinJob = isExplicitSingle 
          ? false 
          : (hasServerT2Data || hasServerT2Spec || (job.isTwinTube === true || cachedRoll?.isTwinTube === true) || (isTwinModel && hasCachedTwinData) || isTwinModel);

        const resolvedTube2Spec = isTwinJob
          ? (isNoCoreJob 
              ? '-' 
              : ((job.tube2Spec && job.tube2Spec !== '-' && job.tube2Spec !== 'ไม่มีไส้') 
                  ? job.tube2Spec 
                  : ((cachedRoll?.tube2Spec && cachedRoll.tube2Spec !== '-' && cachedRoll.tube2Spec !== 'ไม่มีไส้') 
                      ? cachedRoll.tube2Spec 
                      : (detectedMaster.spec2 || CalculationService.extractIpoTubeSpecs(job.productName || job.prodName || job.description, job.partNo).spec2 || '3'))))
          : '';

        flattened.push({
          ...job,
          id: `${job.jobNo || job.job}_${runNum}`,
          headId: job.id,
          jobNo: job.jobNo || job.job || '',
          job: job.jobNo || job.job || '',
          partNo: job.partNo || '',
          productName: CalculationService.extractCleanProductName(job.productName || job.prodName || job.description, job.partNo) || job.productName || job.prodName || job.partNo || '',
          prodName: CalculationService.extractCleanProductName(job.productName || job.prodName || job.description, job.partNo) || job.productName || job.prodName || job.partNo || '',
          date: dateStr,
          productionDate: dateStr,
          lotNumber: job.lotNumber || dateStr,
          createdAt: d.createdAt || job.createdAt,
          sequenceNo: runNum,
          runNo: runNum,
          rollNo: runNum,
          lotNoSlit: resolvedLot,
          lotSlit: resolvedLot,
          lotNoEmboss: resolvedLot,
          embossLot: resolvedLot,
          rollSlit: resolvedRollSlit1,
          totalRollSlit: resolvedTotalRollSlit1,
          roll_slit: resolvedRollSlit1,
          total_roll_slit: resolvedTotalRollSlit1,
          startTime: d.startTime || '',
          endTime: d.endTime || '',
          totalTime: calcTotalTime,
          productQty: mQty,
          productedQty: mQty,
          totalMeters: mQty,
          stdLength: stdLen,
          rollCount: calcRolls,
          hasNoCore: isNoCoreJob,
          hasCore: !isNoCoreJob,
          tapTube: isNoCoreJob ? '-' : ((job.tube1Spec && job.tube1Spec !== '-' && job.tube1Spec !== 'ไม่มีไส้' ? job.tube1Spec : '') || (job.tapTube && job.tapTube !== '-' && job.tapTube !== 'ไม่มีไส้' ? job.tapTube : '') || (cachedRoll?.tapTube && cachedRoll.tapTube !== '-' ? cachedRoll.tapTube : '') || '2'),
          tube1Spec: isNoCoreJob ? '-' : ((job.tube1Spec && job.tube1Spec !== '-' && job.tube1Spec !== 'ไม่มีไส้' ? job.tube1Spec : '') || '2'),
          tube2Spec: resolvedTube2Spec,
          embossSlit: (((job.embossSlit && !String(job.embossSlit).includes('-') && !String(job.embossSlit).includes('/') && String(job.embossSlit).length <= 5) ? job.embossSlit : '')
            || ((d.embossSlit && !String(d.embossSlit).includes('-') && !String(d.embossSlit).includes('/') && String(d.embossSlit).length <= 5) ? d.embossSlit : '')
            || (job.tube1Spec && hasValidTapVal(job.tube1Spec) ? job.tube1Spec : '')
            || '2'),
          lotNoTap: resolvedLotTap1,
          downtimeNote: cleanNoteText,
          ...(() => {
            const parsedLoss = extractLostTimeAndGeneralNote(cleanNoteText);
            const dtMin = Number(d.downtimeMinutes || (job.details?.length === 1 ? (job.downtimeMinutes || 0) : 0)) || (parsedLoss.lostTimeMinutes + parseDowntimeMinutesFromNote(parsedLoss.generalNote)) || 0;
            return {
              lostTimeStart: d.lostTimeStart || parsedLoss.lostTimeStart || '',
              lostTimeEnd: d.lostTimeEnd || parsedLoss.lostTimeEnd || '',
              lostTimeReason: d.lostTimeReason || parsedLoss.lostTimeReason || '',
              lostTimeMinutes: Number(d.lostTimeMinutes) || parsedLoss.lostTimeMinutes || 0,
              generalNote: d.generalNote || parsedLoss.generalNote || '',
              downtimeMinutes: dtMin
            };
          })(),
          operatorName: (d.employeeName || d.operatorName || job.employeeName || job.employee_name || job.operatorName || job.operator || '').trim(),
          employeeName: (d.employeeName || d.operatorName || job.employeeName || job.employee_name || job.operatorName || job.operator || '').trim(),
          shift: (job.shift || job.shiftName || 'A').trim(),
          speed: temp.speed,
          temp1: temp.temp1,
          temp2: temp.temp2,
          temp3: temp.temp3,
          temp4: temp.temp4,
          tempPipe: temp.tempPipe,
          defects: {
            setting: def.settingMachine,
            jointIpo: def.jointIpo,
            splitSeam: def.splitSeam,
            dimNg: def.dimensionNg,
            foamDetached: def.foamDetached,
            jointMark: def.jointMark,
            thickNg: def.thickNg,
            filmBlemish: def.filmBlemish,
            otherNg: def.otherNg
          },
          defectMeters: totalDefect,
          ng: totalDefect,
          id1: t1.insideDia1,
          id2: t1.insideDia2,
          idAvg: t1.insideDiaAvg,
          t1: t1.thickness1,
          t2: t1.thickness2,
          t3: t1.thickness3,
          t4: t1.thickness4,
          tAvg: t1.thicknessAvg,
          judgement: t1.judgement || 'OK',
          isTwinTube: isTwinJob,
          tube2: isTwinJob ? {
            tapTube: isNoCoreJob ? '-' : (resolvedTube2Spec || t2.tapTube || (typeof job.tube2 === 'object' && job.tube2?.tapTube) || (cachedRoll?.tube2?.tapTube && cachedRoll.tube2.tapTube !== '-' ? cachedRoll.tube2.tapTube : '') || '3'),
            embossSlit: resolvedTube2Spec || (typeof job.tube2 === 'object' && job.tube2?.embossSlit) || job.embossSlit || '3',
            lotNoTap: resolvedLotTap2,
            lotNoSlit: resolvedLot2 || '',
            lotSlit: resolvedLot2 || '',
            lotNoEmboss: resolvedLot2 || '',
            rollSlit: resolvedRollSlit2,
            totalRollSlit: resolvedTotalRollSlit2,
            roll_slit: resolvedRollSlit2,
            total_roll_slit: resolvedTotalRollSlit2,
            id1: t2.insideDia1,
            id2: t2.insideDia2,
            idAvg: t2.insideDiaAvg,
            t1: t2.thickness1,
            t2: t2.thickness2,
            t3: t2.thickness3,
            t4: t2.thickness4,
            tAvg: t2.thicknessAvg,
            judgement: t2.judgement || 'OK'
          } : null
        });
      });
    } else {
      flattened.push({
        ...job,
        productQty: job.totalMeters || 0,
        productedQty: job.totalMeters || 0
      });
    }
  });

  return renumberIpoJobsByDate(flattened);
};

export const getStoredIpoJobs = () => {
  try {
    let saved = localStorage.getItem(LOCAL_STORAGE_IPO_JOBS_KEY);
    if (!saved) {
      saved = sessionStorage.getItem(LOCAL_STORAGE_IPO_JOBS_KEY);
    }
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        return renumberIpoJobsByDate(parsed.filter(Boolean));
      }
    }
  } catch (err) {
    console.warn('[IpoTubeContext] Error reading stored jobs:', err);
  }
  return [];
};

export const saveStoredIpoJobs = (jobs) => {
  const renumbered = renumberIpoJobsByDate(jobs);
  const jsonStr = JSON.stringify(renumbered);

  try {
    localStorage.setItem(LOCAL_STORAGE_IPO_JOBS_KEY, jsonStr);
  } catch (quotaErr) {
    console.warn('[IpoTubeContext] LocalStorage quota exceeded, auto-pruning older jobs...', quotaErr);
    try {
      const today = CalculationService.getCurrentDateString();
      const todayJobs = renumbered.filter((j) => CalculationService.safeExtractDate(j) === today);
      const pastJobs = renumbered.filter((j) => CalculationService.safeExtractDate(j) !== today);
      const pruned = [...todayJobs, ...pastJobs.slice(0, 40)];
      localStorage.setItem(LOCAL_STORAGE_IPO_JOBS_KEY, JSON.stringify(renumberIpoJobsByDate(pruned)));
    } catch {
      // fallback
    }
  }

  try {
    sessionStorage.setItem(LOCAL_STORAGE_IPO_JOBS_KEY, jsonStr);
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new Event('storage-ipo-jobs-updated'));
  } catch {
    // ignore
  }

  return renumbered;
};

export const getStoredIpoHeader = () => {
  const today = CalculationService.getCurrentDateString();
  const loggedInUser = getLoggedInUser();
  const currentOperatorName = getDisplayNameFromUser(loggedInUser);
  const currentOperatorId = loggedInUser?.EmployeeId 
    ? `EMP-${loggedInUser.EmployeeId}` 
    : (loggedInUser?.employeeId ? `EMP-${loggedInUser.employeeId}` : '');

  let saved = null;
  try {
    saved = localStorage.getItem(LOCAL_STORAGE_IPO_SESSION_KEY) || sessionStorage.getItem(LOCAL_STORAGE_IPO_SESSION_KEY);
  } catch (e) {
    console.warn('[IpoTubeContext] Error reading header:', e);
  }

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        date: today,
        reportNo: CalculationService.generateReportNo(today, parsed.shift || 'Day'),
        ...(currentOperatorName ? { operatorName: currentOperatorName } : {}),
        ...(currentOperatorId ? { operatorId: currentOperatorId } : {})
      };
    } catch {
      // fallback
    }
  }
  return {
    reportNo: CalculationService.generateReportNo(today, 'Day'),
    date: today,
    shift: 'Day',
    operatorId: currentOperatorId || 'EMP-001',
    operatorName: currentOperatorName || 'Operator',
    machineNo: 'IPO-01',
    lineNo: 'Line 2 (Pipe Set)'
  };
};

export const saveStoredIpoHeader = (header) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_IPO_SESSION_KEY, JSON.stringify(header));
  } catch {
    try {
      sessionStorage.setItem(LOCAL_STORAGE_IPO_SESSION_KEY, JSON.stringify(header));
    } catch {
      // ignore
    }
  }
  try {
    window.dispatchEvent(new Event('storage-ipo-header-updated'));
  } catch {
    // ignore
  }
};

const IpoTubeContext = createContext(null);

export const IpoTubeProvider = ({ children }) => {
  const [header, setHeaderState] = useState(getStoredIpoHeader);
  const [jobs, setJobsState] = useState(getStoredIpoJobs);
  const [isLoading, setIsLoading] = useState(false);

  const setJobs = useCallback((updater) => {
    setJobsState((prev) => {
      const nextJobs = typeof updater === 'function' ? updater(prev) : updater;
      const renumbered = saveStoredIpoJobs(nextJobs);
      return renumbered;
    });
  }, []);

  const setHeader = useCallback((updater) => {
    setHeaderState((prev) => {
      const nextHeader = typeof updater === 'function' ? updater(prev) : updater;
      saveStoredIpoHeader(nextHeader);
      return nextHeader;
    });
  }, []);

  // 1. ดึงข้อมูลจาก SQL Server API (ไม่ใช้ Mock Data)
  const fetchJobsFromServer = useCallback(async (params = {}) => {
    setIsLoading(true);
    try {
      const serverJobs = await IpoService.getFullJobs(params);
      if (Array.isArray(serverJobs)) {
        const mapped = mapServerJobsToUiRolls(serverJobs);
        saveStoredIpoJobs(mapped);
        setJobsState(mapped);
        return mapped;
      }
    } catch (err) {
      console.warn('[IpoTubeContext] Fetch from server error, using cached jobs:', err);
    } finally {
      setIsLoading(false);
    }
    return getStoredIpoJobs();
  }, []);

  // ดึงข้อมูลเมื่อเริ่มเปิดหน้าเว็บ
  useEffect(() => {
    fetchJobsFromServer();
  }, [fetchJobsFromServer]);

  // 2. เพิ่ม Job ใหม่ (บันทึกลงทั้ง Local State และ SQL Server)
  const addJob = useCallback(async (jobData) => {
    const newJob = {
      ...jobData,
      id: jobData.id || `ipo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: jobData.createdAt || new Date().toISOString()
    };

    const targetJobNo = (newJob.jobNo || newJob.job || '').trim();

    // ดึงรายการม้วนเดิมของ Job นี้จาก SQL Server เพื่อให้ข้อมูลตรงกับฐานข้อมูลจริง 100%
    let existingForJob = [];
    try {
      const serverJob = await IpoService.getJobByNo(targetJobNo);
      if (serverJob) {
        const mapped = mapServerJobsToUiRolls([serverJob]);
        if (mapped && mapped.length > 0) {
          existingForJob = mapped;
        }
      }
    } catch (err) {
      console.warn('[IpoTubeContext] Could not fetch existing rolls from server, using local:', err);
    }

    if (existingForJob.length === 0) {
      const currentStoredJobs = getStoredIpoJobs();
      existingForJob = currentStoredJobs.filter(j => (j.jobNo || j.job || '').trim() === targetJobNo);
    }

    // กรองตัวที่ id ซ้ำออก หรือถ้า runNo ซ้ำกันให้อัปเดต
    const deduplicatedExisting = existingForJob.filter(j => j.id !== newJob.id && j.runNo !== newJob.runNo);
    const allRollsThisJob = [...deduplicatedExisting, newJob].sort((a, b) => (a.runNo || a.sequenceNo || 0) - (b.runNo || b.sequenceNo || 0));

    allRollsThisJob.forEach((item, idx) => {
      item.runNo = idx + 1;
      item.sequenceNo = idx + 1;
      item.rollNo = idx + 1;
    });

    if (newJob.status === 'CLOSED' || newJob.isClosed) {
      allRollsThisJob.forEach((item) => {
        item.status = 'CLOSED';
        item.isClosed = true;
        if (!item.closedAt) item.closedAt = newJob.closedAt || new Date().toISOString();
      });
    }

    setJobs((prevJobs) => {
      const otherJobs = prevJobs.filter(j => (j.jobNo || j.job || '').trim() !== targetJobNo);
      return [...allRollsThisJob, ...otherJobs].slice(0, 300);
    });

    try {
      const activeUser = getDisplayNameFromUser(getLoggedInUser()) || header?.operatorName || '';
      await IpoService.saveJob(allRollsThisJob, activeUser, false);
      console.info('[IpoTubeContext] Saved job to SQL Server successfully');
      await fetchJobsFromServer();
    } catch (err) {
      console.error('[IpoTubeContext] Save to database failed:', err);
      toast.error('บันทึกลง Database ล้มเหลว: ' + (err.response?.data?.message || err.message));
    }
  }, [setJobs, header, fetchJobsFromServer]);

  // 3. เพิ่มหลาย Job พร้อมกัน (Batch Add เช่น ขยายม้วน)
  const addJobs = useCallback(async (jobsArray) => {
    if (!Array.isArray(jobsArray) || jobsArray.length === 0) return;
    const activeUser = getDisplayNameFromUser(getLoggedInUser()) || header?.operatorName || 'Operator';
    const newJobs = jobsArray.map((jobData, idx) => ({
      ...jobData,
      id: jobData.id || `ipo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 7)}`,
      operatorName: (jobData.operatorName || jobData.employeeName || activeUser).trim(),
      employeeName: (jobData.operatorName || jobData.employeeName || activeUser).trim(),
      createdAt: jobData.createdAt || new Date(Date.now() + idx * 10).toISOString()
    }));

    const targetJobNo = (newJobs[0]?.jobNo || newJobs[0]?.job || '').trim();
    const currentStoredJobs = getStoredIpoJobs();
    const existingForJob = currentStoredJobs.filter(j => (j.jobNo || j.job || '').trim() === targetJobNo);
    const allRollsThisJob = [...existingForJob, ...newJobs].sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0));

    allRollsThisJob.forEach((item, idx) => {
      item.runNo = idx + 1;
      item.sequenceNo = idx + 1;
      item.rollNo = idx + 1;
    });

    setJobs((prevJobs) => {
      const otherJobs = prevJobs.filter(j => (j.jobNo || j.job || '').trim() !== targetJobNo);
      return [...allRollsThisJob, ...otherJobs].slice(0, 300);
    });

    try {
      await IpoService.saveJob(allRollsThisJob, activeUser, false);
      console.info('[IpoTubeContext] Batch saved to SQL Server successfully');
      await fetchJobsFromServer();
    } catch (err) {
      console.error('[IpoTubeContext] Batch save to database failed:', err);
      toast.error('บันทึกลง Database ล้มเหลว: ' + (err.response?.data?.message || err.message));
    }
  }, [setJobs, header, fetchJobsFromServer]);

  // 4. อัปเดต Job (เฉพาะม้วนที่แก้ไข โดยไม่เขียนทับม้วนอื่นๆ ของ Job เดียวกัน)
  const updateJob = useCallback(async (updatedJob) => {
    const targetJobNo = (updatedJob.jobNo || updatedJob.job || '').trim();
    const isJobLevelUpdateOnly = !updatedJob.id && !updatedJob.startTime && !updatedJob.productQty && (updatedJob.status || updatedJob.isClosed !== undefined);

    let existingForJob = [];
    try {
      const serverJob = await IpoService.getJobByNo(targetJobNo);
      if (serverJob) {
        const mapped = mapServerJobsToUiRolls([serverJob]);
        if (mapped && mapped.length > 0) {
          existingForJob = mapped;
        }
      }
    } catch (err) {
      console.warn('[IpoTubeContext] Could not fetch server rolls for update, fallback to local:', err);
    }

    if (existingForJob.length === 0) {
      const currentStoredJobs = getStoredIpoJobs();
      existingForJob = currentStoredJobs.filter(j => (j.jobNo || j.job || '').trim() === targetJobNo);
    }

    // Fallback: If still empty, use rolls directly if supplied in updatedJob
    if (existingForJob.length === 0 && Array.isArray(updatedJob.rolls) && updatedJob.rolls.length > 0) {
      existingForJob = updatedJob.rolls;
    }

    const updatedRolls = existingForJob.map((j) => {
      if (isJobLevelUpdateOnly) {
        return {
          ...j,
          status: updatedJob.status ?? j.status,
          isClosed: updatedJob.isClosed ?? j.isClosed,
          closedAt: updatedJob.closedAt ?? j.closedAt,
          operatorName: updatedJob.operatorName ?? j.operatorName
        };
      }

      const isMatch = (updatedJob.id && j.id === updatedJob.id) ||
        (updatedJob.runNo && (j.runNo === updatedJob.runNo || j.sequenceNo === updatedJob.runNo)) ||
        (updatedJob.sequenceNo && (j.sequenceNo === updatedJob.sequenceNo || j.runNo === updatedJob.sequenceNo));

      if (isMatch) {
        return { ...j, ...updatedJob };
      }

      // ม้วนอื่นๆ ของ Job เดียวกัน ต้องคงข้อมูลเดิมไว้ ไม่ถูกเขียนทับเด็ดขาด!
      return j;
    });

    const payloadToSend = updatedRolls.length > 0 ? updatedRolls : [updatedJob];

    setJobs((prevJobs) => {
      // If this is a job-level update and updatedRolls is empty, update matching rolls in-place
      if (isJobLevelUpdateOnly && updatedRolls.length === 0) {
        return prevJobs.map((j) => {
          if ((j.jobNo || j.job || '').trim() === targetJobNo) {
            return {
              ...j,
              status: updatedJob.status ?? j.status,
              isClosed: updatedJob.isClosed ?? j.isClosed,
              closedAt: updatedJob.closedAt ?? j.closedAt
            };
          }
          return j;
        });
      }
      const otherJobs = prevJobs.filter(j => (j.jobNo || j.job || '').trim() !== targetJobNo);
      return [...payloadToSend, ...otherJobs].slice(0, 300);
    });

    try {
      const activeUser = getDisplayNameFromUser(getLoggedInUser()) || header?.operatorName || '';
      await IpoService.saveJob(payloadToSend, activeUser, false);
      console.info('[IpoTubeContext] Updated job in SQL Server successfully');
      await fetchJobsFromServer();
    } catch (err) {
      console.error('[IpoTubeContext] Update in database failed:', err);
      toast.error('อัปเดตลง Database ล้มเหลว: ' + (err.response?.data?.message || err.message));
    }
  }, [setJobs, header, fetchJobsFromServer]);

  // 5. ลบ Job หรือ ลบเฉพาะรอบที่ระบุ (Delete single roll vs Delete entire job)
  const deleteJob = useCallback(async (jobId, jobNo, targetRunNo) => {
    const rawJobNo = (jobNo || (typeof jobId === 'string' && jobId.includes('_') ? jobId.split('_')[0] : jobId) || '').trim();

    // ดึง runNo จาก targetRunNo หรือจาก jobId (เช่น S40G800006_2)
    let extractedRunNo = targetRunNo;
    if (!extractedRunNo && typeof jobId === 'string' && jobId.includes('_')) {
      const parts = jobId.split('_');
      const parsed = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(parsed)) extractedRunNo = parsed;
    }

    // 1. อัปเดต Local State ทันที
    setJobs((prevJobs) => {
      return prevJobs.filter((j) => {
        const jNo = (j.jobNo || j.job || '').trim();
        if (rawJobNo && jNo === rawJobNo) {
          if (extractedRunNo) {
            return Number(j.runNo || j.sequenceNo || j.rollNo) !== Number(extractedRunNo);
          }
          if (jobId && String(j.id) === String(jobId)) {
            return false;
          }
          return false; // ลบทั้ง Job
        }
        return j.id !== jobId;
      });
    });

    // 2. เรียก API ลบข้อมูลจริงใน SQL Server
    try {
      if (rawJobNo) {
        if (extractedRunNo) {
          // ลบเฉพาะรอบที่ระบุออกจาก Database
          await IpoService.deleteRoll(rawJobNo, extractedRunNo);
          console.info(`[IpoTubeContext] Deleted roll ${extractedRunNo} of Job ${rawJobNo} from SQL Server`);
        } else {
          // ลบทั้ง Job ออกจาก Database
          await IpoService.deleteJob(rawJobNo);
          console.info(`[IpoTubeContext] Deleted entire job ${rawJobNo} from SQL Server`);
        }
        await fetchJobsFromServer();
      }
    } catch (err) {
      console.error('[IpoTubeContext] Delete from SQL Server failed:', err);
      toast.error('ลบข้อมูลในฐานข้อมูลไม่สำเร็จ: ' + (err.response?.data?.message || err.message));
      throw err;
    }
  }, [setJobs, fetchJobsFromServer]);

  // 6. เคลียร์ Job ทั้งหมด
  const clearAllJobs = useCallback(async () => {
    const currentJobs = getStoredIpoJobs();
    const uniqueJobNos = [...new Set(currentJobs.map(j => (j.jobNo || j.job || '').trim()).filter(Boolean))];

    setJobs([]);
    saveStoredIpoJobs([]);

    try {
      if (uniqueJobNos.length > 0) {
        await Promise.all(uniqueJobNos.map(jNo => IpoService.deleteJob(jNo)));
      }
      await fetchJobsFromServer();
      console.info('[IpoTubeContext] Cleared all jobs from SQL Server');
      toast.info('ล้างรายการผลิต IPO TUBE ทั้งหมดเรียบร้อย');
    } catch (err) {
      console.error('[IpoTubeContext] Error clearing all jobs from SQL Server:', err);
      toast.error('ล้างรายการใน Database ไม่สำเร็จ: ' + (err.response?.data?.message || err.message));
    }
  }, [setJobs, fetchJobsFromServer]);

  // 7. รีเฟรชข้อมูลจาก Server
  const refreshJobs = useCallback(() => {
    fetchJobsFromServer();
  }, [fetchJobsFromServer]);

  // ฟัง event การเปลี่ยนแปลงข้อมูลจาก tab อื่น
  useEffect(() => {
    const handleStorageUpdate = () => {
      setJobsState(getStoredIpoJobs());
    };
    window.addEventListener('storage-ipo-jobs-updated', handleStorageUpdate);
    return () => window.removeEventListener('storage-ipo-jobs-updated', handleStorageUpdate);
  }, []);

  const value = {
    header,
    setHeader,
    jobs,
    setJobs,
    addJob,
    addJobs,
    updateJob,
    deleteJob,
    clearAllJobs,
    refreshJobs,
    fetchJobsFromServer,
    isLoading,
    setIsLoading
  };

  return (
    <IpoTubeContext.Provider value={value}>
      {children}
    </IpoTubeContext.Provider>
  );
};

export const useIpoTube = () => {
  const ctx = useContext(IpoTubeContext);
  if (!ctx) {
    throw new Error('useIpoTube must be used within an IpoTubeProvider');
  }
  return ctx;
};

export default IpoTubeContext;
