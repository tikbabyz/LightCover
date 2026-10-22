import React, { useMemo } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import { CalculationService } from '../../services/calculationService';
import { SlitReportDocument } from './slit/slit-report-document';
import { isOfficerUser, getDisplayName } from '../../services/authHelper';

export const PrintableReportView = ({
  jobs = [],
  header = {},
  onBack,
  title,
  department,
  machine,
  reportTitle,
  fileNamePrefix,
  ReportDocument = SlitReportDocument,
  qfCode,
  extraToolbar,
  ...restProps
}) => {
  const summary = useMemo(() => CalculationService.calculateDailySummary(jobs, 95.0), [jobs]);
  const isOfficer = isOfficerUser();
  const currentForemanName = isOfficer ? getDisplayName() : '';

  // Format date as dd-mm-yyyy in ค.ศ. (A.D. e.g. 03-09-2026)
  const formatSingleDate = (d) => {
    if (!d) return '';
    try {
      const clean = String(d).trim().split('T')[0];
      const p = clean.split('-');
      if (p.length === 3 && p[0].length === 4) {
        return `${p[2].padStart(2, '0')}-${p[1].padStart(2, '0')}-${p[0]}`;
      }
      return clean;
    } catch {
      return String(d);
    }
  };

  const formatReportDate = (dateStr) => {
    try {
      if (header?.startDate && header?.endDate) {
        if (header.startDate === header.endDate) {
          return formatSingleDate(header.startDate);
        }
        return `${formatSingleDate(header.startDate)} ถึง ${formatSingleDate(header.endDate)}`;
      }

      const target = dateStr || header?.date;
      if (typeof target === 'string' && target.trim()) {
        if (target.includes(' ถึง ')) {
          const [p1, p2] = target.split(' ถึง ').map(s => s.trim());
          return p1 === p2 ? formatSingleDate(p1) : `${formatSingleDate(p1)} ถึง ${formatSingleDate(p2)}`;
        }
        if (target.includes(' - ')) {
          const [p1, p2] = target.split(' - ').map(s => s.trim());
          return p1 === p2 ? formatSingleDate(p1) : `${formatSingleDate(p1)} ถึง ${formatSingleDate(p2)}`;
        }
        const formatted = formatSingleDate(target);
        if (formatted && formatted !== '-') return formatted;
      }

      if (Array.isArray(jobs) && jobs.length > 0) {
        const dates = Array.from(new Set(
          jobs.map(j => CalculationService.safeExtractDate(j?.productionDate || j?.date || j?.createdAt || j?.lotNumber)).filter(Boolean)
        )).sort();
        if (dates.length === 1) return formatSingleDate(dates[0]);
        if (dates.length > 1) return `${formatSingleDate(dates[0])} ถึง ${formatSingleDate(dates[dates.length - 1])}`;
      }

      return formatSingleDate(CalculationService.getCurrentDateString());
    } catch {
      return formatSingleDate(CalculationService.getCurrentDateString());
    }
  };

  const reportDateFormatted = formatReportDate(header?.date);
  const effectivePrefix = fileNamePrefix || (ReportDocument === SlitReportDocument ? 'SLIT_Report' : 'Report');
  const safeDateForFile = reportDateFormatted.replace(/\s+ถึง\s+/g, '_to_').replace(/[^a-zA-Z0-9_-]/g, '_');
  const pdfFileName = `${effectivePrefix}_${safeDateForFile}.pdf`;
  const effectiveTitle = reportTitle || title || (ReportDocument === SlitReportDocument ? 'SLIT Production Report' : 'Production Report');

  // ส่งต่อเฉพาะ props ที่มีการส่งเข้ามาจริงๆ เพื่อไม่ให้ไปทับ Default Props ภายในตัว Document
  const documentProps = useMemo(() => ({
    header,
    jobs,
    summary,
    ...(currentForemanName ? { foremanName: currentForemanName } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(department !== undefined ? { department } : {}),
    ...(machine !== undefined ? { machine } : {}),
    ...(qfCode !== undefined ? { qfCode } : {}),
  }), [header, jobs, summary, currentForemanName, title, department, machine, qfCode]);

  return (
    <div className="flex h-screen w-full flex-col bg-slate-100">
      {/* ── Top Toolbar (Matching Emboss Project) ── */}
      <div className="flex items-center justify-between border-b bg-white px-5 py-3 shadow-xs shrink-0 no-print">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer shadow-xs"
          >
            <ArrowLeft size={16} />
            กลับ
          </button>

          <div className="h-7 w-px bg-slate-200" />

          <div>
            <p className="font-extrabold text-slate-900 text-base leading-tight">
              {effectiveTitle}
            </p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              วันที่ผลิต: <span className="font-bold text-slate-700">{reportDateFormatted}</span>
              {jobs.length > 0 && (
                <span className="ml-2 text-slate-400 font-normal">({jobs.length} รายการ)</span>
              )}
            </p>
          </div>
        </div>

        {extraToolbar && (
          <div className="flex items-center gap-2">
            {extraToolbar}
          </div>
        )}

        {/* ── Download PDF Button (React-PDF) ── */}
        <PDFDownloadLink
          key={`dl-${jobs?.length || 0}-${header?.date || ''}-${header?.startDate || ''}-${header?.endDate || ''}`}
          document={<ReportDocument {...documentProps} />}
          fileName={pdfFileName}
          className="flex items-center gap-2 rounded-lg bg-[#1E3A8A] hover:bg-[#1D4ED8] px-4 py-2 text-sm font-bold text-white shadow-sm transition-all duration-200 cursor-pointer active:scale-95"
        >
          {({ loading }) => (
            <>
              <Download size={16} />
              <span>{loading ? 'กำลังสร้าง PDF...' : 'Download PDF'}</span>
            </>
          )}
        </PDFDownloadLink>
      </div>

      {/* ── PDF Preview Frame (Full Screen / Height with PDF Viewer Toolbar) ── */}
      <div className="flex-1 w-full h-full overflow-hidden">
        {jobs && jobs.length > 0 ? (
          <PDFViewer width="100%" height="100%" showToolbar>
            <ReportDocument {...documentProps} />
          </PDFViewer>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
            <span className="text-xs font-semibold text-slate-500">กำลังเตรียมรายงาน PDF...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrintableReportView;
