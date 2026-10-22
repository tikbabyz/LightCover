import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  History,
  Search,
  Calendar,
  Printer,
  FileSpreadsheet,
  RotateCcw,
  Layers,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  User,
  ChevronDown,
  Lock,
  Unlock,
  Pencil,
  Tag
} from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';
import { useIpoTube } from '../../context/IpoTubeContext';
import { CalculationService } from '../../services/calculationService';
import { isOfficerUser } from '../../services/authHelper';
import { ActivityLogService, ACTION_TYPES } from '../../services/activityLogService';
import { IpoStickerModal } from './components/IpoStickerModal';
import { ExcelExportService } from '../../services/excelExportService';

// Custom Date Picker component that renders DD/MM/YYYY
const FormattedDateInput = ({ value, onChange, placeholder = "dd/mm/yyyy" }) => {
  const inputRef = React.useRef(null);

  const displayValue = useMemo(() => {
    if (!value) return '';
    try {
      const cleanStr = String(value).trim();
      const parts = cleanStr.includes('T') ? cleanStr.split('T')[0].split('-') : cleanStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
      return cleanStr;
    } catch {
      return value;
    }
  }, [value]);

  const handleOpenPicker = () => {
    if (inputRef.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        try {
          inputRef.current.showPicker();
        } catch {
          inputRef.current.focus();
        }
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div
      onClick={handleOpenPicker}
      className="relative flex items-center justify-between w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 cursor-pointer transition-all shadow-xs h-[36px]"
    >
      <span className={`select-none font-medium ${displayValue ? 'text-slate-800' : 'text-slate-400 font-normal'}`}>
        {displayValue || placeholder}
      </span>

      <div className="flex items-center gap-1">
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            title="ล้างวันที่"
          >
            <X size={13} />
          </button>
        ) : null}
        <Calendar size={14} className="text-slate-400 shrink-0" />
      </div>

      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10"
        tabIndex={-1}
      />
    </div>
  );
};

/**
 * ตัด Part No ที่ซ้ำซ้อนออกจาก Product Name / Description 
 * ให้แสดงเฉพาะชื่อสินค้าจริง (เช่น ALP6-23, CJCIS2) หรือ BOM Spec แทน
 */
const getCleanProductName = (job) => {
  if (!job) return '-';
  const pNo = (job.partNo || '').trim();
  const desc = (job.description || '').trim();
  const rawProd = job.productName || job.prodName || desc || pNo || '';
  return CalculationService.extractCleanProductName(rawProd, pNo) || rawProd || '-';
};

/**
 * สกัดความยาว หรือ สเปกขนาด จาก Description เช่น ID 7 x T 6 หรือ 1000M
 */
const extractSpecOrLength = (desc = '') => {
  if (!desc) return null;
  const parts = [];
  const dimMatch = desc.match(/ID\s*(\d+(?:\.\d+)?)\s*[xX*]\s*T\s*(\d+(?:\.\d+)?)/i);
  if (dimMatch) parts.push(`ID ${dimMatch[1]} x T ${dimMatch[2]}`);

  const lenMatch = desc.match(/[xX\s](?:L)?(\d+(?:\.\d+)?)\s*M(?:\.|\b)/i);
  if (lenMatch) parts.push(`${lenMatch[1]}M`);

  return parts.length > 0 ? parts.join(' • ') : null;
};

/**
 * สกัดชื่อวันภาษาไทยสำหรับกำกับวันที่ผลิต
 */
const getDateLabel = (dateStr) => {
  if (!dateStr || dateStr === 'ไม่ระบุวันที่') return '';
  try {
    const today = CalculationService.getCurrentDateString();
    if (dateStr === today) return '(วันนี้)';

    const parts = String(dateStr).split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
      return `(วัน${days[d.getDay()]})`;
    }
  } catch {
    return '';
  }
  return '';
};

const getRollLotDisplay = (rollOrJob) => {
  if (!rollOrJob) return '-';
  const r = rollOrJob;
  const rawRoll = r.rollSlit ?? r.roll_slit ?? r.slitRoll ?? r.slit_roll ?? r.embossRoll ?? r.EmbossRoll;
  const rawTotal = r.totalRollSlit ?? r.total_roll_slit ?? r.slitTotalRoll ?? r.slit_total_roll ?? r.embossTotalRoll ?? r.EmbossTotalRoll;
  let roll = (rawRoll !== undefined && rawRoll !== null && String(rawRoll).trim() !== '') ? String(rawRoll).trim() : '';
  let total = (rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '') ? String(rawTotal).trim() : '';

  if (!roll || !total) {
    const rawLot = r.lotSlit || r.lot_slit || r.lotNoSlit || r.lotNoEmboss || r.embossLot || r.rawLotNo || r.lotNumber || r.lotNo || '';
    if (rawLot) {
      const details = CalculationService?.extractEmbossDetails ? CalculationService.extractEmbossDetails(rawLot) : null;
      if (!roll && details?.rollNo) roll = details.rollNo;
      if (!total && details?.totalRolls) total = details.totalRolls;
      if (!roll) {
        const m = String(rawLot).match(/(?:Roll\s*)?(\d+)\s*\/\s*(\d+)/i);
        if (m) {
          roll = m[1];
          total = m[2];
        }
      }
    }
  }
  if (roll && total) return `${roll}/${total}`;
  if (roll) return roll;
  return '-';
};

const getJobRollBadges = (job) => {
  if (!job) return <span className="text-slate-400 font-medium">-</span>;
  const rollList = (job.rolls && job.rolls.length > 0) ? job.rolls : [job];
  const displays = Array.from(new Set(rollList.map(r => getRollLotDisplay(r)).filter(d => d && d !== '-')));
  if (displays.length === 0) {
    return <span className="text-slate-400 font-medium">-</span>;
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {displays.map((disp, idx) => (
        <span
          key={idx}
          className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 font-black text-xs rounded-lg border border-blue-200 shadow-2xs"
        >
          {disp}
        </span>
      ))}
    </div>
  );
};

