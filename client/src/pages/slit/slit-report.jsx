import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useSlit } from '../../context/SlitContext';
import { PrintableReportView } from '../../components/Report/PrintableReportView';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { CalculationService } from '../../services/calculationService';

export const SlitReport = () => {
  const { jobNumber } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { jobs, header } = useSlit();
  const [serverSpecs, setServerSpecs] = useState({});
  const fetchedJobsRef = useRef(new Set());

  const fromParam = searchParams.get('from');
  const isAllReport = !jobNumber || jobNumber === 'all';

  // Read date and keyword query parameters from URL (filtered in history page)
  const startDate = searchParams.get('startDate') || searchParams.get('date') || location.state?.startDate || '';
  const endDate = searchParams.get('endDate') || searchParams.get('date') || location.state?.endDate || '';
  const keyword = searchParams.get('keyword') || searchParams.get('search') || searchParams.get('jobNo') || location.state?.keyword || '';

  const [directJob, setDirectJob] = useState(() => location.state?.singleJob || location.state?.selectedJob || null);

  // Fallback fetch if viewing a specific job directly without state
  useEffect(() => {
    if (isAllReport || directJob) return;
    const decodedTarget = decodeURIComponent(String(jobNumber || '').trim());
    if (!decodedTarget || decodedTarget === '-') return;

    const apiBase = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    axios.get(`${apiBase}/api/slit/full`, { params: { keyword: decodedTarget }, headers, timeout: 8000 })
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const found = res.data.find(j => String(j.id) === decodedTarget || j.rawJobNo === decodedTarget || j.jobNo === decodedTarget) || res.data[0];
          if (found) setDirectJob(found);
        }
      })
      .catch((e) => console.warn('[SlitReport] Failed to fetch direct job:', e));
  }, [jobNumber, isAllReport, directJob]);

  const rawReportJobs = useMemo(() => {
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
            (j.jobNo || '').toLowerCase().includes(cleanKeyword) ||
            (j.rawJobNo || '').toLowerCase().includes(cleanKeyword) ||
            (j.partNo || '').toLowerCase().includes(cleanKeyword) ||
            (j.description || '').toLowerCase().includes(cleanKeyword) ||
            (j.itemDescription || '').toLowerCase().includes(cleanKeyword) ||
            ((j.lotNumber || j.lotNo) || '').toLowerCase().includes(cleanKeyword) ||
            (j.embossLot || '').toLowerCase().includes(cleanKeyword) ||
            (j.operatorName || '').toLowerCase().includes(cleanKeyword) ||
            (Array.isArray(j.firstSheetEntries) && j.firstSheetEntries.some(e =>
              (e.jobNo || e.job || '').toLowerCase().includes(cleanKeyword) ||
              (e.partNo || '').toLowerCase().includes(cleanKeyword)
            ));
          if (!match) return false;
        }

        return true;
      });
    }

    // กรณีดูเฉพาะใบงานเดียว (single job)
    if (directJob) {
      return [directJob];
    }
    if (location.state?.singleJob) {
      return [location.state.singleJob];
    }
    if (location.state?.selectedJob) {
      return [location.state.selectedJob];
    }

    const decodedTarget = decodeURIComponent(String(jobNumber || '').trim());
    return filtered.filter(
      (j) => String(j.id) === decodedTarget ||
             (j.rawJobNo && j.rawJobNo === decodedTarget) ||
             (j.jobNo && j.jobNo !== '-' && j.jobNo === decodedTarget)
    );
  }, [jobs, jobNumber, isAllReport, startDate, endDate, keyword, location.state, directJob]);

  // Auto-fetch MaterialType, ColorName, FinishedItem (Part No. T...), and MaterialItem (Material No. P...) from server
  useEffect(() => {
    if (!rawReportJobs || rawReportJobs.length === 0) return;

    const missingJobNos = Array.from(
      new Set(
        rawReportJobs
          .map((job) => (job.jobNo || job.job || '').trim())
          .filter(
            (jNo) =>
              jNo &&
              jNo !== '-' &&
              !String(jNo).startsWith('MANUAL') &&
              !String(jNo).startsWith('M-') &&
              !String(jNo).startsWith('NO-JOB') &&
              !fetchedJobsRef.current.has(jNo)
          )
      )
    );

    if (missingJobNos.length === 0) return;

    missingJobNos.forEach((jNo) => fetchedJobsRef.current.add(jNo));

    const apiBase = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = {
      'Accept': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    Promise.allSettled(
      missingJobNos.map(async (jNo) => {
        try {
          const res = await axios.get(`${apiBase}/api/slit/job/${encodeURIComponent(jNo)}`, {
            headers,
            timeout: 8000
          });
          const list = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
          if (list.length > 0) {
            const sItem = list[0];
            const mType = (sItem.materialType || sItem.MaterialType || '').trim();
            const cName = (sItem.colorName || sItem.ColorName || '').trim();

            const rawPart = (sItem.itemMst || sItem.ItemMst || sItem.finishedItem || sItem.FinishedItem || sItem.item || '').trim();
            const finishedPartNo = (rawPart && !rawPart.toUpperCase().startsWith('P')) ? rawPart : '';
            let rawMaterialNo = (rawPart && rawPart.toUpperCase().startsWith('P')) ? rawPart : '';

            if (finishedPartNo && !rawMaterialNo) {
              try {
                const bomRes = await axios.get(`${apiBase}/api/slit/bom/${encodeURIComponent(finishedPartNo)}`, {
                  headers,
                  timeout: 5000
                });
                const boms = Array.isArray(bomRes.data) ? bomRes.data : [];
                if (boms.length > 0 && boms[0].materialItem) {
                  rawMaterialNo = boms[0].materialItem.trim();
                }
              } catch {
                // bom query is optional
              }
            }

            return {
              jNo,
              spec: {
                materialType: mType,
                colorName: cName,
                itemMst: finishedPartNo,
                finishedItem: finishedPartNo,
                materialNo: rawMaterialNo
              }
            };
          }
        } catch (e) {
          console.warn('[SlitReport] Failed to query server specs for', jNo, e);
        }
        return { jNo, spec: { notFound: true } };
      })
    ).then((results) => {
      const newSpecs = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) {
          newSpecs[r.value.jNo] = r.value.spec;
        }
      });

      if (Object.keys(newSpecs).length > 0) {
        setServerSpecs((prev) => ({
          ...prev,
          ...newSpecs
        }));
      }
    });
  }, [rawReportJobs]);

  const reportJobs = useMemo(() => {
    return rawReportJobs.map((j) => {
      const spec = serverSpecs[j.jobNo];
      const isP = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('P');
      const isT = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('T');

      const isManualJob = (
        !j.jobNo ||
        j.jobNo === '-' ||
        String(j.jobNo).toUpperCase().startsWith('MANUAL') ||
        String(j.jobNo).toUpperCase().startsWith('NO-JOB')
      );
      const cleanJobNo = isManualJob ? '-' : j.jobNo;

      const resolvedPartNo = (
        (spec?.finishedItem && isT(spec.finishedItem) ? spec.finishedItem : '') ||
        (j.partNo && isT(j.partNo) ? j.partNo : '') ||
        (j.itemMst && isT(j.itemMst) ? j.itemMst : '') ||
        (spec?.finishedItem && !isP(spec.finishedItem) ? spec.finishedItem : '') ||
        (j.partNo && !isP(j.partNo) ? j.partNo : '') ||
        (j.itemMst && !isP(j.itemMst) ? j.itemMst : '') ||
        ''
      );

      const resolvedMaterialNo = (
        (j.materialNo && j.materialNo !== '-' ? j.materialNo.trim() : '') ||
        (j.MaterialNo && j.MaterialNo !== '-' ? j.MaterialNo.trim() : '') ||
        (spec?.materialNo ? spec.materialNo.trim() : '') ||
        (j.partNo && isP(j.partNo) ? j.partNo.trim() : '') ||
        (j.itemMst && isP(j.itemMst) ? j.itemMst.trim() : '') ||
        ''
      );

      if (!spec) {
        return {
          ...j,
          jobNo: cleanJobNo,
          partNo: resolvedPartNo,
          itemMst: resolvedPartNo,
          finishedItem: resolvedPartNo,
          materialNo: resolvedMaterialNo
        };
      }

      return {
        ...j,
        jobNo: cleanJobNo,
        partNo: resolvedPartNo,
        itemMst: resolvedPartNo,
        finishedItem: resolvedPartNo,
        materialType: spec.materialType || j.materialType,
        foamName: spec.materialType || j.foamName,
        colorName: spec.colorName || j.colorName,
        color: spec.colorName || j.color,
        materialNo: resolvedMaterialNo,
      };
    });
  }, [rawReportJobs, serverSpecs]);

  const effectiveHeader = useMemo(() => {
    const todayStr = CalculationService.getCurrentDateString();
    let reportDate = '';

    if (startDate && endDate) {
      if (startDate === endDate) {
        reportDate = startDate;
      } else {
        reportDate = `${startDate} ถึง ${endDate}`;
      }
    } else if (startDate) {
      reportDate = startDate;
    } else if (endDate) {
      reportDate = endDate;
    } else if (!isAllReport && reportJobs[0]) {
      reportDate = CalculationService.safeExtractDate(reportJobs[0]) || todayStr;
    } else if (reportJobs.length > 0) {
      const dates = Array.from(new Set(reportJobs.map(j => CalculationService.safeExtractDate(j)).filter(Boolean)));
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
      startDate,
      endDate,
      date: reportDate,
      keyword: keyword.trim(),
      isMonthly: isAllReport,
      isDateRange: isAllReport || Boolean(startDate && endDate && startDate !== endDate),
      isAllReport,
    };
  }, [header, isAllReport, reportJobs, startDate, endDate, keyword]);

  const handleBack = () => {
    // 1. ถ้ามีส่ง state.from มา เช่นมาจาก /slit-history หรือ /slit-list
    if (location.state?.from) {
      navigate(location.state.from);
      return;
    }
    // 2. ถ้ามี query param ?from=...
    if (fromParam === 'slit-history' || fromParam === 'history' || fromParam === 'slit-list' || fromParam === 'list') {
      navigate('/slit-history');
      return;
    }
    // 3. Fallback ใช้ browser history
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // 4. Default fallback
    navigate('/slit-history');
  };

  const cleanKw = keyword.trim().toUpperCase();
  const effectiveReportTitle = cleanKw
    ? `รายงานการผลิต SLIT (Job: ${cleanKw})`
    : undefined;
  const effectiveFileNamePrefix = cleanKw
    ? `SLIT_Report_${cleanKw}`
    : 'SLIT_Report';

  return (
    <div className="min-h-screen bg-slate-100 animate-fadeIn">
      <ErrorBoundary>
        <PrintableReportView
          jobs={reportJobs}
          header={effectiveHeader}
          reportTitle={effectiveReportTitle}
          fileNamePrefix={effectiveFileNamePrefix}
          onBack={handleBack}
        />
      </ErrorBoundary>
    </div>
  );
};

export default SlitReport;
