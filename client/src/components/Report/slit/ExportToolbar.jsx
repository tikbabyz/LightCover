import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Search, X } from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';

export const ExportToolbar = ({
  jobs = [],
  searchTerm,
  onSearchChange,
  selectedDateFilter,
  onDateFilterChange,
  todayDateStr,
  isDateReadOnly = false,
  onPrintPdf,
  backRoute = '/slit'
}) => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState(searchTerm || '');

  const formatToDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    try {
      const clean = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr);
      const parts = clean.split('-');
      if (parts.length === 3) {
        return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const displayDateDDMMYYYY = formatToDDMMYYYY(selectedDateFilter || todayDateStr);

  useEffect(() => {
    setSearchInput(searchTerm || '');
  }, [searchTerm]);

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    onSearchChange(searchInput.trim());
  };

  const handleClear = () => {
    setSearchInput('');
    onSearchChange('');
  };

  return (
    <div className="export-toolbar-wrapper no-print">
      <style>{`
        .export-toolbar-wrapper {
          border-radius: 16px;
          padding: 4px 4px 12px 4px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .toolbar-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        .toolbar-main-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          gap: 16px;
          flex-wrap: wrap;
        }
        .filter-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .filter-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #334155;
        }
        .filter-input {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 0.8125rem;
          color: #1e293b;
          background-color: #ffffff;
          outline: none;
          transition: all 0.15s ease;
        }
        .filter-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .search-input-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .btn-search-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          background: #1d4ed8;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .btn-search-action:hover {
          background: #1e40af;
        }
        .btn-print-pdf-main {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          background: #1e3a8a;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 0.8125rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 2px 6px rgba(30, 58, 138, 0.2);
        }
        .btn-print-pdf-main:hover {
          background: #172554;
        }
      `}</style>

      {/* แถวด้านบน: ปุ่มกลับหน้าหลัก (ซ้าย) และ แสดงวันที่ (ขวา) */}
      <div className="toolbar-top-row">
        <button
          type="button"
          onClick={() => navigate(backRoute)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 16px',
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: '10px',
            color: '#334155',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.15s ease'
          }}
          className="hover:bg-slate-50 hover:text-blue-700 hover:border-blue-300 active:scale-95"
          title="กลับ"
        >
          <RiArrowGoBackLine size={16} className="text-blue-600" />
          <span>กลับ</span>
        </button>

        {/* แสดงวันที่ */}
        {isDateReadOnly ? (
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 backdrop-blur-xs border border-slate-200/90 rounded-xl text-xs font-semibold text-slate-600 shadow-xs select-none"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(4px)',
              border: '1px solid rgba(226, 232, 240, 0.9)',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#475569',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
              userSelect: 'none'
            }}
            title="วันที่ของรายงานประจำวัน"
          >
            <span style={{ color: '#94a3b8', fontWeight: 500 }}>รายงานประจำวันที่:</span>
            <span style={{ color: '#1d4ed8', fontWeight: 800, letterSpacing: '0.03em' }}>{displayDateDDMMYYYY}</span>
          </div>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#64748b' }}>วันที่:</span>
            <input
              type="date"
              className="filter-input"
              value={selectedDateFilter || todayDateStr || ''}
              onChange={(e) => onDateFilterChange(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* แถวหลัก: ค้นหา (ซ้าย) และ ปุ่ม Print PDF (ขวา) */}
      <div className="toolbar-main-row">
        {/* ค้นหา */}
        <div className="filter-item" style={{ width: '360px', maxWidth: '100%' }}>
          <form onSubmit={handleSearchSubmit} className="search-input-group">
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                className="filter-input"
                placeholder="พิมพ์คำค้นหา Job No / Part No / รายละเอียด..."
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  onSearchChange(e.target.value);
                }}
                style={{ width: '100%', paddingRight: searchInput ? '2rem' : '0.75rem', height: '37px', boxSizing: 'border-box' }}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClear}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    background: '#e2e8f0',
                    border: 'none',
                    borderRadius: '50%',
                    width: '22px',
                    height: '22px',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'all 0.15s ease'
                  }}
                  className="hover:bg-slate-300 hover:text-slate-800"
                  title="ล้างคำค้นหา"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="btn-search-action"
              style={{ height: '37px', width: '37px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
              title="กดเพื่อค้นหา"
            >
              <Search size={15} />
            </button>
          </form>
        </div>

        {/* ปุ่ม Print PDF */}
        <div className="filter-item" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn-print-pdf-main"
            onClick={onPrintPdf}
            disabled={!jobs || jobs.length === 0}
            style={
              !jobs || jobs.length === 0
                ? { opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#64748b', boxShadow: 'none' }
                : {}
            }
            title={
              !jobs || jobs.length === 0
                ? 'ยังไม่มีข้อมูลการผลิตสำหรับวันนี้ ไม่สามารถพิมพ์รายงานได้'
                : 'พิมพ์หรือบันทึกรายงานเป็น PDF'
            }
          >
            <Printer size={16} />
            <span>Print PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
