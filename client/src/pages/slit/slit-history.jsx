import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  History,
  Search,
  Calendar,
  Eye,
  Printer,
  FileSpreadsheet,
  RotateCcw,
  Layers,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  X,
  Plus,
  Pencil,
  Tag
} from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';
import { useSlit } from '../../context/SlitContext';
import { JobDetailViewModal } from '../../components/Report/slit/JobDetailViewModal';
import { CalculationService } from '../../services/calculationService';
import { isOfficerUser } from '../../services/authHelper';
import { SlitStickerModal } from './components/SlitStickerModal';
import { ExcelExportService } from '../../services/excelExportService';

// Custom Date Picker component that always renders as dd/mm/yyyy
const FormattedDateInput = ({ value, onChange, placeholder = "dd/mm/yyyy" }) => {
  const inputRef = React.useRef(null);

  const displayValue = useMemo(() => {
    if (!value) return '';
    try {
      const cleanStr = String(value).trim();
      const parts = cleanStr.includes('T') ? cleanStr.split('T')[0].split('-') : cleanStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD/MM/YYYY
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
      className="relative flex items-center justify-between w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 cursor-pointer transition-all shadow-xs h-[34px]"
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

export const SlitHistory = () => {
  const navigate = useNavigate();
  const { jobs, header } = useSlit();
  const isOfficer = isOfficerUser();
  const todayDateStr = CalculationService.getCurrentDateString();

  const [keyword, setKeyword] = useState(() => {
    try {
      const saved = sessionStorage.getItem('slit_history_filters');
      if (saved) return JSON.parse(saved).keyword || '';
    } catch { }
    return '';
  });
  const [startDate, setStartDate] = useState(() => {
    try {
      const saved = sessionStorage.getItem('slit_history_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.startDate !== undefined) return parsed.startDate;
      }
    } catch { }
    return todayDateStr;
  });
  const [endDate, setEndDate] = useState(() => {
    try {
      const saved = sessionStorage.getItem('slit_history_filters');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.endDate !== undefined) return parsed.endDate;
      }
    } catch { }
    return todayDateStr;
  });

  // Sticker Print Modal
  const [stickerModalState, setStickerModalState] = useState({
    isOpen: false,
    jobData: null,
    initialQuery: '',
    initialRollNo: 1
  });

  // SyteLine job specs cache (description, colorName, materialType)
  const [sytelineSpecs, setSytelineSpecs] = useState({});
  const fetchedJobNosRef = useRef(new Set());

  React.useEffect(() => {
    console.log(`[SQL Server (IIT_DB)] ออนไลน์: ${jobs.length} รายการ`, jobs);
  }, [jobs]);

  // บันทึกสถานะการค้นหาลง sessionStorage เพื่อให้เมื่อกดยกเลิกหรือย้อนกลับมาจากหน้าแก้ไขยังคงอยู่ที่เดิม
  React.useEffect(() => {
    try {
      if (keyword || startDate || endDate) {
        sessionStorage.setItem('slit_history_filters', JSON.stringify({
          keyword,
          startDate,
          endDate
        }));
      } else {
        sessionStorage.removeItem('slit_history_filters');
      }
    } catch { }
  }, [keyword, startDate, endDate]);

  // View detail of a single job
  const [viewingJobDetail, setViewingJobDetail] = useState(null);

  // Helper to extract YYYY-MM-DD from job
  const getJobDate = (job) => {
    return CalculationService.safeExtractDate(job);
  };

  // Helper to format date for display (DD/MM/YYYY)
  const formatDateDisplay = (dateStr) => {
    return CalculationService.formatDateDisplay(dateStr);
  };

  const getRollLotDisplay = (job) => {
    if (!job) return '-';
    const roll = (job.embossRoll !== undefined && job.embossRoll !== null && String(job.embossRoll).trim() !== '')
      ? String(job.embossRoll).trim()
      : ((job.EmbossRoll !== undefined && job.EmbossRoll !== null && String(job.EmbossRoll).trim() !== '') ? String(job.EmbossRoll).trim() : '');
    const total = (job.embossTotalRoll !== undefined && job.embossTotalRoll !== null && String(job.embossTotalRoll).trim() !== '')
      ? String(job.embossTotalRoll).trim()
      : ((job.EmbossTotalRoll !== undefined && job.EmbossTotalRoll !== null && String(job.EmbossTotalRoll).trim() !== '') ? String(job.EmbossTotalRoll).trim() : '');

    if (roll && total) return `${roll}/${total}`;
    if (roll) return roll;

    const rawLot = job.embossLot || job.lotNumber || job.lotNo || '';
    if (rawLot) {
      const details = CalculationService.extractEmbossDetails(rawLot);
      if (details?.rollNo && details?.totalRolls) return `${details.rollNo}/${details.totalRolls}`;
      if (details?.rollNo) return details.rollNo;
    }
    return '-';
  };

  // Helper to get Thai Day name / status
  const getDateLabel = (dateStr) => {
    if (!dateStr || dateStr === 'ไม่ระบุวันที่') return '';
    try {
      const today = CalculationService.getCurrentDateString();
      if (dateStr === today) return ' (วันนี้)';

      const cleanStr = String(dateStr);
      const parts = cleanStr.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
        return ` (วัน${days[d.getDay()]})`;
      }
    } catch {
      return '';
    }
    return '';
  };

  // ตรวจสอบว่าผู้ใช้กำลังค้นหาอยู่หรือไม่ (ถ้าไม่มีการระบุ keyword หรือวันที่ ถือว่ายังไม่ได้ค้นหา)
  const isSearching = useMemo(() => {
    return !!(keyword.trim() || startDate || endDate);
  }, [keyword, startDate, endDate]);

  // แสดงเป็นตารางรายการ Job ทั้งหมดเรียงต่อกันโดยตรง (Flat Table) ไม่ต้องจัดกลุ่มเป็นวันที่
  const filteredJobs = useMemo(() => {
    const hasDateFilter = Boolean(startDate || endDate);
    const hasKeyword = Boolean(keyword.trim());

    const matched = (jobs || []).filter((job) => {
      const jDate = getJobDate(job);

      // ถ้าไม่มีการระบุช่วงวันที่ และไม่มีการค้นหา keyword ให้แสดงเฉพาะงานของ "วันนี้" (ถ้าวันอื่นให้ค้นหาเอา)
      if (!hasDateFilter && !hasKeyword) {
        if (jDate !== todayDateStr) return false;
      }

      if (startDate && jDate && jDate < startDate) return false;
      if (endDate && jDate && jDate > endDate) return false;

      if (hasKeyword) {
        const term = keyword.toLowerCase().trim();
        const rawJ = (job.jobNo || '').trim();
        const cleanJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
        const mainJ = cleanJ.includes(',') ? cleanJ.split(',')[0].trim() : cleanJ;
        const spec = sytelineSpecs[mainJ] || {};

        const match =
          job.jobNo?.toLowerCase().includes(term) ||
          job.partNo?.toLowerCase().includes(term) ||
          job.description?.toLowerCase().includes(term) ||
          job.itemDescription?.toLowerCase().includes(term) ||
          job.materialType?.toLowerCase().includes(term) ||
          spec.description?.toLowerCase().includes(term) ||
          spec.colorName?.toLowerCase().includes(term) ||
          (job.lotNumber || job.lotNo)?.toLowerCase().includes(term) ||
          job.embossLot?.toLowerCase().includes(term) ||
          String(job.embossRoll || '').toLowerCase().includes(term) ||
          job.operatorName?.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });

    // เรียงลำดับจากวันที่ล่าสุดลงไป ถ้าวันเดียวกันเรียงตามเวลาหรือ sequence
    return matched.sort((a, b) => {
      const dateA = getJobDate(a) || '';
      const dateB = getJobDate(b) || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);

      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      if (timeA !== timeB) return timeB - timeA;

      return (b.sequenceNo || 0) - (a.sequenceNo || 0);
    });
  }, [jobs, keyword, startDate, endDate, sytelineSpecs, todayDateStr]);

  // Auto-fetch accurate Item Description & Color from Syteline
  useEffect(() => {
    if (!filteredJobs || filteredJobs.length === 0) return;

    const uncachedJobs = filteredJobs.filter((j) => {
      const rawJ = (j.jobNo || '').trim();
      const cleanJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
      const mainJ = cleanJ.includes(',') ? cleanJ.split(',')[0].trim() : cleanJ;
      return mainJ && mainJ !== '-' && !mainJ.startsWith('MANUAL') && !mainJ.startsWith('M-') && !mainJ.startsWith('NO-JOB') && !fetchedJobNosRef.current.has(mainJ);
    });

    if (uncachedJobs.length === 0) return;

    uncachedJobs.forEach((j) => {
      const rawJ = (j.jobNo || '').trim();
      const cleanJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
      const mainJ = cleanJ.includes(',') ? cleanJ.split(',')[0].trim() : cleanJ;
      fetchedJobNosRef.current.add(mainJ);
    });

    let isMounted = true;
    const apiBase = import.meta.env.VITE_API_URL || '';

    uncachedJobs.forEach(async (j) => {
      try {
        const rawJ = (j.jobNo || '').trim();
        const cleanJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
        const mainJ = cleanJ.includes(',') ? cleanJ.split(',')[0].trim() : cleanJ;
        const res = await axios.get(`${apiBase}/api/slit/job/${encodeURIComponent(mainJ)}`);
        const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
        if (isMounted && list.length > 0) {
          const sItem = list[0];
          const desc = (sItem.description || sItem.Description || '').trim();
          const color = (sItem.colorName || sItem.ColorName || '').trim();
          const mat = (sItem.materialType || sItem.MaterialType || '').trim();
          if (desc || color || mat) {
            setSytelineSpecs((prev) => ({
              ...prev,
              [mainJ]: { description: desc, colorName: color, materialType: mat }
            }));
          }
        }
      } catch (err) {
        // Silently keep fallback
      }
    });

    return () => {
      isMounted = false;
    };
  }, [filteredJobs]);

  // Overall summary metrics across filtered jobs
  const totalSummary = useMemo(() => {
    let totalJobs = filteredJobs.length;
    let totalPcs = 0;
    let totalNg = 0;
    let yieldTotalSum = 0;

    filteredJobs.forEach((job) => {
      const qty = Number(
        job.totalProductedQty ||
        job.productedQty ||
        (job.firstSheetEntries && job.firstSheetEntries.length > 0
          ? job.firstSheetEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0)
          : (job.productedQty1 ? Number(job.productedQty1) + Number(job.productedQty2 || 0) : 0))
      ) || 0;
      totalPcs += qty;
      totalNg += Number(job.ng || 0);
      yieldTotalSum += Number(job.yield || 0);
    });

    const avgYield = totalJobs > 0 ? (yieldTotalSum / totalJobs).toFixed(1) : '0.0';

    return {
      totalJobs,
      totalPcs,
      totalNg,
      avgYield: Number(avgYield)
    };
  }, [filteredJobs]);

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

  const handleReset = () => {
    setKeyword('');
    setStartDate('');
    setEndDate('');
    try {
      sessionStorage.removeItem('slit_history_filters');
    } catch { }
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
    // ถ้ามีระบุวันที่ให้ใช้วันที่นั้น แต่ถ้าไม่ได้ระบุและไม่มี keyword ให้ใช้วันนี้
    const effectiveStart = startDate || (cleanKw ? '' : today);
    const effectiveEnd = endDate || (cleanKw ? '' : today);
    if (effectiveStart) params.set('startDate', effectiveStart);
    if (effectiveEnd) params.set('endDate', effectiveEnd);
    if (cleanKw) params.set('keyword', cleanKw);
    params.set('from', 'slit-history');
    navigate(`/slit-report/all?${params.toString()}`, {
      state: { from: '/slit-history', startDate: effectiveStart, endDate: effectiveEnd, keyword: cleanKw }
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
      if (filteredJobs.length === 0 || totalSummary.totalJobs === 0) {
        toast.warn('ไม่พบข้อมูลสำหรับส่งออก Excel');
        return;
      }

      const today = CalculationService.getCurrentDateString();
      const cleanKw = keyword.trim();
      const effectiveStart = startDate || (cleanKw ? '' : today);
      const effectiveEnd = endDate || (cleanKw ? '' : today);

      const fileName = ExcelExportService.exportSlitKpiExcel(filteredJobs, {
        startDate: effectiveStart,
        endDate: effectiveEnd,
        keyword: cleanKw,
        sytelineSpecs
      });
      toast.success(`ส่งออกไฟล์ Excel สำเร็จ (${fileName})`);
    } catch (err) {
      console.error('[SlitHistory] Export Excel error:', err);
      toast.error(err?.message || 'เกิดข้อผิดพลาดในการส่งออก Excel');
    }
  };

  return (
    <div className="history-page-container animate-fadeIn w-full flex flex-col gap-4">
      <style>{`
        .history-page-container {
          font-family: 'TH Sarabun New', 'Sarabun', 'Inter', system-ui, sans-serif;
        }
        .stat-card-history {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .stat-icon-wrapper {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .flat-job-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .flat-job-table thead tr {
          background: #1e3a8a;
          color: #ffffff;
          font-weight: 700;
        }
        .flat-job-table th {
          padding: 12px 14px;
          white-space: nowrap;
          color: #ffffff;
        }
        .flat-job-table tbody tr {
          border-bottom: 1px solid #e2e8f0;
          transition: background-color 0.15s ease;
        }
        .flat-job-table tbody tr:hover {
          background-color: #f8fafc;
        }
        .flat-job-table tfoot tr {
          background: #f8fafc;
          border-top: 2px solid #cbd5e1;
          color: #1e293b;
          font-weight: 700;
        }
        .flat-job-table tfoot td {
          padding: 11px 14px;
        }
        .btn-view-day-jobs {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .btn-view-day-jobs:hover {
          background: #dbeafe;
          color: #1e40af;
          border-color: #93c5fd;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(29, 78, 216, 0.15);
        }
        .btn-action-icon-hist {
          width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-action-icon-hist:hover {
          background: #f1f5f9;
          color: #1e293b;
          border-color: #94a3b8;
        }
        .yield-badge-hist {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 800;
        }
        .yield-pass {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        .yield-warn {
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde68a;
        }
        /* Modal Backdrop */
        .hist-modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 50;
        }
        .hist-modal-card {
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          width: 100%;
          max-width: 1100px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          animation: modalSlideUp 0.25s ease-out;
        }
        @keyframes modalSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Top Action & Title Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 py-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem('slit_history_filters');
              } catch { }
              navigate('/slit');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
            title="กลับสู่หน้าหลัก SLIT"
          >
            <RiArrowGoBackLine size={15} className="text-blue-700" />
            <span>กลับหน้าหลัก</span>
          </button>

          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                ประวัติรายงานการผลิต SLIT
              </h1>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              สืบค้น ตรวจสอบข้อมูลการผ่าม้วน ออกรายงาน และพิมพ์ฉลากสินค้า (JOB Label)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/slit/create', { state: { from: '/slit-history' } })}
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
          </div>
        </div>

        {/* 2. ผลิตได้ (PCS.) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">ผลิตได้ (Roll Slit)</div>
            <div className="text-lg font-black text-emerald-700 leading-tight">
              {totalSummary.totalPcs.toLocaleString()} <span className="text-xs font-medium text-slate-500">ม้วน</span>
            </div>
          </div>
        </div>

        {/* 3. ของเสีย NG รวม */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
            <AlertTriangle size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">ของเสีย NG รวม</div>
            <div className="text-lg font-black text-rose-600 leading-tight">
              {totalSummary.totalNg.toLocaleString()} <span className="text-xs font-medium text-slate-500">m.</span>
            </div>
          </div>
        </div>

        {/* 4. % Yield เฉลี่ย */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-500">% Yield เฉลี่ยรวม</div>
            <div className="text-lg font-black text-amber-700 leading-tight">
              {totalSummary.avgYield}%
            </div>
          </div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72 sm:w-80">
            <label className="block text-xs font-bold text-slate-700 mb-1">ค้นหา</label>
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

          <div className="w-40">
            <label className="block text-xs font-bold text-slate-700 mb-1">ตั้งแต่วันที่</label>
            <FormattedDateInput
              value={startDate}
              onChange={setStartDate}
            />
          </div>

          <div className="w-40">
            <label className="block text-xs font-bold text-slate-700 mb-1">ถึงวันที่</label>
            <FormattedDateInput
              value={endDate}
              onChange={setEndDate}
            />
          </div>


          {/* ปุ่มพิมพ์รายงาน PDF */}
          <button
            type="button"
            onClick={handlePrintReportRange}
            disabled={!isSearching || totalSummary.totalJobs === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-[#1e3a8a] hover:from-blue-700 hover:to-[#172554] text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
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
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-700 hover:from-emerald-700 hover:to-green-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title={!isSearching ? "กรุณาระบุวันที่หรือค้นหาข้อมูลก่อนส่งออก Excel" : (totalSummary.totalJobs === 0 ? "ไม่พบข้อมูลสำหรับส่งออก Excel" : "ส่งออกข้อมูลสรุป KPI เป็นไฟล์ Excel (.xlsx)")}
          >
            <FileSpreadsheet size={15} />
            <span>Excel</span>
          </button>


          {/* ปุ่มพิมพ์ฉลากสินค้า (Sticker Label) */}
          <button
            type="button"
            disabled={!keyword.trim() && filteredJobs.length === 0}
            onClick={() => {
              const cleanQuery = keyword.trim().toUpperCase();
              let targetJob = null;
              let matchingEntries = [];

              if (cleanQuery) {
                // 1. ค้นหาใน filteredJobs และ jobs ทั้งหมด
                const searchPool = [...filteredJobs, ...jobs];
                for (const j of searchPool) {
                  if (Array.isArray(j.firstSheetEntries) && j.firstSheetEntries.length > 0) {
                    const matched = j.firstSheetEntries.filter(e => (e.jobNo || e.job || '').toUpperCase().trim() === cleanQuery);
                    if (matched.length > 0) {
                      matchingEntries = matched;
                      targetJob = j;
                      break;
                    }
                  }
                  const jNo = (j.jobNo || j.rawJobNo || j.job || '').toUpperCase();
                  if (jNo === cleanQuery || jNo.split(',').map(s => s.trim()).includes(cleanQuery)) {
                    targetJob = j;
                    if (Array.isArray(j.firstSheetEntries)) {
                      matchingEntries = j.firstSheetEntries.filter(e => (e.jobNo || e.job || '').toUpperCase().trim() === cleanQuery);
                    }
                    break;
                  }
                }
              }

              if (!targetJob && filteredJobs.length > 0) {
                targetJob = filteredJobs[0];
                if (Array.isArray(targetJob.firstSheetEntries)) {
                  matchingEntries = targetJob.firstSheetEntries;
                }
              }

              if (targetJob) {
                const isQueryAJobNo = (cleanQuery.startsWith('S') || cleanQuery.startsWith('J')) ||
                  (targetJob.jobNo || '').toUpperCase().includes(cleanQuery) ||
                  (Array.isArray(targetJob.firstSheetEntries) && targetJob.firstSheetEntries.some(e => (e.jobNo || '').toUpperCase() === cleanQuery));

                const firstEntry = matchingEntries[0] || (Array.isArray(targetJob.firstSheetEntries) ? targetJob.firstSheetEntries[0] : null);
                const exactJobNo = isQueryAJobNo && cleanQuery ? cleanQuery : (firstEntry?.jobNo || (targetJob.jobNo || '').split(',')[0].trim());

                const rawJ = (exactJobNo || '').trim();
                const firstJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
                const mainJ = firstJ.includes(',') ? firstJ.split(',')[0].trim() : firstJ;
                const spec = sytelineSpecs[mainJ] || {};

                const exactPartNo = firstEntry?.partNo || spec.itemMst || targetJob.partNo || '';
                const sumQty = matchingEntries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
                const rollCount = sumQty > 0
                  ? sumQty
                  : (Number(targetJob.totalRolls) || Number(targetJob.totalProductedQty) || Number(targetJob.productedQty) || (Array.isArray(targetJob.rolls) ? targetJob.rolls.length : 1));

                const finalDesc = spec.description || targetJob.itemDescription || targetJob.description || '';

                const isolatedJob = {
                  ...targetJob,
                  jobNo: exactJobNo,
                  partNo: exactPartNo,
                  description: finalDesc,
                  itemDescription: finalDesc,
                  totalRolls: rollCount,
                  baseCount: rollCount,
                  firstSheetEntries: targetJob.firstSheetEntries || [],
                  rolls: Array.from({ length: rollCount }, (_, i) => ({
                    runNo: i + 1,
                    totalRolls: rollCount,
                    jobNo: exactJobNo,
                    partNo: exactPartNo,
                    description: finalDesc,
                    lotNo: targetJob.lotNo || targetJob.lotNumber || targetJob.productionDate || new Date().toISOString().split('T')[0]
                  }))
                };

                setStickerModalState({
                  isOpen: true,
                  jobData: isolatedJob,
                  initialQuery: exactJobNo,
                  initialRollNo: 1
                });
              } else if (cleanQuery) {
                // หากไม่พบในรายการประวัติ ให้เปิด modal ดึงจาก LiveApp API โดยตรง
                setStickerModalState({
                  isOpen: true,
                  jobData: null,
                  initialQuery: cleanQuery,
                  initialRollNo: 1
                });
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={!keyword.trim() ? "พิมพ์ฉลากสินค้า (เลือก Job หรือระบุคำค้นหา)" : "พิมพ์ฉลากสินค้าสำหรับ Job นี้"}
          >
            <Tag size={15} />
            <span>JOB label</span>
          </button>

          {/* ปุ่มล้างตัวกรอง (ไว้ข้างหลัง) */}
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 p-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-full transition-colors cursor-pointer"
            title="ล้างเงื่อนไขการค้นหาทั้งหมด"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs border-t border-slate-100">
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
          {!isSearching ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-semibold shadow-2xs">
              <History size={13} className="text-slate-500" />
              <span>ประวัติการผลิตทั้งหมด ({filteredJobs.length} Jobs)</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-2xs">
              <Search size={13} className="text-blue-600" />
              <span>ผลการค้นหาตามเงื่อนไข: {filteredJobs.length} Jobs</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Flat Jobs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="flat-job-table">
            <thead>
              <tr className="bg-[#1e3a8a] text-white font-bold text-xs select-none shadow-xs">
                <th className="text-center w-12 py-3.5 px-3">#</th>
                <th className="text-left min-w-[130px] py-3.5 px-3">วันที่ผลิต</th>
                <th className="text-left min-w-[160px] py-3.5 px-4">JOB / PART NO.</th>
                <th className="text-left min-w-[260px] py-3.5 px-4">รายละเอียดสินค้า</th>
                <th className="text-left min-w-[120px] py-3.5 px-3">PART LOT NO.</th>
                <th className="text-center min-w-[85px] py-3.5 px-2">ม้วน LOT</th>
                <th className="text-left min-w-[120px] py-3.5 px-3">ผู้ผลิต</th>
                <th className="text-right w-28 py-3.5 px-3">ผลิตได้ (Roll Slit)</th>
                <th className="text-right w-24 py-3.5 px-3">ของเสีย NG</th>
                <th className="text-center w-24 py-3.5 px-3">% Yield</th>
                <th className="text-center w-28 py-3.5 px-3">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-14 text-center text-slate-400">
                    <History size={36} className="mx-auto mb-2 text-slate-300 opacity-60" />
                    <div className="font-semibold text-slate-600 mb-1">
                      {keyword || (startDate && startDate !== todayDateStr) || (endDate && endDate !== todayDateStr)
                        ? 'ไม่พบข้อมูลประวัติการผลิตที่ตรงกับเงื่อนไขที่ค้นหา'
                        : 'ยังไม่มีงานที่ทำในวันนี้'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {keyword || (startDate && startDate !== todayDateStr) || (endDate && endDate !== todayDateStr)
                        ? 'ลองปรับเปลี่ยนคำค้นหา หรือช่วงวันที่เพื่อลองใหม่อีกครั้ง'
                        : 'หากต้องการดูงานวันอื่น สามารถพิมพ์ค้นหาหรือเลือกช่วงวันที่ด้านบน'}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job, idx) => {
                  const jobDate = getJobDate(job);
                  // สิทธิ์การแก้ไข: แก้ไขได้เฉพาะวันต่อวัน (jobDate >= todayDateStr) หากเกินวันแล้วให้เอาดินสอออกเลย ยกเว้น Foreman / Office
                  const isTodayJob = Boolean(jobDate && jobDate >= todayDateStr);
                  const canEditJob = isOfficer || isTodayJob;
                  const cleanJobDisplay = (j) => {
                    if (!j || j === '-' || String(j).toUpperCase().startsWith('MANUAL') || String(j).toUpperCase().startsWith('NO-JOB')) return '-';
                    return j;
                  };
                  const displayJobNo = (
                    job.firstSheetEntries && job.firstSheetEntries.length > 1 && job.firstSheetEntries.some(e => e.jobNo && cleanJobDisplay(e.jobNo) !== cleanJobDisplay(job.jobNo))
                      ? job.firstSheetEntries.map(e => cleanJobDisplay(e.jobNo || job.jobNo)).filter((v, i, a) => a.indexOf(v) === i).join(', ')
                      : cleanJobDisplay(job.jobNo)
                  );
                  const displayPartNo = (
                    job.firstSheetEntries && job.firstSheetEntries.length > 1 && job.firstSheetEntries.some(e => e.partNo && e.partNo !== job.partNo)
                      ? job.firstSheetEntries.map(e => e.partNo || job.partNo).filter((v, i, a) => a.indexOf(v) === i).join(', ')
                      : (job.partNo || '-')
                  );
                  const productedQty = Number(
                    job.totalProductedQty ||
                    job.productedQty ||
                    (job.firstSheetEntries && job.firstSheetEntries.length > 0
                      ? job.firstSheetEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0)
                      : (job.productedQty1 ? Number(job.productedQty1) + Number(job.productedQty2 || 0) : 0))
                  ) || 0;
                  const ngVal = Number(job.ng || 0);
                  const yieldVal = Number(job.yield || 0);

                  const rawJ = (job.jobNo || '').trim();
                  const firstJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
                  const mainJ = firstJ.includes(',') ? firstJ.split(',')[0].trim() : firstJ;
                  const serverSpec = sytelineSpecs[mainJ] || {};

                  const effectiveDesc = (serverSpec.description || job.itemDescription || job.description || job.materialType || job.foamName || '-').trim();
                  const effectiveColor = (serverSpec.colorName || job.colorName || job.color || 'Natural').trim();

                  return (
                    <tr key={job.id || job.jobNo || idx} className="hover:bg-slate-50 transition-colors">
                      {/* 1. Index */}
                      <td className="py-3 px-3 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* 2. Date */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs tracking-wide">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <span>{formatDateDisplay(jobDate)}</span>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 pl-4">
                          {getDateLabel(jobDate)}
                        </div>
                      </td>

                      {/* 3. JOB / PART NO. */}
                      <td className="py-3 px-4 text-left">
                        <div
                          onClick={() => {
                            if (mainJ && mainJ !== '-') {
                              navigate(`/slit-report/${encodeURIComponent(mainJ)}?from=slit-history`, {
                                state: { from: '/slit-history' }
                              });
                            }
                          }}
                          className="font-black text-slate-900 text-[15px] tracking-tight hover:text-blue-700 cursor-pointer"
                          title="คลิกเพื่อดูรายงาน Job (PDF)"
                        >
                          {displayJobNo}
                        </div>
                        <div className="font-bold text-blue-600 text-[13px] mt-0.5">
                          {displayPartNo}
                        </div>
                      </td>

                      {/* 4. รายละเอียดสินค้า */}
                      <td className="py-3 px-4 text-left">
                        <div
                          className="font-bold text-slate-900 text-[14px] tracking-tight"
                          title={effectiveDesc}
                        >
                          {effectiveDesc}
                        </div>
                        <div className="text-slate-400 text-xs mt-1 flex items-center gap-2 flex-wrap">
                          <span>{effectiveColor ? `สี: ${effectiveColor}` : 'สี: Natural'}</span>
                          {job.materialType && !effectiveDesc.includes(job.materialType) && (
                            <>
                              <span>•</span>
                              <span className="text-slate-500 font-medium">{job.materialType}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 5. PART LOT NO. */}
                      <td className="py-3 px-3 text-left">
                        <span className="inline-block px-2.5 py-1 bg-slate-100/90 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200">
                          {(() => {
                            const rawLot = job.embossLot || job.lotNumber || job.lotNo;
                            const details = CalculationService.extractEmbossDetails(rawLot);
                            return details?.lotDate || CalculationService.formatLotNoToAD(rawLot, job.date || job.createdAt) || '-';
                          })()}
                        </span>
                      </td>

                      {/* 6. ม้วน LOT */}
                      <td className="py-3 px-2 text-center">
                        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 font-black text-xs rounded-lg border border-blue-200">
                          {getRollLotDisplay(job)}
                        </span>
                      </td>

                      {/* ผู้ผลิต */}
                      <td className="py-3 px-3 text-slate-700 text-xs font-medium">
                        {job.operatorName || '-'}
                      </td>

                      {/* ผลิตได้ (PCS.) */}
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 text-xs">
                        {productedQty.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">ม้วน</span>
                      </td>

                      {/* ของเสีย NG */}
                      <td className="py-3 px-3 text-right text-xs">
                        {ngVal > 0 ? (
                          <span className="text-rose-600 font-bold">{ngVal.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">m.</span></span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      {/* % Yield */}
                      <td className="py-3 px-3 text-center">
                        <span className={`yield-badge-hist ${yieldVal >= 95 ? 'yield-pass' : 'yield-warn'}`}>
                          {yieldVal >= 95 ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                          <span>{yieldVal}%</span>
                        </span>
                      </td>

                      {/* Action Icons */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* ดูรายละเอียด Job (เหมือนหน้าแก้ไข แต่ดูได้อย่างเดียว) */}
                          <button
                            type="button"
                            onClick={() => {
                              const targetId = job.id ? String(job.id) : (job.rawJobNo || job.jobNo || '-');
                              navigate(`/slit/create/${encodeURIComponent(targetId)}`, {
                                state: { from: '/slit-history', readOnly: true, viewJob: job }
                              });
                            }}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="ดูรายละเอียด Job (ดูได้อย่างเดียว)"
                          >
                            <Eye size={15} />
                          </button>

                          {/* พิมพ์รายงาน PDF ของ Job นี้ */}
                          <button
                            type="button"
                            onClick={() => {
                              const targetId = job.id ? String(job.id) : (job.rawJobNo || job.jobNo || '-');
                              navigate(`/slit-report/${encodeURIComponent(targetId)}`, {
                                state: { from: '/slit-history', singleJob: job }
                              });
                            }}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                            title="พิมพ์รายงาน PDF เฉพาะ Job นี้"
                          >
                            <Printer size={15} />
                          </button>

                          {/* พิมพ์ฉลากติดม้วน (Sticker Label with QR) */}
                          <button
                            type="button"
                            onClick={() => {
                              const cleanKw = keyword.trim().toUpperCase();
                              const singleJobNo = (cleanKw && (job.jobNo || '').toUpperCase().includes(cleanKw))
                                ? cleanKw
                                : (job.firstSheetEntries?.[0]?.jobNo || (job.jobNo || job.rawJobNo || '').split(',')[0].trim());

                              const matchingEntries = Array.isArray(job.firstSheetEntries)
                                ? job.firstSheetEntries.filter(e => (e.jobNo || e.job || '').toUpperCase().trim() === singleJobNo.toUpperCase())
                                : [];
                              const sumQty = matchingEntries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
                              const rawJ = (singleJobNo || '').trim();
                              const firstJ = rawJ.includes('#') ? rawJ.split('#')[0] : rawJ;
                              const mainJ = firstJ.includes(',') ? firstJ.split(',')[0].trim() : firstJ;
                              const spec = sytelineSpecs[mainJ] || {};

                              const firstEntry = matchingEntries[0] || (Array.isArray(job.firstSheetEntries) ? job.firstSheetEntries[0] : null);
                              const singlePartNo = firstEntry?.partNo || spec.itemMst || job.partNo || '';
                              const finalDesc = spec.description || job.itemDescription || job.description || '';
                              const rollCount = sumQty > 0
                                ? sumQty
                                : (Number(job.totalProductedQty) || Number(job.productedQty) || (Array.isArray(job.rolls) ? job.rolls.length : 1));

                              const isolatedJob = {
                                ...job,
                                jobNo: singleJobNo,
                                partNo: singlePartNo,
                                description: finalDesc,
                                itemDescription: finalDesc,
                                totalRolls: rollCount,
                                firstSheetEntries: job.firstSheetEntries || [],
                                rolls: Array.from({ length: rollCount }, (_, i) => ({
                                  runNo: i + 1,
                                  totalRolls: rollCount,
                                  jobNo: singleJobNo,
                                  partNo: singlePartNo,
                                  description: finalDesc,
                                  lotNo: job.lotNo || job.lotNumber || job.productionDate || new Date().toISOString().split('T')[0]
                                }))
                              };

                              setStickerModalState({
                                isOpen: true,
                                jobData: isolatedJob,
                                initialQuery: singleJobNo,
                                initialRollNo: 1
                              });
                            }}
                            className="p-1.5 text-orange-600 hover:text-orange-800 hover:bg-orange-50 rounded-lg cursor-pointer transition-colors"
                            title="พิมพ์ฉลากติดม้วน (Sticker Label / QR)"
                          >
                            <Tag size={15} />
                          </button>

                          {/* แก้ไข Job (เฉพาะวันต่อวัน หรือสิทธิ์ Foreman / Office) */}
                          {canEditJob && (
                            <button
                              type="button"
                              onClick={() => {
                                const targetId = job.id ? String(job.id) : (job.rawJobNo || job.jobNo || '-');
                                navigate(`/slit/create/${encodeURIComponent(targetId)}`, {
                                  state: { from: '/slit-history', viewJob: job }
                                });
                              }}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                              title={isOfficer ? "แก้ไข Job (สิทธิ์ Foreman / Office)" : "แก้ไข Job (บันทึกวันต่อวัน)"}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredJobs.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} className="text-right text-slate-700 font-bold text-xs">
                    รวมทั้งสิ้น ({filteredJobs.length} Jobs):
                  </td>
                  <td className="text-right font-black text-emerald-700 text-xs">
                    {totalSummary.totalPcs.toLocaleString()} ม้วน
                  </td>
                  <td className="text-right font-black text-rose-600 text-xs">
                    {totalSummary.totalNg.toLocaleString()} m.
                  </td>
                  <td className="text-center font-black text-amber-700 text-xs">
                    {totalSummary.avgYield}%
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Single Job Detail View Modal (if user clicks Eye on an individual job) */}
      {viewingJobDetail && (
        <JobDetailViewModal
          job={viewingJobDetail}
          header={header}
          onClose={() => setViewingJobDetail(null)}
        />
      )}

      {/* ── Sticker Print Modal ── */}
      {stickerModalState.isOpen && (
        <SlitStickerModal
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

export default SlitHistory;