export const IpoTubeHistory = () => {
  const navigate = useNavigate();
  const { jobs, updateJob } = useIpoTube();
  const isOfficer = isOfficerUser();

  const [searchParams, setSearchParams] = useSearchParams();
  const paramSearch = searchParams.get('search') || searchParams.get('keyword') || searchParams.get('jobNo') || '';
  const paramStart = searchParams.get('startDate') || searchParams.get('date') || '';
  const paramEnd = searchParams.get('endDate') || '';
  const paramStatus = searchParams.get('status') || '';

  const [keyword, setKeyword] = useState(() => {
    if (paramSearch) return paramSearch;
    try {
      const saved = sessionStorage.getItem('ipo_tube_history_filters');
      if (saved) return JSON.parse(saved).keyword || '';
    } catch {}
    return '';
  });
  const [startDate, setStartDate] = useState(() => {
    if (paramStart) return paramStart;
    try {
      const saved = sessionStorage.getItem('ipo_tube_history_filters');
      if (saved) return JSON.parse(saved).startDate || '';
    } catch {}
    return '';
  });
  const [endDate, setEndDate] = useState(() => {
    if (paramEnd) return paramEnd;
    try {
      const saved = sessionStorage.getItem('ipo_tube_history_filters');
      if (saved) return JSON.parse(saved).endDate || '';
    } catch {}
    return '';
  });
  const [statusFilter, setStatusFilter] = useState(() => {
    if (paramStatus) return paramStatus;
    try {
      const saved = sessionStorage.getItem('ipo_tube_history_filters');
      if (saved) return JSON.parse(saved).status || 'ALL';
    } catch {}
    return 'ALL';
  });

  // บันทึกสถานะการค้นหาลง sessionStorage
  useEffect(() => {
    try {
      if (keyword || startDate || endDate || (statusFilter && statusFilter !== 'ALL')) {
        sessionStorage.setItem('ipo_tube_history_filters', JSON.stringify({
          keyword,
          startDate,
          endDate,
          status: statusFilter
        }));
      } else {
        sessionStorage.removeItem('ipo_tube_history_filters');
      }
    } catch {}
  }, [keyword, startDate, endDate, statusFilter]);

  // Sync เมื่อมีการเปลี่ยน query param จาก URL (เช่น กดการแจ้งเตือน)
  const prevParamSearchRef = useRef(paramSearch);
  useEffect(() => {
    if (paramSearch && paramSearch !== prevParamSearchRef.current) {
      prevParamSearchRef.current = paramSearch;
      setKeyword(paramSearch);
    }
  }, [paramSearch]);

  // SyteLine item descriptions cache by Job No
  const [sytelineDescriptions, setSytelineDescriptions] = useState({});
  const fetchedJobNosRef = useRef(new Set());

  // Expand state for each job's individual rounds
  const [expandedJobs, setExpandedJobs] = useState({});

  // Close / Reopen job confirmation modal
  const [closeModalState, setCloseModalState] = useState({
    isOpen: false,
    job: null,
    action: 'CLOSE', // 'CLOSE' or 'REOPEN'
    isLoading: false
  });

  // Sticker Print Modal
  const [stickerModalState, setStickerModalState] = useState({
    isOpen: false,
    jobData: null,
    initialRollNo: null
  });

  // Helper to extract YYYY-MM-DD from job
  const getJobDate = (job) => {
    return CalculationService.safeExtractDate(job);
  };

  // Quick date presets
  const applyDatePreset = (preset) => {
    const today = new Date();
    const toYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (preset === 'today') {
      const tStr = toYMD(today);
      setStartDate(tStr);
      setEndDate(tStr);
    } else if (preset === '7days') {
      const past7 = new Date();
      past7.setDate(today.getDate() - 6);
      setStartDate(toYMD(past7));
      setEndDate(toYMD(today));
    } else if (preset === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(toYMD(firstDay));
      setEndDate(toYMD(today));
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Group rolls/jobs into flat distinct Job items for clean table display
  const jobList = useMemo(() => {
    // 1. Filter jobs by keyword & date range
    const matched = (jobs || []).filter((job) => {
      const jDate = getJobDate(job);
      if (startDate && jDate && jDate < startDate) return false;
      if (endDate && jDate && jDate > endDate) return false;

      // Keyword filter
      if (keyword.trim()) {
        const term = keyword.toLowerCase().trim();
        const jNo = (job.jobNo || job.job || '').trim();
        const sytelineDesc = sytelineDescriptions[jNo] || '';
        const rollDisplay = getRollLotDisplay(job);
        const match =
          job.jobNo?.toLowerCase().includes(term) ||
          job.partNo?.toLowerCase().includes(term) ||
          job.description?.toLowerCase().includes(term) ||
          sytelineDesc.toLowerCase().includes(term) ||
          job.productName?.toLowerCase().includes(term) ||
          (job.lotNumber || job.lotNo || job.lotNoTap)?.toLowerCase().includes(term) ||
          (job.embossLot || job.lotNoEmboss || job.lotNoSlit || job.lotSlit)?.toLowerCase().includes(term) ||
          (rollDisplay !== '-' && rollDisplay.toLowerCase().includes(term)) ||
          String(job.rollSlit || job.roll_slit || job.slitRoll || job.slit_roll || '').toLowerCase().includes(term) ||
          String(job.totalRollSlit || job.total_roll_slit || job.slitTotalRoll || job.slit_total_roll || '').toLowerCase().includes(term) ||
          (Array.isArray(job.rolls) && job.rolls.some(r => {
            const rd = getRollLotDisplay(r);
            return (rd !== '-' && rd.toLowerCase().includes(term)) ||
              String(r.rollSlit || r.roll_slit || '').toLowerCase().includes(term) ||
              String(r.totalRollSlit || r.total_roll_slit || '').toLowerCase().includes(term);
          })) ||
          job.operatorName?.toLowerCase().includes(term) ||
          job.employeeName?.toLowerCase().includes(term) ||
          job.tapTube?.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });

    // 2. Group into distinct Job items
    const jobsMap = {};
    const jobOrder = [];

    matched.forEach((roll) => {
      const jNo = (roll.jobNo || roll.job || '').trim();
      const rDate = getJobDate(roll);
      // รวมทุกม้วนของ Job เดียวกันไว้ด้วยกันเสมอ
      const key = jNo ? jNo.toUpperCase() : (roll.headId || roll.id || `JOB_${jobOrder.length + 1}`);

      if (!jobsMap[key]) {
        const rollOp = (roll.operatorName || roll.employeeName || roll.operator || '').trim();
        const primaryDate = rDate || CalculationService.safeExtractDate(roll) || 'ไม่ระบุวันที่';
        jobsMap[key] = {
          id: roll.headId || roll.id || key,
          jobNo: jNo || '-',
          partNo: roll.partNo || '-',
          productName: roll.productName || roll.prodName || roll.description || '-',
          description: roll.description || roll.productName || '-',
          color: roll.color || 'Natural',
          tube1Spec: roll.tube1Spec || roll.tapTube || '',
          tube2Spec: roll.tube2Spec || '',
          lotNumber: roll.lotNumber || primaryDate,
          date: primaryDate,
          productionDate: primaryDate,
          status: roll.status || (roll.isClosed ? 'CLOSED' : 'IN_PROGRESS'),
          isClosed: Boolean(roll.isClosed || roll.status === 'CLOSED'),
          rolls: [],
          totalGoodMeters: 0,
          totalNgMeters: 0,
          totalAllMeters: 0,
          operators: new Set(),
          operatorName: rollOp
        };
        jobOrder.push(key);
      }

      const item = jobsMap[key];
      const rollTotal = Number(roll.totalMeters || roll.productQty || roll.productedQty || 0);
      const ng = Number(roll.defectMeters !== undefined ? roll.defectMeters : (roll.ng || 0));
      const good = Math.max(0, rollTotal - ng);

      // บันทึกวันที่ที่สมบูรณ์ที่สุด
      if (rDate && rDate !== 'ไม่ระบุวันที่' && (!item.date || item.date === 'ไม่ระบุวันที่')) {
        item.date = rDate;
        item.productionDate = rDate;
      }

      // บันทึก Description ที่สมบูรณ์ที่สุด
      if (roll.description && roll.description !== '-' && (!item.description || item.description === '-' || item.description.length < roll.description.length)) {
        item.description = roll.description;
      }

      item.totalGoodMeters += good;
      item.totalNgMeters += ng;
      item.totalAllMeters += rollTotal;
      item.rolls.push(roll);

      const op = (roll.operatorName || roll.employeeName || roll.operator || '').trim();
      if (op) {
        op.split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => item.operators.add(o));
      }
      if (roll.isClosed || roll.status === 'CLOSED') {
        item.isClosed = true;
        item.status = 'CLOSED';
      }
    });

    // Finalize operatorList and sort rolls within each job
    jobOrder.forEach((k) => {
      const item = jobsMap[k];
      item.operatorList = Array.from(item.operators).join(', ') || item.operatorName || '-';
      item.rolls.sort((a, b) => {
        const rA = Number(a.runNo || a.rollNo || a.sequenceNo || 0);
        const rB = Number(b.runNo || b.rollNo || b.sequenceNo || 0);
        return rA - rB;
      });
    });

    // Sort jobs by date descending, then jobNo
    return jobOrder.map((k) => jobsMap[k]).sort((a, b) => {
      if (a.date === 'ไม่ระบุวันที่') return 1;
      if (b.date === 'ไม่ระบุวันที่') return -1;
      const dCmp = b.date.localeCompare(a.date);
      if (dCmp !== 0) return dCmp;
      return b.jobNo.localeCompare(a.jobNo);
    });
  }, [jobs, keyword, startDate, endDate, sytelineDescriptions]);

  // Auto-fetch Item Description from Syteline for all jobs
  useEffect(() => {
    if (!jobList || jobList.length === 0) return;

    const uncachedJobs = jobList.filter(
      (j) => j.jobNo && j.jobNo !== '-' && !fetchedJobNosRef.current.has(j.jobNo)
    );

    if (uncachedJobs.length === 0) return;

    uncachedJobs.forEach((j) => fetchedJobNosRef.current.add(j.jobNo));

    let isMounted = true;
    const apiBase = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    uncachedJobs.forEach(async (j) => {
      try {
        const res = await axios.get(`${apiBase}/api/ipo/job/${encodeURIComponent(j.jobNo)}`, {
          timeout: 8000,
          headers
        });
        const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        if (isMounted && list.length > 0) {
          const sItem = list[0];
          const desc = (sItem.description || sItem.Description || '').trim();
          if (desc) {
            setSytelineDescriptions((prev) => ({
              ...prev,
              [j.jobNo]: desc
            }));
          }
        }
      } catch {
        // Silently keep fallback description
      }
    });

    return () => {
      isMounted = false;
    };
  }, [jobList]);

  // Filter jobs by status for display in table
  const displayedJobs = useMemo(() => {
    const todayStr = CalculationService.getCurrentDateString();

    if (statusFilter === 'IN_PROGRESS') {
      return jobList.filter((j) => !j.isClosed && j.status !== 'CLOSED');
    }
    if (statusFilter === 'CLOSED') {
      return jobList.filter((j) => j.isClosed || j.status === 'CLOSED');
    }

    // เมื่อเลือก "ทั้งหมด" (ALL):
    // แสดงเฉพาะงานวันนี้ และงานที่ยังไม่ปิด Job (เว้นแต่มีการพิมพ์คำค้นหา keyword เจาะจง)
    if (!keyword.trim()) {
      return jobList.filter((j) => {
        const jDate = getJobDate(j);
        const isToday = jDate === todayStr;
        const isNotClosed = !j.isClosed && j.status !== 'CLOSED';
        return isToday || isNotClosed;
      });
    }

    return jobList;
  }, [jobList, statusFilter, keyword]);

  // Overall summary metrics across displayed jobs
  const totalSummary = useMemo(() => {
    const dates = new Set();
    let totalJobs = displayedJobs.length;
    let totalRuns = 0;
    let totalMeters = 0;
    let totalNg = 0;
    let inProgressCount = 0;
    let closedCount = 0;

    displayedJobs.forEach((j) => {
      if (j.date && j.date !== 'ไม่ระบุวันที่') dates.add(j.date);
      totalRuns += (j.rolls?.length || 1);
      totalMeters += j.totalGoodMeters;
      totalNg += j.totalNgMeters;
      if (j.isClosed || j.status === 'CLOSED') {
        closedCount += 1;
      } else {
        inProgressCount += 1;
      }
    });

    const totalAll = totalMeters + totalNg;

    return {
      totalDays: dates.size || (displayedJobs.length > 0 ? 1 : 0),
      totalJobs,
      totalRuns,
      inProgressJobs: inProgressCount,
      closedJobs: closedCount,
      totalMeters,
      totalNg,
      totalAll
    };
  }, [displayedJobs]);

  // Count metrics for status filter buttons
  const statusCounts = useMemo(() => {
    const todayStr = CalculationService.getCurrentDateString();
    let inProgress = 0;
    let closed = 0;
    let allActive = 0;

    jobList.forEach((j) => {
      const isClosed = j.isClosed || j.status === 'CLOSED';
      if (isClosed) {
        closed += 1;
      } else {
        inProgress += 1;
      }
      const jDate = getJobDate(j);
      const isToday = jDate === todayStr;
      if (isToday || !isClosed) {
        allActive += 1;
      }
    });

    return {
      inProgress,
      closed,
      allActive: keyword.trim() ? jobList.length : allActive
    };
  }, [jobList, keyword]);

  const isSearching = Boolean(keyword.trim() || startDate || endDate || statusFilter !== 'ALL');

  const toggleJobExpand = (jobId) => {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId]
    }));
  };

  const handleReset = () => {
    setKeyword('');
    setStartDate('');
    setEndDate('');
    setStatusFilter('ALL');
    try {
      sessionStorage.removeItem('ipo_tube_history_filters');
    } catch {}
    if (paramSearch || paramStart || paramEnd || paramStatus) {
      setSearchParams({});
    }
  };

  const handlePrintReportRange = () => {
    if (!isSearching || totalSummary.totalJobs === 0) return;
    if (startDate && endDate && startDate > endDate) {
      toast.warn('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
      return;
    }
    const params = new URLSearchParams();
    const today = CalculationService.getCurrentDateString();
    const cleanKw = keyword.trim();
    const effectiveStart = startDate || (cleanKw ? '' : today);
    const effectiveEnd = endDate || (cleanKw ? '' : today);
    if (effectiveStart) params.set('startDate', effectiveStart);
    if (effectiveEnd) params.set('endDate', effectiveEnd);
    if (cleanKw) params.set('keyword', cleanKw);
    if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
    params.set('from', 'ipo-tube-history');
    navigate(`/ipo-tube/report/all?${params.toString()}`, {
      state: { from: '/ipo-tube/history', startDate: effectiveStart, endDate: effectiveEnd, keyword: cleanKw, status: statusFilter }
    });
  };

  const handleExportExcel = () => {
    try {
      if (!isSearching) {
        toast.warn('กรุณาระบุวันที่หรือค้นหาข้อมูลก่อนส่งออก Excel');
        return;
      }
      if (startDate && endDate && startDate > endDate) {
        toast.warn('วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด');
        return;
      }
      if (displayedJobs.length === 0 || totalSummary.totalJobs === 0) {
        toast.warn('ไม่พบข้อมูลสำหรับส่งออก Excel');
        return;
      }
      const today = CalculationService.getCurrentDateString();
      const cleanKw = keyword.trim();
      const effectiveStart = startDate || (cleanKw ? '' : today);
      const effectiveEnd = endDate || (cleanKw ? '' : today);

      const fileName = ExcelExportService.exportIpoTubeKpiExcel(displayedJobs, {
        startDate: effectiveStart,
        endDate: effectiveEnd,
        keyword: cleanKw,
        sytelineDescriptions
      });
      toast.success(`ส่งออกไฟล์ Excel สำเร็จ (${fileName})`);
    } catch (err) {
      console.error('[IpoTubeHistory] Export Excel error:', err);
      toast.error(err?.message || 'เกิดข้อผิดพลาดในการส่งออก Excel');
    }
  };

  // Open confirmation modal to Close or Reopen job
  const handleOpenCloseJobModal = (job, action = 'CLOSE') => {
    setCloseModalState({
      isOpen: true,
      job,
      action,
      isLoading: false
    });
  };

  // Confirm close or reopen job action
  const handleConfirmJobStatus = async () => {
    if (!closeModalState.job) return;
    const targetJob = closeModalState.job;
    const isClosing = closeModalState.action === 'CLOSE';

    setCloseModalState((prev) => ({ ...prev, isLoading: true }));
    try {
      await updateJob({
        jobNo: targetJob.jobNo,
        status: isClosing ? 'CLOSED' : 'IN_PROGRESS',
        isClosed: isClosing,
        closedAt: isClosing ? new Date().toISOString() : null,
        rolls: targetJob.rolls
      });

      // บันทึก Activity Log สำหรับการปิด หรือ ปลดล็อก Job
      ActivityLogService.logActivity({
        module: 'IPO_TUBE',
        job: targetJob.jobNo,
        actionType: isClosing ? ACTION_TYPES.CLOSE_JOB : ACTION_TYPES.REOPEN_JOB,
        details: isClosing
          ? `ปิด Job No. "${targetJob.jobNo}" เรียบร้อยแล้ว (${isOfficer ? 'Foreman' : 'Operator'})`
          : `ปลดล็อกเปิด Job No. "${targetJob.jobNo}" กลับมาดำเนินการต่อ (${isOfficer ? 'Foreman' : 'Operator'})`
      });

      toast.success(
        isClosing
          ? `ปิด Job No. "${targetJob.jobNo}" เรียบร้อยแล้ว (CLOSED)`
          : `เปิด Job No. "${targetJob.jobNo}" กลับมาดำเนินการต่อ (IN_PROGRESS)`
      );

      setCloseModalState({
        isOpen: false,
        job: null,
        action: 'CLOSE',
        isLoading: false
      });
    } catch (err) {
      console.error('Error updating job status:', err);
      toast.error('ไม่สามารถอัปเดตสถานะ Job ได้: ' + (err.message || ''));
      setCloseModalState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div
      className="ipo-history-container w-full flex flex-col gap-4 animate-fadeIn"
      style={{ fontFamily: "'TH Sarabun New', 'Sarabun', system-ui, sans-serif" }}
    >
      {/* ── Top Action & Title Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/ipo-tube')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            title="กลับสู่หน้าหลัก IPO TUBE"
          >
            <RiArrowGoBackLine size={15} className="text-blue-700" />
            <span>กลับหน้าหลัก</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                ประวัติรายงานการผลิต IPO TUBE
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              สืบค้น ตรวจสอบข้อมูลการผลิต ออกรายงาน และพิมพ์ฉลากสินค้า (JOB Label)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/ipo-tube/create')}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-[#1e3a8a] hover:from-blue-700 hover:to-[#172554] text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
          title="บันทึก Job ใหม่"
        >
          <Plus size={14} />
          <span>บันทึก Job ใหม่</span>
        </button>
      </div>

      {/* ── Summary KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. จำนวน Job รวม */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
            <Layers size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">จำนวน Job ทั้งหมด</div>
            <div className="text-lg font-black text-blue-700 leading-tight">
              {totalSummary.totalJobs.toLocaleString()} <span className="text-xs font-medium text-slate-500">Jobs</span>
            </div>
            <div className="text-[10.5px] font-semibold text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="text-amber-700 font-bold">กำลังทำ: {totalSummary.inProgressJobs}</span>
              <span>•</span>
              <span className="text-emerald-700 font-bold">ปิดแล้ว: {totalSummary.closedJobs}</span>
            </div>
          </div>
        </div>

        {/* 2. จำนวนรอบการผลิตรวม */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0 border border-sky-100">
            <Layers size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">รอบการผลิตรวม</div>
            <div className="text-lg font-black text-sky-700 leading-tight">
              {totalSummary.totalRuns.toLocaleString()} <span className="text-xs font-medium text-slate-500">รอบ</span>
            </div>
            <div className="text-[10.5px] font-semibold text-slate-400 mt-0.5">
              เฉลี่ย {totalSummary.totalJobs > 0 ? (totalSummary.totalRuns / totalSummary.totalJobs).toFixed(1) : 1} รอบ/Job
            </div>
          </div>
        </div>

        {/* 3. รวมผลิตชิ้นงานดี (เมตร) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">ผลิตได้ (เมตร)</div>
            <div className="text-lg font-black text-emerald-700 leading-tight">
              {totalSummary.totalMeters.toLocaleString()} <span className="text-xs font-medium text-slate-500">ม.</span>
            </div>
          </div>
        </div>

        {/* 4. รวมงานเสีย (เมตร) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">ของเสีย NG รวม</div>
            <div className="text-lg font-black text-rose-600 leading-tight">
              {totalSummary.totalNg.toLocaleString()} <span className="text-xs font-medium text-slate-500">ม.</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Advanced Filter Toolbar ── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Keyword Search */}
          <div className="w-72 sm:w-80">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ค้นหา
            </label>
            <div className="relative">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="ค้นหา Job No, Part No, Lot No, ผู้ผลิต..."
                className="w-full pl-8 pr-7 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
              <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="ล้างคำค้นหา"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Start Date */}
          <div className="w-40">
            <label className="block text-xs font-bold text-slate-700 mb-1">ตั้งแต่วันที่</label>
            <FormattedDateInput value={startDate} onChange={setStartDate} />
          </div>

          {/* End Date */}
          <div className="w-40">
            <label className="block text-xs font-bold text-slate-700 mb-1">ถึงวันที่</label>
            <FormattedDateInput value={endDate} onChange={setEndDate} />
          </div>

          {/* ปุ่มพิมพ์รายงาน PDF */}
          <button
            type="button"
            onClick={handlePrintReportRange}
            disabled={!isSearching || totalSummary.totalJobs === 0}
            className="flex items-center gap-2 h-[36px] px-4 py-2 bg-gradient-to-r from-blue-600 to-[#1e3a8a] hover:from-blue-700 hover:to-[#172554] text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={!isSearching ? "กรุณาระบุวันที่หรือค้นหาข้อมูลก่อนพิมพ์รายงาน PDF" : (totalSummary.totalJobs === 0 ? "ไม่พบข้อมูลสำหรับพิมพ์รายงาน" : "พิมพ์รายงาน PDF")}
          >
            <Printer size={15} />
            <span>PDF</span>
          </button>

          {/* ปุ่มส่งออก Excel สรุป KPI */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={!isSearching || totalSummary.totalJobs === 0}
            className="flex items-center gap-2 h-[36px] px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={!isSearching ? "กรุณาระบุวันที่หรือค้นหาข้อมูลก่อนส่งออก Excel" : (totalSummary.totalJobs === 0 ? "ไม่พบข้อมูลสำหรับส่งออก Excel" : "ส่งออกข้อมูลสรุป KPI เป็นไฟล์ Excel (.xlsx)")}
          >
            <FileSpreadsheet size={15} />
            <span>Excel</span>
          </button>

          {/* ปุ่มพิมพ์ฉลากสินค้า (Sticker Label) */}
          <button
            type="button"
            disabled={!keyword.trim()}
            onClick={() => {
              const cleanQuery = keyword.trim().toUpperCase();
              if (!cleanQuery) return;

              const targetJob = displayedJobs.find(j => {
                const jNo = (j.jobNo || j.rawJobNo || j.job || '').toUpperCase();
                const pNo = (j.partNo || '').toUpperCase();
                const lNo = (j.lotNumber || j.lotNo || j.lotNoTap || '').toUpperCase();
                const dStr = (j.description || sytelineDescriptions[j.jobNo] || '').toUpperCase();
                return jNo === cleanQuery || jNo.includes(cleanQuery) || pNo === cleanQuery || pNo.includes(cleanQuery) || lNo.includes(cleanQuery) || dStr.includes(cleanQuery);
              }) || jobs.find(j => {
                const jNo = (j.jobNo || j.rawJobNo || j.job || '').toUpperCase();
                const pNo = (j.partNo || '').toUpperCase();
                const lNo = (j.lotNumber || j.lotNo || j.lotNoTap || '').toUpperCase();
                const dStr = (j.description || sytelineDescriptions[j.jobNo] || '').toUpperCase();
                return jNo === cleanQuery || jNo.includes(cleanQuery) || pNo === cleanQuery || pNo.includes(cleanQuery) || lNo.includes(cleanQuery) || dStr.includes(cleanQuery);
              });

              if (targetJob) {
                const jNo = (targetJob.jobNo || '').trim();
                const desc = sytelineDescriptions[jNo] || targetJob.description || '';
                setStickerModalState({
                  isOpen: true,
                  jobData: {
                    ...targetJob,
                    jobNo: jNo,
                    description: desc,
                    itemDescription: desc,
                    rolls: targetJob.rolls || [targetJob]
                  },
                  initialQuery: jNo,
                  initialRollNo: null
                });
              } else {
                // หากไม่พบในรายการประวัติ ให้เปิดโมดอลดึงข้อมูลจากระบบ SyteLine / LiveApp ทันที
                setStickerModalState({
                  isOpen: true,
                  jobData: null,
                  initialQuery: cleanQuery,
                  initialRollNo: null
                });
              }
            }}
            className="flex items-center gap-2 h-[36px] px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={!keyword.trim() ? "กรุณาระบุ Job No. หรือคำค้นหาก่อนพิมพ์ฉลากสินค้า" : `พิมพ์ฉลากสินค้าสำหรับคำค้นหา "${keyword.trim()}"`}
          >
            <Tag size={15} />
            <span>JOB label</span>
          </button>

          {/* Clear Filter (ไว้ข้างหลัง) */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center justify-center h-[36px] px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
            title="ล้างเงื่อนไขการค้นหาทั้งหมด"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Quick Filter Chips: สถานะการทำงาน & ช่วงเวลา */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-slate-100">
          {/* สถานะการทำงาน Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 mr-1">สถานะ Job:</span>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${statusFilter === 'ALL'
                  ? 'bg-[#1e3a8a] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              ทั้งหมด ({statusCounts.allActive})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${statusFilter === 'IN_PROGRESS'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'IN_PROGRESS' ? 'bg-white' : 'bg-amber-500'}`} />
              กำลังทำ ({statusCounts.inProgress})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('CLOSED')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1 ${statusFilter === 'CLOSED'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
            >
              <CheckCircle2 size={11} className={statusFilter === 'CLOSED' ? 'text-white' : 'text-emerald-600'} />
              ปิด Job แล้ว ({statusCounts.closed})
            </button>
          </div>

          {/* ช่วงเวลาด่วน Filter */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 mr-1">ช่วงเวลาด่วน:</span>
            <button
              type="button"
              onClick={() => applyDatePreset('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${!startDate && !endDate ? 'bg-[#1e3a8a] text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              ทั้งหมด
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('today')}
              className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              วันนี้
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('7days')}
              className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              7 วันล่าสุด
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('month')}
              className="px-2.5 py-1 rounded-lg font-bold text-[11px] bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              เดือนนี้
            </button>
          </div>
        </div>
      </div>

      {/* Search Status Notice */}
      <div className="flex items-center justify-between px-1 text-xs">
        <div>
          {statusFilter === 'ALL' && !keyword.trim() ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-2xs">
              <History size={13} className="text-blue-600" />
              <span>งานวันนี้ และงานที่ยังไม่ปิด Job ({displayedJobs.length} Jobs)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-2xs">
              <Search size={13} className="text-blue-600" />
              <span>ผลการค้นหาตามเงื่อนไข: {displayedJobs.length} Jobs</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Main Clean Table Layout ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-[#1e3a8a] text-white font-bold text-xs select-none shadow-xs">
                <th className="py-3.5 px-3 text-center w-12">ลำดับ</th>
                <th className="py-3.5 px-3 text-left min-w-[120px]">วันที่ผลิต</th>
                <th className="py-3.5 px-4 text-left min-w-[160px]">JOB / PART NO.</th>
                <th className="py-3.5 px-4 text-left min-w-[260px]">รายละเอียดสินค้า</th>
                <th className="py-3.5 px-3 text-center min-w-[120px]">PART LOT NO.</th>
                <th className="py-3.5 px-3 text-center min-w-[95px]">ม้วน LOT</th>
                <th className="py-3.5 px-3 text-left min-w-[140px]">ผู้ผลิต</th>
                <th className="py-3.5 px-4 text-right w-28 pr-6">OK (ม.)</th>
                <th className="py-3.5 px-4 text-right w-24 pr-6">NG (ม.)</th>
                <th className="py-3.5 px-4 text-center min-w-[130px]">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedJobs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-slate-400">
                    <History size={36} className="mx-auto mb-2 text-slate-300 opacity-60" />
                    <div className="font-semibold text-slate-600 mb-1">
                      {isSearching
                        ? 'ไม่พบข้อมูลประวัติการผลิตที่ตรงกับเงื่อนไข'
                        : 'ยังไม่มีข้อมูลประวัติการผลิตในระบบ'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {isSearching
                        ? 'ลองปรับเปลี่ยนคำค้นหา หรือช่วงวันที่เพื่อลองใหม่อีกครั้ง'
                        : 'สามารถบันทึก Job การผลิตใหม่ได้ที่ปุ่ม "บันทึก Job ใหม่" ด้านบน'}
                    </div>
                  </td>
                </tr>
              ) : (
                displayedJobs.map((job, idx) => {
                  const isExpanded = Boolean(expandedJobs[job.id]);
                  const cleanProdName = getCleanProductName(job);
                  const sytelineDesc = sytelineDescriptions[job.jobNo];
                  const displayDesc = (sytelineDesc || job.description || job.productName || cleanProdName || '-').trim();
                  const extraSpec = extractSpecOrLength(displayDesc || job.description);

                  return (
                    <React.Fragment key={job.id || `${job.jobNo}_${idx}`}>
                      <tr
                        className={`border-b border-slate-100 transition-colors ${isExpanded ? 'bg-blue-50/20' : 'hover:bg-slate-50/80'
                          }`}
                      >
                        {/* 1. ลำดับ */}
                        <td className="py-4 px-3 text-center font-bold text-slate-400 text-sm">
                          {idx + 1}
                        </td>

                        {/* 2. วันที่ผลิต */}
                        <td className="py-4 px-3 text-left">
                          <div className="font-bold text-slate-800 text-[13px]">
                            {CalculationService.formatDateDisplay(job.date) || '-'}
                          </div>
                          {job.date && job.date !== 'ไม่ระบุวันที่' && (
                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              {getDateLabel(job.date)}
                            </div>
                          )}
                        </td>

                        {/* 3. JOB / PART NO. */}
                        <td className="py-4 px-4 text-left">
                          <div
                            onClick={() =>
                              navigate(`/ipo-tube/report/${encodeURIComponent(job.jobNo)}?from=ipo-tube-history`, {
                                state: { from: '/ipo-tube/history' }
                              })
                            }
                            className="font-black text-slate-900 text-[15px] tracking-tight hover:text-blue-700 cursor-pointer"
                            title="คลิกเพื่อดูรายงาน Job (PDF)"
                          >
                            {job.jobNo}
                          </div>
                          <div className="font-bold text-blue-600 text-[13px] mt-0.5">
                            {job.partNo || '-'}
                          </div>
                        </td>

                        {/* 4. รายละเอียดสินค้า (แสดง Description ตัวเต็มตามสไตล์ SyteLine / Slit + สถานะการทำงาน) */}
                        <td className="py-4 px-4 text-left">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span 
                              className="font-bold text-slate-900 text-[14px] tracking-tight"
                              title={displayDesc}
                            >
                              {displayDesc}
                            </span>

                            {/* สถานะการทำงาน */}
                            {job.isClosed ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs shrink-0">
                                <CheckCircle2 size={11} className="text-emerald-600" />
                                ปิด Job แล้ว
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                กำลังทำ
                              </span>
                            )}
                          </div>

                          <div className="text-slate-400 text-xs mt-1 flex items-center gap-2 flex-wrap">
                            <span>{job.color ? `สี: ${job.color}` : 'สี: Natural'}</span>
                            {job.tube1Spec && (
                              <>
                                <span>•</span>
                                <span>ขนาดท่อ: TAP {job.tube1Spec}{job.tube2Spec ? ` + ${job.tube2Spec}` : ''}</span>
                              </>
                            )}
                            {extraSpec && !displayDesc.includes(extraSpec) && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500 font-medium">{extraSpec}</span>
                              </>
                            )}
                          </div>
                        </td>

                        {/* 5. PART LOT NO. */}
                        <td className="py-4 px-3 text-center">
                          <span className="inline-block px-2.5 py-1 bg-slate-100/90 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200 shadow-2xs">
                            {CalculationService.formatLotNoToAD(job.lotNumber) || job.lotNumber || '-'}
                          </span>
                        </td>

                        {/* 5.1 ม้วน LOT */}
                        <td className="py-4 px-3 text-center">
                          {getJobRollBadges(job)}
                        </td>

                        {/* 6. ผู้ผลิต */}
                        <td className="py-4 px-3 text-left">
                          <div className="flex items-center gap-1.5 text-slate-700 text-xs sm:text-[13px]">
                            <User size={14} className="text-slate-400 shrink-0" />
                            <span className="font-medium truncate max-w-[140px]">
                              {job.operatorList || job.operatorName || '-'}
                            </span>
                          </div>
                        </td>

                        {/* 7. OK */}
                        <td className="py-4 px-4 text-right pr-6">
                          <span className="font-black text-emerald-600 text-base">
                            {(Number(job.totalGoodMeters || 0)).toLocaleString()}
                          </span>
                        </td>

                        {/* 8. NG */}
                        <td className="py-4 px-4 text-right pr-6">
                          <span className={`font-black text-base ${job.totalNgMeters > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {(Number(job.totalNgMeters || 0)).toLocaleString()}
                          </span>
                        </td>

                        {/* 9. จัดการ */}
                        <td className="py-4 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* พิมพ์รายงาน PDF */}
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/ipo-tube/report/${encodeURIComponent(job.jobNo)}?from=ipo-tube-history`, {
                                  state: { from: '/ipo-tube/history' }
                                })
                              }
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="พิมพ์รายงาน PDF"
                            >
                              <Printer size={16} />
                            </button>

                            {/* ปุ่มพิมพ์ฉลากติดม้วน (Sticker Label with QR) */}
                            <button
                              type="button"
                              onClick={() => {
                                const jNo = (job.jobNo || '').trim();
                                const desc = sytelineDescriptions[jNo] || job.description || '';
                                setStickerModalState({
                                  isOpen: true,
                                  jobData: {
                                    ...job,
                                    jobNo: jNo,
                                    description: desc,
                                    itemDescription: desc,
                                    rolls: job.rolls || [job]
                                  },
                                  initialQuery: jNo,
                                  initialRollNo: null
                                });
                              }}
                              className="p-1.5 text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                              title="พิมพ์ฉลากติดม้วน (Sticker Label / QR)"
                            >
                              <Tag size={16} />
                            </button>

                            {/* ปุ่มแก้ไข Job (Foreman สามารถแก้ไขได้เสมอ แม้ Job ปิดแล้ว) */}
                            {isOfficer && (
                              <button
                                type="button"
                                onClick={() => navigate(`/ipo-tube/create/${encodeURIComponent(job.jobNo)}`)}
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title={job.isClosed ? "แก้ไข Job ที่ปิดแล้ว (Foreman)" : "แก้ไข Job (Foreman)"}
                              >
                                <Pencil size={16} />
                              </button>
                            )}

                            {/* ปุ่มปิด Job หรือ ปลดล็อก Job */}
                            {!job.isClosed ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCloseJobModal(job, 'CLOSE')}
                                className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="ปิด Job (จบงาน)"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            ) : isOfficer ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCloseJobModal(job, 'REOPEN')}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                title="ปลดล็อก Job / เปิดทำต่อ (Foreman)"
                              >
                                <Unlock size={16} />
                              </button>
                            ) : (
                              <span
                                className="p-1.5 text-slate-300 rounded-lg inline-flex items-center justify-center cursor-default"
                                title="Job นี้ปิดแล้ว"
                              >
                                <Lock size={16} />
                              </span>
                            )}

                            {/* ปุ่มแสดง/ซ่อน รายละเอียดแต่ละรอบ */}
                            <button
                              type="button"
                              onClick={() => toggleJobExpand(job.id)}
                              className={`p-1.5 rounded-lg transition-all cursor-pointer ${isExpanded
                                  ? 'text-blue-600 bg-blue-100 shadow-2xs'
                                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
                                }`}
                              title={isExpanded ? 'ซ่อนรายละเอียดแต่ละรอบ' : 'แสดงรายละเอียดแต่ละรอบ'}
                            >
                              <ChevronDown
                                size={18}
                                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-600' : ''}`}
                              />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Sub-row: รายละเอียดแต่ละรอบการผลิต ── */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 border-b border-slate-200 animate-fadeIn">
                          <td colSpan={9} className="p-3 sm:p-4">
                            <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-hidden">
                              {/* Sub-table Header */}
                              <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 via-sky-50 to-white border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                                    <Layers size={14} className="text-blue-600" />
                                    รายละเอียดรอบการผลิตของ Job: {job.jobNo} ({cleanProdName})
                                  </span>
                                  <span className="text-[11px] font-bold text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-full">
                                    {job.rolls.length} รอบการผลิต
                                  </span>
                                  {job.isClosed ? (
                                    <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <CheckCircle2 size={11} /> ปิด Job แล้ว
                                    </span>
                                  ) : (
                                    <span className="text-[10.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> กำลังทำ
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500 font-medium flex items-center gap-3">
                                  <span>
                                    ผลิตดีรวม: <strong className="text-emerald-700 font-bold">{job.totalGoodMeters.toLocaleString()} ม.</strong>
                                  </span>
                                  {job.totalNgMeters > 0 && (
                                    <span>
                                      ของเสียรวม: <strong className="text-rose-600 font-bold">{job.totalNgMeters.toLocaleString()} ม.</strong>
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Sub-table of Runs */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 text-[11.5px]">
                                      <th className="py-2.5 px-3 text-center w-14">รอบที่</th>
                                      <th className="py-2.5 px-3 text-center w-24">ม้วน LOT</th>
                                      <th className="py-2.5 px-4 min-w-[180px]">เวลาผลิต</th>
                                      <th className="py-2.5 px-4 text-right w-28">ผลิตดี (ม.)</th>
                                      <th className="py-2.5 px-4 text-right w-24">งานเสีย (ม.)</th>
                                      <th className="py-2.5 px-4 text-right w-28">รวม (ม.)</th>
                                      <th className="py-2.5 px-4 text-center w-24">ดูข้อมูล</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {job.rolls.map((roll, rIdx) => {
                                      const rollTotal = Number(roll.totalMeters || roll.productQty || roll.productedQty || 0);
                                      const ngQty = Number(roll.defectMeters !== undefined ? roll.defectMeters : (roll.ng || 0));
                                      const goodQty = Math.max(0, rollTotal - ngQty);
                                      const totalRollMeters = rollTotal;
                                      const runNum = roll.runNo || roll.rollNo || (rIdx + 1);

                                      return (
                                        <tr key={roll.id || `${roll.jobNo}_${rIdx}`} className="hover:bg-blue-50/30 transition-colors">
                                          {/* Run No */}
                                          <td className="py-2.5 px-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-50 text-blue-800 border border-blue-200">
                                              #{runNum}
                                            </span>
                                          </td>

                                          {/* Roll Lot */}
                                          <td className="py-2.5 px-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                                              {getRollLotDisplay(roll)}
                                            </span>
                                          </td>

                                          {/* Time & Recorder */}
                                          <td className="py-2.5 px-4 text-[11.5px]">
                                            <div className="font-bold text-slate-800">
                                              {roll.startTime && roll.endTime ? `${roll.startTime} - ${roll.endTime}` : '-'}
                                            </div>
                                            {roll.totalTime && (
                                              <div className="text-[10px] text-blue-700 font-semibold mt-0.5">
                                                ระยะเวลา: {roll.totalTime}
                                              </div>
                                            )}
                                            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                              ผู้บันทึก: <span className="text-slate-800 font-bold">{roll.operatorName || roll.employeeName || job.operatorList || '-'}</span>
                                            </div>
                                          </td>

                                          {/* OK Meters */}
                                          <td className="py-2.5 px-4 text-right font-black text-emerald-700">
                                            {goodQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ม.</span>
                                          </td>

                                          {/* NG Meters */}
                                          <td className="py-2.5 px-4 text-right font-bold">
                                            {ngQty > 0 ? (
                                              <span className="text-rose-600">{ngQty.toLocaleString()}</span>
                                            ) : (
                                              <span className="text-slate-400">0</span>
                                            )}
                                          </td>

                                          {/* Total Meters */}
                                          <td className="py-2.5 px-4 text-right font-black text-slate-800">
                                            {totalRollMeters.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ม.</span>
                                          </td>

                                          {/* Print / Edit for this roll */}
                                          <td className="py-2.5 px-4 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  navigate(`/ipo-tube/report/${encodeURIComponent(job.jobNo)}?run=${runNum}&from=ipo-tube-history`, {
                                                    state: { from: '/ipo-tube/history' }
                                                  })
                                                }
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
                                                title={`พิมพ์รายงานเฉพาะรอบที่ ${runNum} (PDF)`}
                                              >
                                                <Printer size={16} />
                                              </button>

                                              {/* พิมพ์ฉลากเฉพาะรอบนี้ */}
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const jNo = (job.jobNo || '').trim();
                                                  const desc = sytelineDescriptions[jNo] || roll.description || job.description || '';
                                                  setStickerModalState({
                                                    isOpen: true,
                                                    jobData: {
                                                      ...job,
                                                      ...roll,
                                                      jobNo: jNo,
                                                      description: desc,
                                                      itemDescription: desc,
                                                      rolls: job.rolls || [job]
                                                    },
                                                    initialQuery: jNo,
                                                    initialRollNo: runNum
                                                  });
                                                }}
                                                className="p-1.5 rounded-lg text-orange-600 hover:text-orange-800 hover:bg-orange-50 transition-colors cursor-pointer"
                                                title={`พิมพ์ฉลากม้วนที่ ${runNum} (Sticker Label / QR)`}
                                              >
                                                <Tag size={15} />
                                              </button>
                                              {isOfficer && (
                                                <button
                                                  type="button"
                                                  onClick={() => navigate(`/ipo-tube/create/${encodeURIComponent(job.jobNo)}`)}
                                                  className="p-1.5 rounded-lg text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors cursor-pointer"
                                                  title={`แก้ไขข้อมูลรอบที่ ${runNum} (Foreman)`}
                                                >
                                                  <Pencil size={15} />
                                                </button>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ยืนยันการปิด Job หรือเปิดทำต่อ ── */}
      {closeModalState.isOpen && closeModalState.job && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
          onClick={() => {
            if (!closeModalState.isLoading) {
              setCloseModalState({ isOpen: false, job: null, action: 'CLOSE', isLoading: false });
            }
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleUp"
            style={{ fontFamily: "'TH Sarabun New', 'Sarabun', system-ui, sans-serif" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`px-5 py-3.5 text-white flex items-center justify-between ${
              closeModalState.action === 'REOPEN'
                ? 'bg-gradient-to-r from-[#1e3a8a] to-[#2563eb]'
                : 'bg-gradient-to-r from-[#003B73] to-[#1e3a8a]'
            }`}>
              <div className="flex items-center gap-2">
                {closeModalState.action === 'REOPEN' ? (
                  <Unlock size={20} className="text-cyan-300" />
                ) : (
                  <CheckCircle2 size={20} className="text-emerald-300" />
                )}
                <h3 className="text-base font-bold tracking-wide">
                  {closeModalState.action === 'REOPEN'
                    ? 'ยืนยันการปลดล็อก Job / เปิดทำต่อ (Foreman)'
                    : 'ยืนยันการปิด Job (จบงาน)'}
                </h3>
              </div>

              {!closeModalState.isLoading && (
                <button
                  type="button"
                  onClick={() => setCloseModalState({ isOpen: false, job: null, action: 'CLOSE', isLoading: false })}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-2">
                  <span className="text-slate-500 font-semibold">JOB NO.:</span>
                  <span className="font-black text-slate-900 text-sm">{closeModalState.job.jobNo}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-2">
                  <span className="text-slate-500 font-semibold">PART NO.:</span>
                  <span className="font-bold text-blue-700">{closeModalState.job.partNo || '-'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-2">
                  <span className="text-slate-500 font-semibold">ชื่อสินค้า / BOM:</span>
                  <span className="font-bold text-slate-800">{getCleanProductName(closeModalState.job)}</span>
                </div>
                {(sytelineDescriptions[closeModalState.job?.jobNo] || closeModalState.job?.description) && (
                  <div className="flex justify-between items-start border-b border-slate-200/70 pb-2 gap-2">
                    <span className="text-slate-500 font-semibold shrink-0">รายละเอียดสินค้า:</span>
                    <span className="font-medium text-slate-700 text-right max-w-[280px]" title={sytelineDescriptions[closeModalState.job?.jobNo] || closeModalState.job?.description}>
                      {sytelineDescriptions[closeModalState.job?.jobNo] || closeModalState.job?.description}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center border-b border-slate-200/70 pb-2">
                  <span className="text-slate-500 font-semibold">รอบที่ผลิต:</span>
                  <span className="font-bold text-slate-700">{closeModalState.job.rolls?.length || 0} รอบ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-semibold">ยอดผลิตรวม (OK):</span>
                  <span className="font-black text-emerald-600 text-sm">
                    {(Number(closeModalState.job.totalGoodMeters) || 0).toLocaleString()} ม.
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 text-center font-medium leading-relaxed">
                {closeModalState.action === 'REOPEN'
                  ? 'คุณต้องการปลดล็อก Job นี้กลับเป็นสถานะ "กำลังทำ" (IN_PROGRESS) ใช่หรือไม่? เพื่อให้พนักงาน Operator สามารถทำการผลิตและบันทึกข้อมูลต่อได้'
                  : 'คุณต้องการปิด Job นี้ใช่หรือไม่? เมื่อปิด Job แล้ว สถานะจะเปลี่ยนเป็น "ปิด Job แล้ว" (CLOSED) เพื่อระบุว่าจบกระบวนการผลิต และจะล็อกไม่ให้ Operator ทั่วไปแก้ไข'}
              </p>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={closeModalState.isLoading}
                onClick={() => setCloseModalState({ isOpen: false, job: null, action: 'CLOSE', isLoading: false })}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>

              <button
                type="button"
                disabled={closeModalState.isLoading}
                onClick={handleConfirmJobStatus}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                  closeModalState.action === 'REOPEN'
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
                }`}
              >
                {closeModalState.isLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <>
                    {closeModalState.action === 'REOPEN' ? <Unlock size={14} /> : <CheckCircle2 size={14} />}
                    <span>{closeModalState.action === 'REOPEN' ? 'ยืนยันปลดล็อก Job' : 'ยืนยันปิด Job'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticker Print Modal ── */}
      {stickerModalState.isOpen && (
        <IpoStickerModal
          isOpen={stickerModalState.isOpen}
          onClose={() => setStickerModalState({ isOpen: false, jobData: null, initialQuery: '', initialRollNo: 1 })}
          jobData={stickerModalState.jobData}
          initialQuery={stickerModalState.initialQuery}
          initialRollNo={stickerModalState.initialRollNo}
          allJobs={jobs}
        />
      )}
    </div>
  );
};

export default IpoTubeHistory;
