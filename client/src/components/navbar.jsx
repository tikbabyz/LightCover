import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  UserCircle,
  ChevronDown,
  LogOut,
  AlertTriangle,
  Bell,
  ShieldCheck
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useSlit } from '../context/SlitContext';
import { isOfficerUser, getUserRole, getLoggedInUser } from '../services/authHelper';
import { ActivityLogService } from '../services/activityLogService';
import { NotificationCenterModal } from './NotificationCenterModal';

export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { header, logout } = useSlit();

  const isIpoTube = location.pathname.startsWith('/ipo-tube');
  const isPortal = location.pathname === '/';

  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const currentUser = getLoggedInUser();
  const isOfficer = isOfficerUser(currentUser);
  const userRole = getUserRole(currentUser);

  const updateUnread = async () => {
    if (!isOfficer) {
      setUnreadCount(0);
      return;
    }

    // 1. อ่านจาก Local Cache ทันทีเพื่อให้แสดงผลเร็วที่สุด
    const localCount = ActivityLogService.getUnreadCount();
    setUnreadCount(localCount);

    // 2. ซิงค์จาก Server เผื่อมีรายการที่เครื่องอื่นบันทึกเข้ามา
    try {
      const serverCount = await ActivityLogService.syncUnreadCount();
      setUnreadCount(serverCount);
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (!isOfficer) {
      setUnreadCount(0);
      return;
    }

    updateUnread();
    const handleNewLog = () => updateUnread();
    const handleRead = () => updateUnread();

    window.addEventListener('activity-log-created', handleNewLog);
    window.addEventListener('activity-logs-read', handleRead);

    // ตรวจสอบการแจ้งเตือนใหม่ทุก 25 วินาที
    const interval = setInterval(updateUnread, 25000);

    return () => {
      window.removeEventListener('activity-log-created', handleNewLog);
      window.removeEventListener('activity-logs-read', handleRead);
      clearInterval(interval);
    };
  }, [isOfficer]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConfirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* ===== NAVBAR ===== */}
      <header className="no-print app-navbar sticky top-0 z-40 bg-white shadow-md">
        <div
          className="flex h-16 max-w-screen-2xl mx-auto items-center justify-between px-4 sm:px-6 lg:px-8"
          style={{ padding: '1rem 2rem' }}
        >
          {/* ── LEFT: Logo + Title (คลิก Logo เพื่อกลับหน้าหลัก) ── */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="flex items-center gap-2.5 select-none transition-opacity hover:opacity-80 no-underline cursor-pointer"
              title="คลิกกลับสู่หน้าหลัก"
            >
              <img
                src={logo}
                alt="INOAC"
                className="h-7 w-auto object-contain"
                onError={(e) => {
                  e.currentTarget.src = '/Inoac.png';
                }}
              />
              <div className="hidden sm:block h-6 w-px bg-slate-200" />
              <div className="hidden sm:flex flex-col leading-tight">
                {isIpoTube ? (
                  <>
                    <span className="text-[13px] font-black tracking-widest text-slate-900 uppercase">
                      IPO TUBE
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-[#0088D2] uppercase mt-0.5">
                      LIGHT COVER · Production Report
                    </span>
                  </>
                ) : isPortal ? (
                  <>
                    <span className="text-[13px] font-black tracking-widest text-slate-900 uppercase">
                      LIGHT COVER PRODUCTION
                    </span>
                    <span className="text-[8.5px] font-bold tracking-wider text-[#0088D2] uppercase mt-0.5 whitespace-nowrap">
                      INOAC INDUSTRIES (THAILAND) CO., LTD.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-black tracking-widest text-slate-900 uppercase">
                      SLIT
                    </span>
                    <span className="text-[9px] font-bold tracking-wider text-[#0088D2] uppercase mt-0.5">
                      LIGHT COVER · Production Report
                    </span>
                  </>
                )}
              </div>
            </Link>
          </div>

          {/* ── RIGHT: Notification Bell & User Profile ── */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* 🔔 Notification Center Button (Officer Only) */}
            {isOfficer && (
              <button
                type="button"
                onClick={() => {
                  setShowNotificationModal(true);
                  ActivityLogService.markAllAsRead();
                  setUnreadCount(0);
                }}
                className="relative p-2 rounded-xl text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors cursor-pointer"
                title={unreadCount > 0 ? `มีการแจ้งเตือนใหม่ ${unreadCount} รายการ` : 'การแจ้งเตือน & ประวัติกิจกรรม'}
              >
                <Bell className="h-5 w-5 text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold leading-none text-white shadow-md ">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            )}

            {/* User Profile Dropdown */}
            <div className="relative flex items-center" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowDropdown((prev) => !prev)}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors duration-200 sm:px-3.5 cursor-pointer ${showDropdown
                  ? 'bg-blue-100 text-blue-600'
                  : isOfficer
                    ? 'bg-indigo-50 text-indigo-950 hover:bg-indigo-100 border border-indigo-200'
                    : 'bg-blue-50 text-blue-950 hover:bg-blue-100'
                  }`}
              >
                <UserCircle className={`h-5 w-5 ${isOfficer ? 'text-indigo-600' : 'text-sky-500'}`} />
                <span className="hidden max-w-36 truncate text-sm font-semibold sm:block">
                  {header?.operatorName || 'Operator'}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showDropdown ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {/* Triangle */}
              <div
                className={`absolute right-5 top-11 h-3 w-3 rotate-45 bg-white shadow-sm transition-all duration-150 ${showDropdown ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
              />

              {/* Dropdown Box */}
              <div
                className={`absolute right-0 top-13 z-50 w-80 origin-top-right overflow-hidden rounded-2xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200 transition-all duration-150 ${showDropdown
                  ? 'translate-y-0 scale-100 opacity-100'
                  : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
                  }`}
              >
                <div className="flex items-center gap-3.5 px-5 py-4 bg-slate-50/70 border-b border-slate-100">
                  <div
                    className={`w-11 h-11 rounded-full text-white flex items-center justify-center text-lg font-bold shrink-0 shadow-md ${isOfficer ? 'bg-indigo-600' : 'bg-blue-600'
                      }`}
                  >
                    {(header?.operatorName || 'O').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">
                      {header?.operatorName || 'Operator'}
                    </p>
                    <p className="text-xs font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                      {isOfficer ? (
                        <span className="text-slate-600 text-[11px]">
                          Foreman
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px]">
                          Operator
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="p-2 space-y-1">
                  {/* Notifications Option (Officer Only) */}
                  {isOfficer && (
                    <>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                        onClick={() => {
                          setShowDropdown(false);
                          setShowNotificationModal(true);
                          ActivityLogService.markAllAsRead();
                          setUnreadCount(0);
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          <Bell size={15} className="text-slate-600" />
                          <span>ประวัติกิจกรรม & การแจ้งเตือน</span>
                        </div>
                        {unreadCount > 0 && (
                          <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-xs">
                            {unreadCount} ใหม่
                          </span>
                        )}
                      </button>
                      <div className="h-px bg-slate-100 w-full my-1" />
                    </>
                  )}

                  {/* Logout Button */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer text-left"
                    onClick={() => {
                      setShowDropdown(false);
                      setShowLogoutModal(true);
                    }}
                  >
                    <LogOut size={15} />
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ===== NOTIFICATION CENTER MODAL (Officer Only) ===== */}
      {isOfficer && showNotificationModal && (
        <NotificationCenterModal
          isOpen={showNotificationModal}
          onClose={() => setShowNotificationModal(false)}
        />
      )}

      {/* ===== LOGOUT CONFIRMATION MODAL ===== */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setShowLogoutModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 animate-fadeIn">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">ยืนยันการออกจากระบบ</h3>
                  <p className="mt-1.5 text-sm text-slate-500">
                    คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบนี้?
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm"
              >
                <LogOut size={15} />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
