import axios from 'axios';
import { getLoggedInUser, getUserRole, getDisplayName, getEmployeeId } from './authHelper';

export const LOCAL_STORAGE_ACTIVITY_LOGS_KEY = 'slit_activity_logs_v1';
export const LOCAL_STORAGE_LAST_READ_KEY = 'slit_activity_logs_last_read_v1';
export const LOCAL_STORAGE_READ_IDS_KEY = 'slit_activity_logs_read_ids_v1';

export const normalizeLogDate = (dateStr) => {
  if (!dateStr) return 0;
  if (typeof dateStr === 'number') return dateStr;
  let str = String(dateStr).trim();
  if (str.includes('T') && !str.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(str)) {
    str += 'Z';
  }
  const t = new Date(str).getTime();
  return isNaN(t) ? 0 : t;
};

export const getReadLogIds = () => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_READ_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch {
    // ignore
  }
  return [];
};

export const saveReadLogIds = (ids) => {
  try {
    const trimmed = (ids || []).slice(-500);
    localStorage.setItem(LOCAL_STORAGE_READ_IDS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
};

export const ACTION_TYPES = {
  SAVE_JOB: 'SAVE_JOB',
  SAVE_ROLL: 'SAVE_ROLL',
  EDIT_JOB: 'EDIT_JOB',
  EDIT_ROLL: 'EDIT_ROLL',
  EDIT_CLOSED_JOB: 'EDIT_CLOSED_JOB',
  CLOSE_JOB: 'CLOSE_JOB',
  REOPEN_JOB: 'REOPEN_JOB',
  DELETE_ROLL: 'DELETE_ROLL',
  DELETE_JOB: 'DELETE_JOB',
};

export const ACTION_LABELS = {
  SAVE_JOB: 'บันทึก Job',
  SAVE_ROLL: 'บันทึกยอดรอบ',
  EDIT_JOB: 'แก้ไข Job',
  EDIT_ROLL: 'แก้ไขข้อมูลรอบ',
  EDIT_CLOSED_JOB: 'แก้ไข Job ที่ปิดแล้ว (Foreman)',
  CLOSE_JOB: 'ปิด Job',
  REOPEN_JOB: 'ปลดล็อก Job',
  DELETE_ROLL: 'ลบรอบ',
  DELETE_JOB: 'ลบ Job',
};

export const getStoredLogs = () => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ACTIVITY_LOGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
};

export const saveStoredLogs = (logs) => {
  try {
    const trimmed = (logs || []).slice(0, 300);
    localStorage.setItem(LOCAL_STORAGE_ACTIVITY_LOGS_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
};

export const ActivityLogService = {
  /**
   * บันทึกกิจกรรมการทำงาน (ใครกดบันทึก, ใครแก้ไข, ใครปิดจ๊อบ)
   */
  async logActivity({
    module = 'IPO_TUBE',
    job,
    actionType,
    runNo = null,
    details = '',
    customUser = null
  }) {
    if (!job) return null;

    const user = customUser || getLoggedInUser();
    const employeeName = getDisplayName(user);
    const employeeId = getEmployeeId(user);
    const role = getUserRole(user);
    const now = new Date().toISOString();

    const tempId = 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const logEntry = {
      id: tempId,
      module,
      job: String(job).trim(),
      actionType: actionType || 'SAVE_ROLL',
      employeeId,
      employeeName,
      role,
      runNo: runNo !== null && runNo !== undefined ? Number(runNo) : null,
      details: details || '',
      createdAt: now
    };

    // 1. บันทึกลง Local Cache ทันที เพื่อความรวดเร็วและการทำงานแบบออฟไลน์
    const currentLogs = getStoredLogs();
    const updatedLogs = [logEntry, ...currentLogs];
    saveStoredLogs(updatedLogs);

    // ส่ง Event เพื่อให้ Navbar, Modal และหน้าประวัติต่างๆ อัปเดตทันที
    try {
      window.dispatchEvent(new CustomEvent('activity-log-created', { detail: logEntry }));
    } catch {
      // ignore
    }

    // 2. พยายามซิงค์บันทึกลง SQL Server ผ่าน Backend API
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      };

      const payload = {
        module: logEntry.module,
        job: logEntry.job,
        actionType: logEntry.actionType,
        employeeId: logEntry.employeeId,
        employeeName: logEntry.employeeName,
        role: logEntry.role,
        runNo: logEntry.runNo,
        details: logEntry.details,
        createdAt: now
      };

      const res = await axios.post(`${apiUrl}/api/activitylog`, payload, {
        headers,
        timeout: 4000
      });

      if (res.data?.log?.id) {
        logEntry.id = res.data.log.id;
        // อัปเดต ID จากเซิร์ฟเวอร์ลง LocalStorage
        try {
          const freshStored = getStoredLogs();
          const synced = freshStored.map((item) => (item && item.id === tempId ? { ...item, id: res.data.log.id } : item));
          saveStoredLogs(synced);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      // หาก API ยังไม่พร้อมใช้งาน ให้เก็บไว้ใน LocalStorage ต่อไป
      console.warn('[ActivityLogService] Server sync notice (stored locally):', err.message);
    }

    return logEntry;
  },

  /**
   * ดึงประวัติกิจกรรมทั้งหมด หรือกรองตามเงื่อนไข
   */
  async getRecentLogs({ limit = 100, job = null, module = null, actionType = null } = {}) {
    let serverLogs = [];
    let serverSuccess = false;
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const params = { limit };
      if (job) params.job = job;
      if (module) params.module = module;
      if (actionType) params.actionType = actionType;

      const res = await axios.get(`${apiUrl}/api/activitylog`, {
        params,
        headers,
        timeout: 4000
      });

      if (Array.isArray(res.data)) {
        serverLogs = res.data;
        serverSuccess = true;
      }
    } catch {
      // fallback to local when offline
    }

    let results = [];
    if (serverSuccess) {
      // เมื่อ Server ตอบกลับสำเร็จ ให้ใช้ข้อมูล Server เป็นหลัก (Single Source of Truth)
      // คงไว้เฉพาะ local log ที่เพิ่งบันทึกไม่เกิน 30 วินาทีที่ยังอยู่ในสถานะ in-flight
      const nowMs = Date.now();
      const recentInFlightLogs = getStoredLogs().filter((l) => {
        if (!l || !String(l.id).startsWith('local_')) return false;
        const createdAtMs = normalizeLogDate(l.createdAt);
        return (nowMs - createdAtMs) < 30000;
      });

      const mergedMap = new Map();
      [...serverLogs, ...recentInFlightLogs].forEach((item) => {
        if (!item) return;
        const key = item.id || `${item.job}_${item.actionType}_${item.runNo || ''}_${(item.createdAt || '').substring(0, 19)}`;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, item);
        }
      });
      results = Array.from(mergedMap.values());
    } else {
      // หากติดต่อ Server ไม่ได้ ใช้แคชจาก LocalStorage
      results = getStoredLogs();
    }

    // Filter local if server didn't handle it
    if (job) {
      results = results.filter((l) => l.job && l.job.toLowerCase().includes(job.toLowerCase()));
    }
    if (module) {
      results = results.filter((l) => l.module === module);
    }
    if (actionType) {
      results = results.filter((l) => l.actionType === actionType);
    }

    results.sort((a, b) => normalizeLogDate(b.createdAt) - normalizeLogDate(a.createdAt));

    // บันทึกแคชรวมล่าสุดลง LocalStorage เพื่อให้สอดคล้องกับ Server เสมอ
    if (!job && !module && !actionType) {
      saveStoredLogs(results);
    }

    return results.slice(0, limit);
  },

  /**
   * ล้างประวัติกิจกรรมทั้งหมด (ทั้งใน LocalStorage และบน Server)
   */
  async clearAllLogs() {
    try {
      localStorage.removeItem(LOCAL_STORAGE_ACTIVITY_LOGS_KEY);
      localStorage.removeItem(LOCAL_STORAGE_READ_IDS_KEY);
      saveStoredLogs([]);
      saveReadLogIds([]);
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${apiUrl}/api/activitylog`, { headers, timeout: 5000 });
    } catch (e) {
      console.warn('Error clearing activity logs on server:', e);
    }
    window.dispatchEvent(new Event('activity-logs-read'));
    window.dispatchEvent(new CustomEvent('activity-log-created', { detail: null }));
  },

  /**
   * ดึงประวัติกิจกรรมเฉพาะ Job นั้นๆ
   */
  async getLogsByJob(jobNumber) {
    if (!jobNumber) return [];
    return this.getRecentLogs({ job: jobNumber, limit: 100 });
  },

  /**
   * ซิงค์ประวัติจากเซิร์ฟเวอร์และคำนวณจำนวนที่ยังไม่อ่าน
   */
  async syncUnreadCount() {
    try {
      const logs = await this.getRecentLogs({ limit: 100 });
      return this.getUnreadCount(logs);
    } catch {
      return this.getUnreadCount();
    }
  },

  /**
   * ตรวจสอบว่ากิจกรรมรายการนี้ยังไม่ได้อ่านหรือไม่
   */
  isLogUnread(log) {
    if (!log) return false;
    const readIds = getReadLogIds();
    if (log.id && readIds.includes(String(log.id))) {
      return false;
    }
    const lastRead = localStorage.getItem(LOCAL_STORAGE_LAST_READ_KEY);
    if (!lastRead) return true;
    const lastReadTime = normalizeLogDate(lastRead);
    const logTime = normalizeLogDate(log.createdAt);
    return logTime > lastReadTime;
  },

  /**
   * นับจำนวนการแจ้งเตือนที่ยังไม่ได้อ่าน
   */
  getUnreadCount(logs = getStoredLogs()) {
    try {
      const readIds = new Set(getReadLogIds());
      const lastRead = localStorage.getItem(LOCAL_STORAGE_LAST_READ_KEY);
      const lastReadTime = lastRead ? normalizeLogDate(lastRead) : 0;

      return logs.filter((l) => {
        if (!l) return false;
        if (l.id && readIds.has(String(l.id))) return false;
        const logTime = normalizeLogDate(l.createdAt);
        return logTime > lastReadTime;
      }).length;
    } catch {
      return 0;
    }
  },

  /**
   * ดึงเวลาที่อ่านการแจ้งเตือนล่าสุด
   */
  getLastReadTime() {
    try {
      return localStorage.getItem(LOCAL_STORAGE_LAST_READ_KEY);
    } catch {
      return null;
    }
  },

  /**
   * ทำเครื่องหมายว่าอ่านเฉพาะรายการที่ระบุแล้ว (เช่น เมื่อกดเปิดดู/กดแก้ไข)
   */
  markLogAsRead(logId) {
    if (!logId) return;
    try {
      const current = getReadLogIds();
      const sId = String(logId);
      if (!current.includes(sId)) {
        saveReadLogIds([...current, sId]);
      }
      window.dispatchEvent(new CustomEvent('activity-logs-read', { detail: { logId: sId } }));
    } catch {
      // ignore
    }
  },

  /**
   * ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว
   */
  markAllAsRead(providedLogs = null) {
    try {
      const logs = providedLogs && providedLogs.length > 0 ? providedLogs : getStoredLogs();

      // 1. บันทึก ID ของรายการทั้งหมดที่มีอยู่ ณ ตอนนี้ให้ถือว่าอ่านแล้วแน่นอน
      const allIds = (logs || []).map((l) => String(l.id)).filter(Boolean);
      const currentRead = getReadLogIds();
      const mergedRead = Array.from(new Set([...currentRead, ...allIds]));
      saveReadLogIds(mergedRead);

      // 2. ปรับเวลาล่าสุดให้อย่างน้อยเท่ากับเวลาของรายการล่าสุด + 1 วินาที หรือเวลาปัจจุบัน
      let maxLogTime = Date.now();
      (logs || []).forEach((l) => {
        const t = normalizeLogDate(l.createdAt);
        if (t > maxLogTime) maxLogTime = t;
      });
      localStorage.setItem(LOCAL_STORAGE_LAST_READ_KEY, new Date(maxLogTime + 1000).toISOString());

      window.dispatchEvent(new Event('activity-logs-read'));
    } catch {
      // ignore
    }
  },

  /**
   * เข้ากันได้กับโค้ดเดิม
   */
  markAsRead() {
    this.markAllAsRead();
  }
};
