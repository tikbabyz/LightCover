import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useIpoTube, mapServerJobsToUiRolls } from '../../context/IpoTubeContext';
import { PrintableReportView } from '../../components/Report/PrintableReportView';
import { IpoTubeReportDocument } from '../../components/Report/ipo/ipo-tube-report-document';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CalculationService } from '../../services/calculationService';
import { IpoService } from '../../services/ipoService';

export const IpoTubeReport = () => {
  const { jobNumber } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const fromParam = searchParams.get('from');
  const runParam = searchParams.get('run') || searchParams.get('round') || searchParams.get('roll');
  const navigate = useNavigate();
  const { jobs, header, refreshJobs } = useIpoTube();
  const [directJobRolls, setDirectJobRolls] = useState(null);
  const [selectedRun, setSelectedRun] = useState(runParam ? String(runParam) : 'all');

  const isAllReport = !jobNumber || jobNumber === 'all';
  const startDate = searchParams.get('startDate') || searchParams.get('date') || location.state?.startDate || '';
  const endDate = searchParams.get('endDate') || searchParams.get('date') || location.state?.endDate || '';
  const keyword = searchParams.get('keyword') || searchParams.get('search') || searchParams.get('jobNo') || location.state?.keyword || '';

  // Only refresh data from SQL Server if jobs is empty in context
  useEffect(() => {
    if (!jobs || jobs.length === 0) {
      refreshJobs?.();
    }
  }, [jobs, refreshJobs]);

  // Sync selectedRun if runParam changes
  useEffect(() => {
    if (runParam) {
      setSelectedRun(String(runParam));
    }
  }, [runParam]);

  // If viewing a specific job, proactively fetch direct from SQL Server API
  useEffect(() => {
    if (!jobNumber || jobNumber === 'all') return;
    const decoded = decodeURIComponent(jobNumber).trim();
    IpoService.getJobByNo(decoded)
      .then((res) => {
        if (res) {
          const mapped = mapServerJobsToUiRolls([res]);
          if (mapped && mapped.length > 0) {
            setDirectJobRolls(mapped);
          }
        }
      })
      .catch((err) => {
        console.warn('[IpoTubeReport] Direct getJobByNo error:', err);
      });
  }, [jobNumber]);

  // All rolls belonging to this job
  const allJobRolls = useMemo(() => {
    let filtered = jobs || [];

    // เมื่อดูรายงานรวม ('all' หรือไม่ระบุ jobNumber) สามารถกรองตามช่วงวันที่ (startDate - endDate) และตาม keyword / Job No.
    if (isAllReport) {
      const cleanKeyword = String(keyword || '').trim().toLowerCase();

      return filtered.filter((j) => {
        const jDate = CalculationService.safeExtractDate(j);
        if (startDate && jDate && jDate < startDate) return false;
        if (endDate && jDate && jDate > endDate) return false;

        if (cleanKeyword) {
          const match =
            (j.jobNo || j.job || '').toLowerCase().includes(cleanKeyword) ||
            (j.partNo || '').toLowerCase().includes(cleanKeyword) ||
            (j.description || j.productName || '').toLowerCase().includes(cleanKeyword) ||
            ((j.lotNumber || j.embossLot || j.lotNoTap) || '').toLowerCase().includes(cleanKeyword) ||
            (j.operatorName || j.employeeName || '').toLowerCase().includes(cleanKeyword) ||
            (j.tapTube || '').toLowerCase().includes(cleanKeyword);
          if (!match) return false;
        }

        return true;
      });
    }

    // กรณีดูเฉพาะใบงานเดียว (single job)
    // 1. ถ้ามี directJobRolls ที่ดึงสดจาก SQL Server API ให้ใช้ก่อนเสมอ เพราะมีข้อมูลม้วนทุกรอบ (run_no 1, 2, ...) ครบถ้วนที่สุด
    if (directJobRolls && directJobRolls.length > 0) {
      return directJobRolls;
    }

    const decoded = decodeURIComponent(jobNumber).trim();
    const matched = filtered.filter((j) => {
      const jNo = (j.jobNo || j.job || '').trim();
      const jId = String(j.id || '').trim();
      const jHeadId = String(j.headId || '').trim();
      return jNo === decoded || jId === decoded || jId.startsWith(`${decoded}_`) || jHeadId === decoded;
    });

    if (matched.length > 0) {
      return matched;
    }

    return [];
  }, [jobs, jobNumber, isAllReport, startDate, endDate, keyword, directJobRolls]);

  // Available runs for selection
  const availableRuns = useMemo(() => {
    if (!jobNumber || jobNumber === 'all' || !allJobRolls || allJobRolls.length <= 1) return [];
    const runs = [];
    allJobRolls.forEach((r, idx) => {
      const runNum = r.runNo || r.rollNo || r.sequenceNo || (idx + 1);
      runs.push({
        runNo: String(runNum),
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        meters: Number(r.productQty || r.totalMeters || 0)
      });
    });
    runs.sort((a, b) => Number(a.runNo) - Number(b.runNo));
    return runs;
  }, [allJobRolls, jobNumber]);

  // Filter rolls based on selectedRun
  const rawReportJobs = useMemo(() => {
    if (!selectedRun || selectedRun === 'all') {
      return allJobRolls;
    }
    const targetRun = Number(selectedRun);
    const filtered = allJobRolls.filter((r, idx) => {
      const rNum = Number(r.runNo || r.rollNo || r.sequenceNo || (idx + 1));
      return rNum === targetRun;
    });
    return filtered.length > 0 ? filtered : allJobRolls;
  }, [allJobRolls, selectedRun]);

  const reportJobs = rawReportJobs;

  const effectiveHeader = useMemo(() => {
    const todayStr = CalculationService.getCurrentDateString();
    let reportDate = '';

    if (startDate && endDate) {
      reportDate = startDate === endDate ? startDate : `${startDate} ถึง ${endDate}`;
    } else if (startDate) {
      reportDate = startDate;
    } else if (endDate) {
      reportDate = endDate;
    } else if (!isAllReport && reportJobs[0]) {
      reportDate = CalculationService.safeExtractDate(reportJobs[0]?.productionDate || reportJobs[0]?.date || reportJobs[0]?.createdAt || reportJobs[0]?.lotNumber) || todayStr;
    } else if (reportJobs.length > 0) {
      const dates = Array.from(new Set(reportJobs.map(j => CalculationService.safeExtractDate(j?.productionDate || j?.date || j?.createdAt || j?.lotNumber)).filter(Boolean)));
      if (dates.length === 1) {
        reportDate = dates[0];
      } else if (dates.length > 1) {
        dates.sort();
        reportDate = `${dates[0]} ถึง ${dates[dates.length - 1]}`;
      } else {
        reportDate = header?.date || todayStr;
      }
    } else {
      reportDate = header?.date || todayStr;
    }

    return {
      ...header,
      date: reportDate,
      startDate,
      endDate,
      keyword: keyword.trim(),
      isMonthly: isAllReport,
      isDateRange: isAllReport || Boolean(startDate && endDate && startDate !== endDate),
      isAllReport,
    };
  }, [header, isAllReport, reportJobs, startDate, endDate, keyword]);

  const handleBack = React.useCallback(() => {
    // 1. ถ้ามีส่ง state.from มา
    if (location.state?.from) {
      const target = location.state.from === '/ipo-tube-history' ? '/ipo-tube/history' : location.state.from;
      navigate(target);
      return;
    }
    // 2. ถ้ามี query param ?from=...
    if (fromParam === 'history' || fromParam === 'ipo-tube-history' || fromParam === 'list' || fromParam === 'ipo-tube-list') {
      navigate('/ipo-tube/history');
      return;
    }
    // 3. Fallback ใช้ browser history
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // 4. Default fallback
    navigate('/ipo-tube/history');
  }, [location.state, fromParam, navigate]);

  const isSingleRun = selectedRun !== 'all';
  const cleanKw = keyword.trim().toUpperCase();
  const effectiveReportTitle = jobNumber && jobNumber !== 'all'
    ? `IPO TUBE Production Report - Job ${jobNumber}${isSingleRun ? ` (รอบที่ ${selectedRun})` : ' (ทุกรอบ)'}`
    : (cleanKw ? `รายงานการผลิต IPO TUBE (Job: ${cleanKw})` : 'IPO TUBE Production Report');

  const effectiveFileNamePrefix = jobNumber && jobNumber !== 'all'
    ? `IPO_TUBE_Report_${jobNumber}${isSingleRun ? `_Round_${selectedRun}` : '_All_Rounds'}`
    : (cleanKw ? `IPO_TUBE_Report_${cleanKw}` : 'IPO_TUBE_Report');

  const extraToolbar = useMemo(() => {
    if (isAllReport || availableRuns.length <= 1) return null;

    return (
      <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
        <span className="text-xs font-bold text-slate-500 px-1 hidden sm:inline">เลือกรอบพิมพ์:</span>
        <button
          type="button"
          onClick={() => setSelectedRun('all')}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            selectedRun === 'all'
              ? 'bg-[#1E3A8A] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200/60'
          }`}
        >
          ทุกรอบ ({availableRuns.length})
        </button>

        {availableRuns.map((r) => (
          <button
            key={r.runNo}
            type="button"
            onClick={() => setSelectedRun(r.runNo)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedRun === r.runNo
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-200/80 border border-slate-200/60'
            }`}
          >
            รอบ #{r.runNo} {r.startTime && r.endTime ? `(${r.startTime} - ${r.endTime})` : ''}
          </button>
        ))}
      </div>
    );
  }, [isAllReport, availableRuns, selectedRun]);

  return (
    <div className="min-h-screen bg-slate-100">
      <ErrorBoundary>
        <PrintableReportView
          jobs={reportJobs}
          header={effectiveHeader}
          onBack={handleBack}
          reportTitle={effectiveReportTitle}
          fileNamePrefix={effectiveFileNamePrefix}
          ReportDocument={IpoTubeReportDocument}
          extraToolbar={extraToolbar}
        />
      </ErrorBoundary>
    </div>
  );
};

export default IpoTubeReport;
