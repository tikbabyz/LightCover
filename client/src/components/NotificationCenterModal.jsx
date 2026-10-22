import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Bell,
  CheckCircle2,
  Lock,
  Unlock,
  Pencil,
  Save,
  Trash2,
  Clock,
  User,
  ShieldCheck,
  Search,
  Filter,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { ActivityLogService, ACTION_TYPES, ACTION_LABELS } from '../services/activityLogService';
import { toast } from 'react-toastify';

export const NotificationCenterModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [filterType, setFilterType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await ActivityLogService.getRecentLogs({ limit: 100 });
      setLogs(data);
      ActivityLogService.markAllAsRead(data);
    } catch (e) {
      console.warn('Error fetching logs:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('คุณต้องการล้างประวัติการแจ้งเตือนทั้งหมดใช่หรือไม่?')) return;
    setClearing(true);
    try {
      await ActivityLogService.clearAllLogs();
      setLogs([]);
      toast.success('ล้างประวัติการแจ้งเตือนทั้งหมดเรียบร้อยแล้ว');
    } catch {
      toast.error('เกิดข้อผิดพลาดในการล้างประวัติ');
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    fetchLogs();

    const handleNewLog = () => {
      fetchLogs();
    };

    window.addEventListener('activity-log-created', handleNewLog);

    return () => {
      window.removeEventListener('activity-log-created', handleNewLog);
    };
  }, [isOpen]);

  const handleOpenHistory = (item) => {
    onClose();
    if (item.module === 'SLIT') {
      navigate(`/slit/history?search=${encodeURIComponent(item.job)}`);
    } else {
      navigate(`/ipo-tube/history?search=${encodeURIComponent(item.job)}`);
    }
  };

  const handleOpenJobEdit = (item) => {
    onClose();
    if (item.module === 'SLIT') {
      navigate(`/slit/create/${encodeURIComponent(item.job)}`);
    } else {
      navigate(`/ipo-tube/create/${encodeURIComponent(item.job)}`);
    }
  };

  // Format relative time (e.g., 2 นาทีที่แล้ว)
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return '';
    try {
      const now = new Date();
      const past = new Date(dateStr);
      const diffMs = now - past;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHr / 24);

      if (diffSec < 45) return 'เมื่อสักครู่';
      if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
      if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
      if (diffDay === 1) return 'เมื่อวานนี้';
      if (diffDay < 7) return `${diffDay} วันที่แล้ว`;

      return past.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getActionBadge = (actionType) => {
    switch (actionType) {
      case ACTION_TYPES.SAVE_JOB:
      case ACTION_TYPES.SAVE_ROLL:
        return {
          icon: <Save size={14} className="text-emerald-600" />,
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: actionType === ACTION_TYPES.SAVE_JOB ? 'บันทึก Job' : 'บันทึกรอบ'
        };
      case ACTION_TYPES.EDIT_ROLL:
      case ACTION_TYPES.EDIT_JOB:
        return {
          icon: <Pencil size={14} className="text-amber-600" />,
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          label: 'แก้ไขข้อมูล'
        };
      case ACTION_TYPES.EDIT_CLOSED_JOB:
        return {
          icon: <ShieldCheck size={14} className="text-indigo-600" />,
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          label: 'Foreman แก้ไข Job ปิดแล้ว'
        };
      case ACTION_TYPES.CLOSE_JOB:
        return {
          icon: <Lock size={14} className="text-purple-600" />,
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          label: 'ปิด Job'
        };
      case ACTION_TYPES.REOPEN_JOB:
        return {
          icon: <Unlock size={14} className="text-blue-600" />,
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          label: 'ปลดล็อก Job'
        };
      case ACTION_TYPES.DELETE_ROLL:
      case ACTION_TYPES.DELETE_JOB:
        return {
          icon: <Trash2 size={14} className="text-rose-600" />,
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          label: 'ลบข้อมูล'
        };
      default:
        return {
          icon: <Clock size={14} className="text-slate-600" />,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          label: actionType || 'กิจกรรม'
        };
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Type Filter
      if (filterType === 'SAVE') {
        if (log.actionType !== ACTION_TYPES.SAVE_JOB && log.actionType !== ACTION_TYPES.SAVE_ROLL) {
          return false;
        }
      } else if (filterType === 'EDIT') {
        if (
          log.actionType !== ACTION_TYPES.EDIT_ROLL &&
          log.actionType !== ACTION_TYPES.EDIT_JOB &&
          log.actionType !== ACTION_TYPES.EDIT_CLOSED_JOB
        ) {
          return false;
        }
      } else if (filterType === 'CLOSE') {
        if (log.actionType !== ACTION_TYPES.CLOSE_JOB && log.actionType !== ACTION_TYPES.REOPEN_JOB) {
          return false;
        }
      }

      // Query Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const j = (log.job || '').toLowerCase();
        const emp = (log.employeeName || '').toLowerCase();
        const det = (log.details || '').toLowerCase();
        return j.includes(q) || emp.includes(q) || det.includes(q);
      }

      return true;
    });
  }, [logs, filterType, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10060] flex justify-end animate-fadeIn bg-slate-900/40 backdrop-blur-xs">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200 text-slate-800"
        style={{ fontFamily: "'Prompt', 'Sarabun', system-ui, sans-serif" }}
      >
        {/* ── Top Header ── */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-cyan-300 border border-white/20">
              <Bell size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">การแจ้งเตือน</h2>
              <p className="text-[11px] text-blue-200/80">ประวัติกิจกรรมการผลิต</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Filter Bar & Search ── */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 shrink-0 space-y-2.5">
          {/* Search Input
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาตาม Job No, ชื่อพนักงาน หรือรายละเอียด..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={12} />
              </button>
            )}
          </div> */}

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1 rounded-full font-medium transition cursor-pointer ${filterType === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
            >
              ทั้งหมด ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('SAVE')}
              className={`px-3 py-1 rounded-full font-medium transition cursor-pointer flex items-center gap-1 ${filterType === 'SAVE'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
            >บันทึกงาน
            </button>
            <button
              type="button"
              onClick={() => setFilterType('EDIT')}
              className={`px-3 py-1 rounded-full font-medium transition cursor-pointer flex items-center gap-1 ${filterType === 'EDIT'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
            >แก้ไขงาน
            </button>
            <button
              type="button"
              onClick={() => setFilterType('CLOSE')}
              className={`px-3 py-1 rounded-full font-medium transition cursor-pointer flex items-center gap-1 ${filterType === 'CLOSE'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
            >job
            </button>
          </div>
        </div>

        {/* ── Content List ── */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">กำลังโหลดข้อมูลประวัติกิจกรรม...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <Bell size={24} className="opacity-60" />
              </div>
              <p className="text-sm font-bold text-slate-700">ไม่พบรายการกิจกรรม</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {searchQuery
                  ? 'ไม่มีข้อมูลที่ตรงกับคำค้นหาของคุณ ลองค้นหาด้วยคำอื่น'
                  : 'เมื่อพนักงานเริ่มบันทึก แก้ไข หรือปิด Job ประวัติจะแสดงที่นี่ทันที'}
              </p>
            </div>
          ) : (
            filteredLogs.map((item, idx) => {
              const badge = getActionBadge(item.actionType);
              const isOfficer =
                String(item.role || '').toLowerCase().includes('officer') ||
                String(item.role || '').toLowerCase().includes('admin');

              return (
                <div
                  key={item.id || idx}
                  className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:shadow-xs hover:border-blue-300 transition-all space-y-2"
                >
                  {/* Top Row: User & Role & Time */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isOfficer ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}
                      >
                        {(item.employeeName || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {item.employeeName || 'ผู้ใช้งาน'}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${isOfficer
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-slate-100 text-slate-600'
                              }`}
                          >
                            {isOfficer ? 'Foreman' : 'Operator'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 whitespace-nowrap flex items-center gap-1 shrink-0">
                      <Clock size={12} />
                      <span title={item.createdAt}>{formatTimeAgo(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Middle Row: Action Badge + Details */}
                  <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-100 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${badge.bg}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        Job: {item.job}
                      </span>
                      {item.runNo && (
                        <span className="text-[11px] font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          รอบที่ #{item.runNo}
                        </span>
                      )}
                    </div>

                    {item.details && (
                      <p className="text-xs text-slate-700 leading-relaxed font-medium pt-0.5">
                        {item.details}
                      </p>
                    )}
                  </div>

                  {/* Bottom Row: Quick Navigation Action */}
                  <div className="flex items-center justify-end gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleOpenHistory(item)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1 rounded-md transition cursor-pointer"
                    >
                      <ExternalLink size={12} />
                      เปิดดูในประวัติ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenJobEdit(item)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-indigo-700 hover:bg-indigo-50 px-2.5 py-1 rounded-md transition cursor-pointer"
                    >
                      <Pencil size={12} />
                      เปิดหน้าจัดการ Job
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between text-xs text-slate-500">
          <span>รวมทั้งหมด {filteredLogs.length} รายการ</span>
          <div className="flex items-center gap-3">
            {logs.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                disabled={clearing}
                className="text-rose-600 hover:text-rose-800 disabled:opacity-50 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                title="ล้างประวัติการแจ้งเตือนทั้งหมด"
              >
                <Trash2 size={13} /> {clearing ? 'กำลังล้าง...' : 'ล้างประวัติ'}
              </button>
            )}
            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="text-blue-600 hover:text-blue-800 disabled:opacity-50 font-bold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
