import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Search, ArrowRight, X, Download, Printer, Loader2 } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { RollStickerCard } from './RollStickerCard';
import { downloadStickersPdf } from './StickerPdfDocument';
import { resolveStickerQty, extractStickerRollLength } from '../../utils/qrLabelUtils';

/**
 * StickerPrintModal
 * โมดอลสั่งพิมพ์ฉลากสินค้าติดม้วน (Print Roll Label 100 x 45 mm.)
 * ออกแบบตรงตามมาตรฐาน Emboss / Slit / IPO Tube 1:1
 */
export const StickerPrintModal = ({
  isOpen = false,
  onClose,
  jobData = null,
  initialQuery = '',
  initialRollNo = null,
  allJobs = [],
  processName = 'IPO TUBE' // 'SLIT' | 'IPO TUBE' | 'EMBOSS'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // ตัวเลือกการพิมพ์ (Print Options)
  const [printMode, setPrintMode] = useState('all'); // 'all' | 'single' | 'all_subjobs'
  const [selectedRollIndex, setSelectedRollIndex] = useState(0);
  const [selectedSubJobIndex, setSelectedSubJobIndex] = useState(0);
  const [subJobSpecs, setSubJobSpecs] = useState({});
  const [copiesPerRoll, setCopiesPerRoll] = useState(1); // 1, 2, 3
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Refs ป้องกันอาการกระพริบและการรัน Effect วนลูป
  const activeJobRef = useRef(null);
  const lastLoadedKeyRef = useRef(null);

  useEffect(() => {
    activeJobRef.current = activeJob;
  }, [activeJob]);

  // สกัดรายการ Sub-Jobs ทั้งหมดที่อยู่ในม้วนนี้ (เช่น สำหรับ Slit ที่มีหลาย Job / หลาย Part No.)
  const subJobs = useMemo(() => {
    if (!activeJob) return [];
    if (Array.isArray(activeJob.firstSheetEntries) && activeJob.firstSheetEntries.length > 0) {
      const valid = activeJob.firstSheetEntries.filter(
        fe => Number(fe.qty) > 0 || Number(fe.width) > 0 || Boolean(fe.partNo) || (fe.jobNo && fe.jobNo !== '-')
      );
      if (valid.length > 0) return valid;
    }
    return [];
  }, [activeJob]);

  // ดึงข้อมูล Item Description และ Part No. เพิ่มเติมสำหรับแต่ละ Sub-Job อัตโนมัติ (เช่น เมื่อตัดหลาย Part ใต้ Job เดียว)
  useEffect(() => {
    if (!subJobs || subJobs.length === 0) return;
    const apiBase = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    subJobs.forEach(async (sj) => {
      const targetQuery = (sj.partNo || sj.jobNo || '').trim();
      if (!targetQuery || targetQuery === '-' || subJobSpecs[targetQuery]) return;

      try {
        const endpoint = processName === 'SLIT'
          ? `${apiBase}/api/slit/job/${encodeURIComponent(targetQuery)}`
          : `${apiBase}/api/ipo/job/${encodeURIComponent(targetQuery)}`;
        const res = await axios.get(endpoint, { timeout: 6000, headers });
        const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        if (list.length > 0) {
          const item = list[0];
          const desc = item.description || item.Description || item.itemDescription || '';
          const part = item.item || item.Item || item.partNo || item.PartNo || item.itemMst || sj.partNo || '';
          setSubJobSpecs(prev => ({
            ...prev,
            [targetQuery]: { description: desc, partNo: part },
            ...(part ? { [part]: { description: desc, partNo: part } } : {})
          }));
        }
      } catch (e) {
        // เงียบไว้ในเบื้องหลัง
      }
    });
  }, [subJobs, processName]);

  // ฟังก์ชันค้นหา Job No. จากข้อมูลที่มีและเรียก API เสริม
  const executeSearch = useCallback(async (targetQuery, rollNoOverride = null) => {
    const query = (targetQuery || '').trim();
    if (!query) {
      setSearchError('กรุณากรอก Job No.');
      return;
    }

    setIsSearching(true);
    setSearchError('');

    const targetRollIdx = (rollNoOverride !== null && Number(rollNoOverride) > 0)
      ? Number(rollNoOverride) - 1
      : (initialRollNo !== null && Number(initialRollNo) > 0 ? Number(initialRollNo) - 1 : null);
    const nextPrintMode = targetRollIdx !== null ? 'single' : 'all';
    const nextRollIndex = targetRollIdx !== null ? targetRollIdx : 0;

    // 1. ค้นหาจากข้อมูลที่มีอยู่ (jobData, activeJobRef.current, allJobs)
    const normalizedQuery = query.toUpperCase();
    let matchedEntries = [];
    let matchedEntry = null;
    let parentJob = null;

    const pool = [jobData, activeJobRef.current, ...(allJobs || [])].filter(Boolean);
    for (const j of pool) {
      if (Array.isArray(j.firstSheetEntries) && j.firstSheetEntries.length > 0) {
        const matched = j.firstSheetEntries.filter((fe) => {
          const feJob = (fe.jobNo || fe.job || '').toString().toUpperCase().trim();
          const fePart = (fe.partNo || fe.item || '').toString().toUpperCase().trim();
          return feJob === normalizedQuery || fePart === normalizedQuery;
        });
        if (matched.length > 0) {
          matchedEntries = matched;
          matchedEntry = matched[0];
          parentJob = j;
          const matchIdx = j.firstSheetEntries.findIndex((fe) => {
            const feJob = (fe.jobNo || fe.job || '').toString().toUpperCase().trim();
            const fePart = (fe.partNo || fe.item || '').toString().toUpperCase().trim();
            return feJob === normalizedQuery || fePart === normalizedQuery;
          });
          if (matchIdx >= 0) {
            setSelectedSubJobIndex(matchIdx);
          }
          break;
        }
      }
      const jNo = (j.jobNo || j.rawJobNo || j.job || j.jobNumber || '').toString().toUpperCase().trim();
      if (jNo === normalizedQuery || jNo.split(',').map((s) => s.trim()).includes(normalizedQuery)) {
        parentJob = j;
        break;
      }
    }

    // คำนวณจำนวนม้วนเบื้องต้น
    let rollCount = 1;
    if (processName === 'IPO TUBE') {
      const descForLen = parentJob?.description || parentJob?.itemDescription || '';
      const extractedLen = Number(extractStickerRollLength(descForLen, ''));
      const rollLen = extractedLen > 0 ? extractedLen : (Number(parentJob?.stdRollLength || parentJob?.stdLength || 200) || 200);

      const rawMeters = Number(
        parentJob?.totalGoodMeters ||
        parentJob?.totalMeters ||
        parentJob?.productQty ||
        parentJob?.productedQty ||
        parentJob?.totalProductedQty ||
        0
      );

      if (Array.isArray(parentJob?.rolls) && parentJob.rolls.length > 0) {
        rollCount = parentJob.rolls.length;
      } else if (rawMeters >= rollLen || rawMeters >= 100) {
        rollCount = Math.max(1, Math.round(rawMeters / rollLen));
      } else if (rawMeters > 0) {
        rollCount = Math.max(1, Math.round(rawMeters));
      } else if (parentJob?.totalRolls && Number(parentJob.totalRolls) > 0) {
        const pRolls = Number(parentJob.totalRolls);
        rollCount = (pRolls >= rollLen || pRolls >= 100) ? Math.max(1, Math.round(pRolls / rollLen)) : pRolls;
      }
    } else {
      const totalMatchedQty = matchedEntries.length > 0
        ? matchedEntries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0)
        : (matchedEntry?.qty && Number(matchedEntry.qty) > 0
          ? Number(matchedEntry.qty)
          : (parentJob?.totalRolls || parentJob?.totalProductedQty || parentJob?.productedQty || parentJob?.rolls?.length || 1));
      rollCount = Number(totalMatchedQty) > 0 ? Number(totalMatchedQty) : 1;
    }

    // 2. เรียก API จาก SQL Server เพื่อดึง Finished Good Item Description
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const endpoint = processName === 'SLIT'
        ? `${apiBase}/api/slit/job/${encodeURIComponent(query)}`
        : `${apiBase}/api/ipo/job/${encodeURIComponent(query)}`;

      const token = localStorage.getItem('token');
      const headers = {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };

      const response = await axios.get(endpoint, { timeout: 8000, headers });
      const data = response.data;
      const list = Array.isArray(data) ? data : (data ? [data] : []);

      if (list.length > 0) {
        const item = list[0];
        const rawItemDesc = item.description || item.Description || item.itemDescription || '';
        const qtyReleased = Number(item.qtyReleased || item.QtyReleased || 0);

        // ดึงความยาวต่อม้วนจริง เช่น "ID7XT6X800M" -> 800 M
        const extractedLen = Number(extractStickerRollLength(rawItemDesc || parentJob?.description || '', ''));
        const itemLen = extractedLen > 0 ? extractedLen : (Number(item.length || item.Length || parentJob?.stdLength || 200) || 200);
        const orderRolls = qtyReleased > 0 ? Math.max(1, Math.round(qtyReleased / itemLen)) : (parentJob?.orderRolls || 1);

        let finalRollCount = rollCount;
        if (processName === 'IPO TUBE') {
          const rawMeters = Number(
            parentJob?.totalGoodMeters ||
            parentJob?.totalMeters ||
            parentJob?.productQty ||
            parentJob?.productedQty ||
            parentJob?.totalProductedQty ||
            0
          );
          if (Array.isArray(parentJob?.rolls) && parentJob.rolls.length > 0) {
            finalRollCount = parentJob.rolls.length;
          } else if (rawMeters >= itemLen || rawMeters >= 100) {
            finalRollCount = Math.max(1, Math.round(rawMeters / itemLen));
          } else if (finalRollCount >= itemLen || finalRollCount >= 100) {
            finalRollCount = Math.max(1, Math.round(finalRollCount / itemLen));
          } else if (!parentJob || finalRollCount <= 1) {
            finalRollCount = orderRolls > 0 ? orderRolls : 1;
          }
        } else {
          // SLIT
          if (Array.isArray(parentJob?.rolls) && parentJob.rolls.length > 0) {
            finalRollCount = parentJob.rolls.length;
          } else if (!parentJob && orderRolls > 0) {
            finalRollCount = orderRolls;
          }
        }

        const cleanPartNo = (() => {
          const raw = matchedEntry?.partNo || parentJob?.partNo || item.item || item.Item || item.partNo || item.PartNo || '-';
          return raw.includes(',') ? raw.split(',')[0].trim() : raw.trim();
        })();

        const cleanLotNo = (() => {
          const raw = parentJob?.productionDate || parentJob?.lotNo || parentJob?.lotNumber || parentJob?.date || item.productionDate || item.date || item.jobDate || item.JobDate;
          if (raw) return String(raw).split('T')[0].trim();
          return new Date().toISOString().split('T')[0];
        })();

        const cleanDesc = (() => {
          const parentDesc = parentJob?.description || parentJob?.itemDescription || '';
          const sytelineDesc = rawItemDesc;
          const candidates = [sytelineDesc, parentDesc, parentJob?.productName].filter(Boolean);
          const valid = candidates.filter(c => !c.includes('1100X') && !c.includes('1200X'));
          return valid.length > 0 ? valid[0] : (candidates[0] || '-');
        })();

        const rollsArray = (Array.isArray(parentJob?.rolls) && parentJob.rolls.length === finalRollCount)
          ? parentJob.rolls.map((r, idx) => ({
            ...r,
            runNo: r.runNo || r.sequenceNo || idx + 1,
            totalRolls: finalRollCount,
            jobNo: query,
            partNo: cleanPartNo,
            description: cleanDesc,
            lotNo: cleanLotNo
          }))
          : Array.from({ length: finalRollCount }, (_, idx) => ({
            runNo: idx + 1,
            totalRolls: finalRollCount,
            jobNo: query,
            partNo: cleanPartNo,
            description: cleanDesc,
            lotNo: cleanLotNo
          }));

        const newJobObj = {
          ...(parentJob || {}),
          ...item,
          jobNo: query,
          partNo: cleanPartNo,
          description: cleanDesc,
          itemDescription: cleanDesc,
          productName: cleanDesc,
          productionDate: cleanLotNo,
          lotNo: cleanLotNo,
          totalMeters: item.totalMeters || item.productedQty || parentJob?.totalMeters || '200',
          totalRolls: finalRollCount,
          baseCount: rollCount,
          orderRolls,
          rolls: rollsArray,
          firstSheetEntries: parentJob?.firstSheetEntries || (Array.isArray(item.firstSheetEntries) ? item.firstSheetEntries : [])
        };
        setActiveJob(newJobObj);
        setSearchQuery(query);
        setPrintMode(nextPrintMode);
        setSelectedRollIndex(nextRollIndex);
        return;
      } else if (parentJob) {
        const rawDate = parentJob.productionDate || parentJob.lotNo || parentJob.lotNumber || parentJob.date;
        const cleanLotNo = rawDate ? String(rawDate).split('T')[0].trim() : new Date().toISOString().split('T')[0];
        const rawPart = matchedEntry?.partNo || parentJob.partNo || '-';
        const cleanPartNo = rawPart.includes(',') ? rawPart.split(',')[0].trim() : rawPart.trim();
        const cleanDesc = parentJob.description || parentJob.itemDescription || parentJob.productName || '-';

        const rollsArray = (Array.isArray(parentJob.rolls) && parentJob.rolls.length === rollCount)
          ? parentJob.rolls.map((r, idx) => ({
            ...r,
            runNo: r.runNo || r.sequenceNo || idx + 1,
            totalRolls: rollCount,
            jobNo: query,
            partNo: cleanPartNo,
            description: cleanDesc,
            lotNo: cleanLotNo
          }))
          : Array.from({ length: rollCount }, (_, idx) => ({
            runNo: idx + 1,
            totalRolls: rollCount,
            jobNo: query,
            partNo: cleanPartNo,
            description: cleanDesc,
            lotNo: cleanLotNo
          }));

        const newJobObj = {
          ...parentJob,
          jobNo: query,
          partNo: cleanPartNo,
          description: cleanDesc,
          itemDescription: cleanDesc,
          productionDate: cleanLotNo,
          lotNo: cleanLotNo,
          totalRolls: rollCount,
          baseCount: rollCount,
          orderRolls: parentJob.orderRolls || rollCount,
          rolls: rollsArray
        };
        setActiveJob(newJobObj);
        setSearchQuery(query);
        setPrintMode(nextPrintMode);
        setSelectedRollIndex(nextRollIndex);
        return;
      } else {
        setSearchError(`ไม่พบข้อมูล Job No. "${query}" ในระบบ`);
      }
    } catch (err) {
      console.warn('[StickerPrintModal] Search error:', err);
      if (parentJob) {
        setActiveJob(parentJob);
        setSearchQuery(query);
        setPrintMode(nextPrintMode);
        setSelectedRollIndex(nextRollIndex);
      } else {
        setSearchError(`ไม่สามารถดึงข้อมูล Job "${query}" ได้`);
      }
    } finally {
      setIsSearching(false);
    }
  }, [allJobs, processName, initialRollNo, jobData]);

  // ฟังก์ชันกดค้นหาจากฟอร์มในโมดอล
  const handleSearch = (e) => {
    if (e) e.preventDefault();
    executeSearch(searchQuery);
  };

  // เมื่อเปิดโมดอล หรือ query มีการเปลี่ยนแปลง (ป้องกันการกระพริบ และรัน Effect ซ้ำ 100%)
  useEffect(() => {
    if (!isOpen) {
      lastLoadedKeyRef.current = null;
      return;
    }

    const rawTarget = initialQuery || (jobData ? (jobData.jobNo || jobData.job || jobData.jobNumber || '') : '');
    const targetQuery = rawTarget.split(',')[0].trim();
    const loadKey = `${targetQuery}_${initialRollNo || ''}`;

    if (lastLoadedKeyRef.current === loadKey) {
      return;
    }
    lastLoadedKeyRef.current = loadKey;

    const hasSpecificRoll = initialRollNo !== null && Number(initialRollNo) > 0;
    const initRollIdx = hasSpecificRoll ? Number(initialRollNo) - 1 : 0;

    if (jobData && Object.keys(jobData).length > 0) {
      setActiveJob(jobData);
      setSearchQuery(targetQuery || jobData.jobNo || '');
      setSearchError('');
      setPrintMode(hasSpecificRoll ? 'single' : 'all');
      setSelectedRollIndex(initRollIdx);

      if (targetQuery) {
        executeSearch(targetQuery, initialRollNo);
      }
    } else if (targetQuery) {
      setSearchQuery(targetQuery);
      setSearchError('');
      setPrintMode(hasSpecificRoll ? 'single' : 'all');
      setSelectedRollIndex(initRollIdx);
      executeSearch(targetQuery, initialRollNo);
    } else {
      setActiveJob(null);
      setSearchQuery('');
      setSearchError('');
      setPrintMode('all');
      setSelectedRollIndex(0);
    }
  }, [isOpen, initialQuery, jobData, executeSearch, initialRollNo]);

  // สกัดข้อมูลของ Job และ Rolls
  const jobSummary = useMemo(() => {
    if (!activeJob) return null;

    const hasSubJobs = subJobs && subJobs.length > 0;
    const safeSubJobIdx = (hasSubJobs && selectedSubJobIndex >= 0 && selectedSubJobIndex < subJobs.length)
      ? selectedSubJobIndex
      : 0;
    const currentSub = hasSubJobs ? subJobs[safeSubJobIdx] : null;

    // 1. ตรวจสอบให้มี Job เดียวเสมอ (ไม่รวมหลาย Job ด้วย comma)
    const rawJob = currentSub?.jobNo || activeJob.jobNo || activeJob.job || activeJob.jobNumber || searchQuery || '-';
    const jobNo = (rawJob && rawJob !== '-')
      ? (rawJob.includes(',') ? rawJob.split(',')[0].trim() : rawJob.trim())
      : ((activeJob.jobNo || '-').includes(',') ? activeJob.jobNo.split(',')[0].trim() : (activeJob.jobNo || '-'));

    // 2. Part No. เดี่ยว
    const subCached = (currentSub?.partNo && subJobSpecs[currentSub.partNo]) || (currentSub?.jobNo && subJobSpecs[currentSub.jobNo]);
    const rawPart = currentSub?.partNo || subCached?.partNo || activeJob.partNo || activeJob.item || activeJob.itemMst || '-';
    const partNo = rawPart.includes(',') ? rawPart.split(',')[0].trim() : rawPart.trim();

    // 3. Description: ให้ความสำคัญกับ Finished Item Description
    const subDesc = currentSub?.description || currentSub?.itemDescription || subCached?.description;
    const candidates = [
      subDesc,
      activeJob.itemDescription,
      activeJob.description,
      activeJob.finishedItemDescription,
      activeJob.productName
    ].filter(Boolean);
    const validDescList = candidates.filter(d => !d.includes('1100X') && !d.includes('1200X'));
    const description = validDescList.length > 0 ? validDescList[0] : (candidates[0] || '-');

    // 4. Lot No: จัดการ format YYYY-MM-DD
    const rawLot = activeJob.productionDate || activeJob.lotNo || activeJob.lotNumber || activeJob.date || activeJob.jobDate || activeJob.JobDate;
    const lotNo = rawLot ? String(rawLot).split('T')[0].trim() : new Date().toISOString().split('T')[0];

    // คำนวณยอด Order ทั้งหมดจาก qtyReleased (เช่น 8,000 M / 200 M = 40 ม้วน หรือ 2,400 M / 800 M = 3 ม้วน)
    const qtyReleased = Number(activeJob.qtyReleased || activeJob.orderQty || 0);
    const extractedLen = Number(extractStickerRollLength(description, ''));
    const rollMeters = extractedLen > 0
      ? extractedLen
      : (Number(activeJob.stdLength || activeJob.length || activeJob.stdRollLength || 200) || 200);

    const orderRolls = (activeJob.orderRolls && Number(activeJob.orderRolls) > 0)
      ? Number(activeJob.orderRolls)
      : (qtyReleased > 0 ? Math.max(1, Math.round(qtyReleased / rollMeters)) : 1);

    // จำนวนม้วนสำหรับ Sub-Job นี้
    let totalRolls = 1;
    if (currentSub && Number(currentSub.qty) > 0) {
      totalRolls = Number(currentSub.qty);
    } else if (activeJob.baseCount && Number(activeJob.baseCount) > 0) {
      totalRolls = Number(activeJob.baseCount);
    } else if (Array.isArray(activeJob.rolls) && activeJob.rolls.length > 0) {
      totalRolls = activeJob.rolls.length;
    } else if (activeJob.totalRolls && Number(activeJob.totalRolls) > 0) {
      const pRolls = Number(activeJob.totalRolls);
      totalRolls = (pRolls >= rollMeters || pRolls >= 100) ? Math.max(1, Math.round(pRolls / rollMeters)) : pRolls;
    } else {
      const rawMeters = Number(
        activeJob.totalGoodMeters ||
        activeJob.totalMeters ||
        activeJob.productQty ||
        activeJob.productedQty ||
        activeJob.totalProductedQty ||
        0
      );
      if (rawMeters >= rollMeters || rawMeters >= 100) {
        totalRolls = Math.max(1, Math.round(rawMeters / rollMeters));
      } else if (orderRolls > 0) {
        totalRolls = orderRolls;
      }
    }

    // สร้าง array ของม้วนทั้งหมด 1..totalRolls สำหรับ Sub-Job นี้
    const rawRolls = Array.from({ length: totalRolls }, (_, idx) => {
      const existingRoll = Array.isArray(activeJob.rolls) && activeJob.rolls[idx] ? activeJob.rolls[idx] : {};
      return {
        ...existingRoll,
        runNo: idx + 1,
        totalRolls,
        jobNo,
        partNo,
        description,
        lotNo
      };
    });

    const currentRoll = rawRolls[selectedRollIndex] || rawRolls[0] || {};
    const qty = resolveStickerQty(currentRoll, activeJob, processName, description);

    // ลำดับม้วนปัจจุบัน
    const currentRunNo = (selectedRollIndex + 1 <= totalRolls) ? selectedRollIndex + 1 : 1;

    // สร้าง array รวมของทุก Sub-Job ในม้วนแม่ (กรณีเลือก "พิมพ์ทุก Job ในม้วนนี้")
    const allSubJobRolls = hasSubJobs
      ? subJobs.flatMap((sj, sIdx) => {
        const sjTotal = Number(sj.qty) > 0 ? Number(sj.qty) : 1;
        const sjCached = (sj.partNo && subJobSpecs[sj.partNo]) || (sj.jobNo && subJobSpecs[sj.jobNo]);
        const sjJob = (sj.jobNo && sj.jobNo !== '-') ? sj.jobNo : jobNo;
        const sjPart = sj.partNo || sjCached?.partNo || partNo;
        const sjDesc = sj.description || sjCached?.description || description;
        return Array.from({ length: sjTotal }, (_, rIdx) => ({
          runNo: rIdx + 1,
          totalRolls: sjTotal,
          jobNo: sjJob,
          partNo: sjPart,
          description: sjDesc,
          lotNo,
          subJobIndex: sIdx
        }));
      })
      : rawRolls;

    return {
      rawRolls,
      totalRolls,
      currentRoll,
      jobNo,
      partNo,
      description,
      lotNo,
      qty,
      currentRunNo,
      baseCount: totalRolls,
      orderRolls,
      subJobs,
      selectedSubJobIndex: safeSubJobIdx,
      allSubJobRolls,
      totalAllSubRolls: allSubJobRolls.length
    };
  }, [activeJob, selectedRollIndex, searchQuery, processName, selectedSubJobIndex, subJobs, subJobSpecs]);

  // คำนวณจำนวนดวงทั้งหมดที่จะพิมพ์
  const totalLabelsToPrint = useMemo(() => {
    if (!jobSummary) return 0;
    const baseCount = printMode === 'all_subjobs'
      ? jobSummary.totalAllSubRolls
      : (printMode === 'all' ? jobSummary.totalRolls : 1);
    return baseCount * copiesPerRoll;
  }, [jobSummary, printMode, copiesPerRoll]);

  // สั่งพิมพ์ผ่านเบราว์เซอร์
  const handlePrint = () => {
    window.print();
  };

  // ดาวน์โหลดไฟล์ PDF โดยตรงลงเครื่องผู้ใช้ทันที (Direct PDF Download 100x45 mm)
  const handleDownloadPdf = async () => {
    if (!jobSummary) return;
    try {
      setIsDownloadingPdf(true);
      const rollsToExport = printMode === 'all_subjobs'
        ? jobSummary.allSubJobRolls
        : (printMode === 'all' ? jobSummary.rawRolls : [jobSummary.currentRoll]);

      await downloadStickersPdf({
        rolls: rollsToExport,
        jobSummary,
        processName,
        copiesPerRoll,
        resolveStickerQty
      });

      toast.success('ดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว', { autoClose: 2500 });
    } catch (err) {
      console.error('[StickerPrintModal] Direct PDF download error:', err);
      // Fallback: หากเบราว์เซอร์ติดบล็อก ให้เปิดหน้าต่างพิมพ์
      const originalTitle = document.title;
      document.title = `${jobSummary.jobNo}_Sticker_Label_${processName}`;
      window.print();
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn"
      onClick={onClose}
    >
      {/* ── Print Stylesheet เฉพาะสำหรับฉลากติดม้วน 100 x 45 mm. (แก้ปัญหาขอบล้น 100%) ── */}
      <style>{`
        @page {
          size: 100mm 45mm;
          margin: 0;
        }

        @media screen {
          #sticker-printable-portal {
            display: none !important;
          }
        }

        @media print {
          /* 1. ซ่อนแอปพลิเคชันหลักทั้งหน้า (#root), dialog fixed, และ no-print เพื่อไม่ให้กินพื้นที่หน้ากระดาษ */
          #root,
          .fixed,
          .no-print {
            display: none !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100mm !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* 2. แสดงเฉพาะ portal ที่ยึดกับ body ตรงๆ */
          #sticker-printable-portal {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            z-index: 9999999 !important;
          }

          .sticker-print-page {
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100mm !important;
            height: 45mm !important;
            max-width: 100mm !important;
            max-height: 45mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .sticker-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .sticker-print-page .sticker-label-wrapper {
            width: 98mm !important;
            height: 43mm !important;
            max-width: 98mm !important;
            max-height: 43mm !important;
            padding: 0.5mm 1mm !important;
            margin: auto !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .sticker-print-page .sticker-border-table,
          .sticker-print-page .sticker-border-box {
            width: 100% !important;
            height: 42mm !important;
            max-height: 42mm !important;
            box-sizing: border-box !important;
            border: 2px solid #000000 !important;
            border-collapse: collapse !important;
          }

          .sticker-print-page .sticker-border-table td {
            padding: 1.5px 4px !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
            box-sizing: border-box !important;
          }

          .sticker-print-page .sticker-border-table .cell-desc {
            font-size: 8.5px !important;
            line-height: 1.1 !important;
            padding: 1px 4px !important;
          }

          .sticker-print-page .sticker-border-table .cell-roll {
            font-size: 11px !important;
            padding: 2px 2px !important;
          }

          .sticker-print-page .sticker-border-table .cell-qty {
            font-size: 11.5px !important;
            padding: 2px 4px !important;
          }

          .sticker-print-page .sticker-border-table .cell-qr {
            padding: 2px !important;
          }

          .sticker-print-page .sticker-border-table .cell-qr img {
            max-width: 25mm !important;
            max-height: 25mm !important;
          }
        }
      `}</style>

      {/* ── Card Dialog Box ── */}
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col max-h-[96vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 1. Modal Header ── */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-white shrink-0 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600 flex items-center justify-center shadow-xs shrink-0">
              <Tag className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-[15px] font-black text-slate-800 leading-tight">
                Print Roll Label
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                สติ๊กเกอร์ขนาด 100 x 45 มม. สำหรับติดม้วน {processName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── 2. Modal Body (Compact Scrollable) ── */}
        <div className="px-5 py-3 overflow-y-auto flex-1 space-y-2.5">
          {/* ── ค้นหา / เปลี่ยน Job No. ในโมดอลได้ทันที ── */}
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหา Job No..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-bold text-slate-800 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-2xs shrink-0"
            >
              {isSearching ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              <span>ค้นหา</span>
            </button>
          </form>

          {/* สลับ Sub-Job สำหรับ Slit / Multi-Job (เมื่อม้วนแม่มีหลาย Job) */}
          {jobSummary?.subJobs && jobSummary.subJobs.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap p-1.5 px-2 bg-blue-50/70 rounded-lg border border-blue-100">
              <span className="text-[11px] font-bold text-blue-900 shrink-0">Job No:</span>
              {jobSummary.subJobs.map((fe, fIdx) => {
                const isSelected = (jobSummary?.selectedSubJobIndex ?? 0) === fIdx;
                const feJob = fe.jobNo || activeJob?.jobNo || `Job ${fIdx + 1}`;
                const fePart = fe.partNo || '';
                const feQty = fe.qty || 1;
                return (
                  <button
                    key={fIdx}
                    type="button"
                    onClick={() => {
                      setSelectedSubJobIndex(fIdx);
                      setSelectedRollIndex(0);
                    }}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-md transition cursor-pointer flex items-center gap-1 ${isSelected
                      ? 'bg-[#1e3a8a] text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                      }`}
                  >
                    <span>Job {fIdx + 1}: {feJob}</span>
                    {/* {fePart && (
                      <span className={`text-[10px] ${isSelected ? 'text-blue-200' : 'text-slate-500'}`}>
                        ({fePart})
                      </span>
                    )} */}
                    <span className="font-extrabold">({feQty} ม้วน)</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* กรณีไม่มีข้อมูล หรือกำลังโหลด */}
          {!jobSummary && (
            <div className="py-8 px-4 text-center">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-7 h-7 border-3 border-sky-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-bold text-slate-600 mt-1">กำลังดึงข้อมูลฉลากจากระบบ...</p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-xs font-bold text-slate-600">
                    {searchError || 'ไม่พบข้อมูล Job สำหรับพิมพ์ฉลาก'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* เมื่อมีข้อมูล Job แสดงกล่องข้อมูล + พรีวิวฉลากทันที */}
          {jobSummary && (
            <>
              {/* ── Job Info Card (ดีไซน์กะทัดรัด ไม่เปลืองความสูง) ── */}
              <div className="rounded-xl border border-sky-100 bg-[#f8fbfe] p-2.5 px-3 shadow-2xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-left">
                  {/* Job No */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Job No.</span>
                    <span className="text-xs font-black text-[#1e3a8a] block truncate mt-0.5" title={jobSummary.jobNo}>
                      {jobSummary.jobNo}
                    </span>
                  </div>

                  {/* Part No */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Part No.</span>
                    <span className="text-xs font-bold text-slate-800 block truncate mt-0.5" title={jobSummary.partNo}>
                      {jobSummary.partNo}
                    </span>
                  </div>

                  {/* Lot No */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Lot No. (Date)</span>
                    <span className="text-xs font-bold text-slate-700 block truncate mt-0.5" title={jobSummary.lotNo}>
                      {jobSummary.lotNo || '-'}
                    </span>
                  </div>

                  {/* จำนวนม้วนทั้งหมด */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">จำนวนม้วน</span>
                    <span className="text-xs font-black text-emerald-600 block truncate mt-0.5">
                      {jobSummary.totalRolls} ม้วน
                      {jobSummary.subJobs && jobSummary.subJobs.length > 1 && (
                        <span className="text-[9.5px] text-slate-400 font-normal ml-1">
                          (รวม {jobSummary.totalAllSubRolls} ม้วน)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Description แสดงเป็นแถวแนวนอนประหยัดพื้นที่ */}
                <div className="mt-1.5 pt-1.5 border-t border-sky-100/80 flex items-center gap-1.5 text-left">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0">Description:</span>
                  <span className="text-[11px] font-bold text-slate-800 truncate" title={jobSummary.description}>
                    {jobSummary.description}
                  </span>
                </div>
              </div>

              {/* ── Sticker Preview Section (ขนาดกระชับ สบายตา) ── */}
              <div>
                <div className="flex items-center justify-between mb-1 px-0.5">
                  <span className="text-[10px] text-slate-400">
                    ตัวอย่าง label (ขนาดสติ๊กเกอร์ 100 x 45 มม.)
                  </span>
                </div>

                <div className="bg-[#f0f6fa] border border-sky-100/80 rounded-xl p-2 sm:p-2.5 flex flex-col items-center justify-center">
                  <div className="w-full max-w-[390px] bg-white rounded-lg shadow-2xs border border-slate-300 overflow-hidden">
                    <RollStickerCard
                      job={jobSummary.jobNo}
                      partNo={jobSummary.partNo}
                      description={jobSummary.description}
                      lotNo={jobSummary.lotNo}
                      runNo={jobSummary.currentRunNo}
                      totalRolls={jobSummary.totalRolls}
                      qty={jobSummary.qty}
                      process={processName}
                      showRawCodeText={false}
                      style={{ padding: '8px 12px' }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Selection Controls ── */}
              <div className="space-y-1.5 pt-0.5">
                {/* แถวที่ 1: เลือกม้วนที่ต้องการพิมพ์ */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 py-0.5">
                  <span className="text-[11px] font-semibold text-slate-700">เลือกม้วนที่ต้องการพิมพ์:</span>
                  <div className="inline-flex rounded-lg bg-slate-100/80 p-0.5 border border-slate-200/60 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setPrintMode('all')}
                      className={`px-2.5 py-0.5 text-[11px]  rounded-md transition cursor-pointer ${printMode === 'all'
                        ? 'bg-white text-sky-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      {jobSummary.subJobs && jobSummary.subJobs.length > 1
                        ? `พิมพ์เฉพาะ Job นี้ (${jobSummary.totalRolls})`
                        : `พิมพ์ทุกม้วน (${jobSummary.totalRolls})`}
                    </button>
                    {jobSummary.subJobs && jobSummary.subJobs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPrintMode('all_subjobs')}
                        className={`px-2.5 py-0.5 text-[11px]  rounded-md transition cursor-pointer ${printMode === 'all_subjobs'
                          ? 'bg-white text-sky-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                          }`}
                        title="พิมพ์ทุก Job ในม้วนนี้โดยพิมพ์แยกฉลากตามแต่ละ Job อัตโนมัติ"
                      >
                        พิมพ์ทุก Job ในม้วน ({jobSummary.totalAllSubRolls})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrintMode('single')}
                      className={`px-2.5 py-0.5 text-[11px]  rounded-md transition cursor-pointer ${printMode === 'single'
                        ? 'bg-white text-sky-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      เลือกม้วน
                    </button>
                  </div>
                </div>

                {/* แถวเลือกม้วนเดี่ยว (แสดงเมื่อเลือก 'เลือกเฉพาะม้วน') */}
                {printMode === 'single' && (
                  <div className="flex items-center justify-start gap-1 flex-wrap pt-0.5 max-h-20 overflow-y-auto p-1.5 bg-slate-50 rounded-lg border border-slate-200 animate-fadeIn">

                    {jobSummary.rawRolls.map((r, idx) => {
                      const rNo = r.runNo || r.sequenceNo || (idx + 1);
                      const isSel = selectedRollIndex === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedRollIndex(idx)}
                          className={`px-2 py-0.5 text-[11px]  rounded-md transition cursor-pointer ${isSel
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                          Roll : {rNo}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* แถวที่ 2: จำนวนพิมพ์ต่อม้วน */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] font-semibold text-slate-700">จำนวนพิมพ์ต่อม้วน:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCopiesPerRoll(num)}
                        className={`px-2.5 py-0.5 text-[11px] rounded-md transition cursor-pointer ${copiesPerRoll === num
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                      >
                        {num} แผ่น
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── 3. Modal Footer ── */}
        <div className="px-5 py-2.5 bg-white border-t border-slate-100 flex items-center justify-end shrink-0">


          {jobSummary && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDownloadingPdf}
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-sky-600 bg-sky-50/80 hover:bg-sky-100 border border-sky-200 rounded-xl transition cursor-pointer active:scale-95 disabled:opacity-60"
                title="ดาวน์โหลดฉลากเป็นไฟล์ PDF ทันที"
              >
                {isDownloadingPdf ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-sky-600" />
                    <span>กำลังสร้าง PDF...</span>
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    <span>โหลด PDF</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 active:scale-95 rounded-xl shadow-xs transition cursor-pointer"
              >
                <Printer size={14} />
                <span>พิมพ์ฉลาก ({totalLabelsToPrint} ดวง)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Printable Portal สำหรับเครื่องพิมพ์สติ๊กเกอร์ (ต่อเข้ากับ document.body โดยตรงเพื่อป้องกัน Ghost page จากตารางพื้นหลัง) ── */}
      {typeof document !== 'undefined' && jobSummary && createPortal(
        <div id="sticker-printable-portal">
          {(printMode === 'all_subjobs'
            ? jobSummary.allSubJobRolls
            : (printMode === 'all' ? jobSummary.rawRolls : [jobSummary.currentRoll])
          ).map((r, rIdx) => {
            const rNo = (printMode === 'single' ? jobSummary.currentRunNo : (r.runNo || rIdx + 1));
            const rJob = r.jobNo || jobSummary.jobNo;
            const rPart = r.partNo || jobSummary.partNo;
            const rDesc = r.description || jobSummary.description;
            const rLot = (r.lotNo || jobSummary.lotNo || '').split('T')[0];
            const rTotal = r.totalRolls || jobSummary.totalRolls;
            const rQty = resolveStickerQty(r, activeJob, processName, rDesc);

            // พิมพ์ซ้ำตาม copiesPerRoll
            return Array.from({ length: copiesPerRoll }).map((_, cIdx) => (
              <div key={`${rIdx}_${cIdx}`} className="sticker-print-page">
                <RollStickerCard
                  job={rJob}
                  partNo={rPart}
                  description={rDesc}
                  lotNo={rLot}
                  runNo={rNo}
                  totalRolls={rTotal}
                  qty={rQty}
                  process={processName}
                  showRawCodeText={false}
                />
              </div>
            ));
          })}
        </div>,
        document.body
      )}
    </div>
  );
};

export default StickerPrintModal;
