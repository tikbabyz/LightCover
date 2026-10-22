import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { CalculationService } from '../services/calculationService';
import { isTokenExpired } from '../services/authHelper';

/**
 * =============================================================================
 * SlitContext: ศูนย์กลางจัดการ State ข้อมูลการผลิต SLIT ฝั่ง Client
 * =============================================================================
 * สถาปัตยกรรมข้อมูล (Data Architecture):
 * 1. Dual-Persistence: ซิงค์ข้อมูลระหว่าง LocalStorage (แคชฝั่งเครื่อง) และ
 *    SQL Server Database (IIT_DB: ตาราง SlitHead & SlitDetail) ผ่าน REST API
 * 2. Real-time Fallback: หาก Server ขัดข้อง ระบบจะ fallback มาอ่านจากแคชท้องถิ่น
 * 3. Daily Sequencing: จัดเรียงลำดับ SequenceNo แยกตามวันและเวลาที่บันทึกจริง
 * =============================================================================
 */

export const LOCAL_STORAGE_SESSION_KEY = 'slit_production_session_v2';
export const LOCAL_STORAGE_LOGGED_IN_KEY = 'slit_production_logged_in_v2';
export const LOCAL_STORAGE_JOBS_KEY = 'slit_production_jobs_v2';

/** ดึงข้อมูล User ปัจจุบันที่บันทึกไว้ใน LocalStorage จากระบบ Auth */
export const getLoggedInUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch {
    // fallback
  }
  return null;
};

/** แปลงข้อมูล User object ให้เป็นชื่อแสดงผล (FirstName + LastName หรือ Username) */
export const getDisplayNameFromUser = (user) => {
  if (!user) return '';
  const firstName = (user.FirstName || user.firstName || '').trim();
  const lastName = (user.LastName || user.lastName || '').trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  return fullName || user.Username || user.username || '';
};

export const renumberJobsByDate = (jobList) => {
  if (!Array.isArray(jobList)) return [];
  const groups = {};
  const dateOrder = [];

  jobList.forEach((job) => {
    if (!job) return;
    const d = CalculationService.safeExtractDate(job) || 'unknown';
    if (!groups[d]) {
      groups[d] = [];
      dateOrder.push(d);
    }
    groups[d].push(job);
  });

  const result = [];
  dateOrder.forEach((d) => {
    const dailyJobs = groups[d] || [];
    dailyJobs.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime() || 0;
      const timeB = new Date(b.createdAt || 0).getTime() || 0;
      if (timeA !== timeB) return timeA - timeB;
      return (a.sequenceNo || 0) - (b.sequenceNo || 0);
    });

    dailyJobs.forEach((job, idx) => {
      result.push({
        ...job,
        sequenceNo: idx + 1
      });
    });
  });
  return result;
};

export const isIpoJob = (job) => {
  if (!job) return false;
  const desc = (job.description || '').toUpperCase();
  const pName = (job.productName || '').toUpperCase();
  return desc.includes('AP-') || pName.includes('AP-') || desc.includes('ALP6') || pName.includes('ALP6') || desc.includes('AS-') || pName.includes('AS-') || desc.includes('IPO') || !!job.isTwinTube || !!job.tube1Spec || !!job.tapTube;
};

export const getStoredJobs = () => {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_JOBS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // กรองเอาเฉพาะ Job ของ SLIT (คัดแยกและนำ Job ของ IPO TUBE ออกทั้งหมด)
        const validSlitJobs = parsed.filter(Boolean).filter(j => !isIpoJob(j));
        if (validSlitJobs.length !== parsed.length) {
          localStorage.setItem(LOCAL_STORAGE_JOBS_KEY, JSON.stringify(renumberJobsByDate(validSlitJobs)));
        }
        return renumberJobsByDate(validSlitJobs);
      }
    }
  } catch {
    // fallback
  }
  return []; // เริ่มต้นเป็นรายการว่าง ไม่ใช้ mock data
};

export const saveStoredJobs = (jobs) => {
  const filtered = (jobs || []).filter(Boolean).filter(j => !isIpoJob(j));
  const renumbered = renumberJobsByDate(filtered);
  localStorage.setItem(LOCAL_STORAGE_JOBS_KEY, JSON.stringify(renumbered));
  window.dispatchEvent(new Event('storage-jobs-updated'));
  return renumbered;
};

export const getStoredHeader = () => {
  const today = CalculationService.getCurrentDateString();
  const loggedInUser = getLoggedInUser();
  const currentOperatorName = getDisplayNameFromUser(loggedInUser);
  const currentOperatorId = loggedInUser?.EmployeeId 
    ? `EMP-${loggedInUser.EmployeeId}` 
    : (loggedInUser?.employeeId ? `EMP-${loggedInUser.employeeId}` : '');

  const saved = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        ...parsed,
        date: today,
        reportNo: CalculationService.generateReportNo(today, parsed.shift || 'Day'),
        // อัปเดตชื่อผู้บันทึกและรหัสพนักงานให้ตรงกับคนที่ Login อยู่ในขณะนั้นเสมอ
        ...(currentOperatorName ? { operatorName: currentOperatorName } : {}),
        ...(currentOperatorId ? { operatorId: currentOperatorId } : {})
      };
    } catch {
      // fallback
    }
  }
  return {
    reportNo: CalculationService.generateReportNo(today, 'Day'),
    date: today,
    shift: 'Day',
    operatorId: currentOperatorId || 'EMP-001',
    operatorName: currentOperatorName || 'Operator',
    machineNo: 'SL-01',
    lineNo: 'Line 1 (Pipe Line)'
  };
};

export const saveStoredHeader = (header) => {
  localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(header));
  window.dispatchEvent(new Event('storage-header-updated'));
};

export const convertJobToSaveRequest = (job, fallbackOperator = '') => {
  const targetJob = (job.jobNo || job.rawJobNo || '').trim() || '-';
  const rawId = job.headId || job.id;
  const safeId = (typeof rawId === 'number' && !isNaN(rawId))
    ? rawId
    : (typeof rawId === 'string' && /^\d+$/.test(rawId) ? parseInt(rawId, 10) : 0);

  const safeNum = (v, defaultVal = 0) => {
    const n = Number(v);
    return (!isNaN(n) && isFinite(n)) ? n : defaultVal;
  };

  const head = {
    id: safeId,
    job: targetJob,
    partNo: job.partNo || '',
    materialNo: job.materialNo || '',
    description: job.description || '',
    stdThick: safeNum(job.stdThick),
    stdWidth: safeNum(job.stdWidth),
    stdLength: safeNum(job.stdLength),
    productDate: (job.createdAt && !job.createdAt.endsWith('00:00:00')) ? job.createdAt : (job.productionDate && !job.productionDate.includes('T') ? `${job.productionDate}T${new Date().toTimeString().split(' ')[0]}` : (job.productionDate || new Date().toISOString())),
    lotNumber: CalculationService.formatEmbossLotForSave(job.lotNumber || job.lotNo || ''),
    lotNo: CalculationService.formatEmbossLotForSave(job.lotNumber || job.lotNo || ''),
    employeeName: job.operatorName || fallbackOperator || ''
  };

  const details = [];
  const entries = (job.firstSheetEntries && job.firstSheetEntries.length > 0)
    ? job.firstSheetEntries
    : [{ width: job.firstSheetWidth || job.firstSheetWidth1, qty: job.productedQty || job.productedQty1 }];

  entries.forEach((entry) => {
    if (safeNum(entry.width) > 0) {
      const rawEmboss = job.embossLot || job.lotNumber || job.lotNo || '';
      const parsedEmboss = CalculationService.extractEmbossDetails(rawEmboss);
      const effectiveRoll = job.embossRoll || parsedEmboss.rollNo || '';
      const effectiveTotalRoll = job.embossTotalRoll || parsedEmboss.totalRolls || '';

      details.push({
        job: targetJob,
        actualFoamWidth: safeNum(job.actualFoamWidth),
        embossLot: CalculationService.formatEmbossLotForSave(rawEmboss) || '-',
        embossRoll: effectiveRoll ? String(effectiveRoll).trim() : null,
        embossTotalRoll: effectiveTotalRoll ? String(effectiveTotalRoll).trim() : null,
        firstShotThick: safeNum(job.firstSheetThick || job.stdThick),
        firstShotWidth: safeNum(entry.width),
        rollUsed: safeNum(job.rollUsed, 1),
        productedQty: safeNum(entry.qty),
        remainThick: safeNum(job.remainThick || job.stdThick),
        remainLength: safeNum(job.remainLength || job.stdLength),
        remainWidth: safeNum(job.remainWidth),
        ng: safeNum(job.ng),
        lossOverStd: safeNum(job.lossOverStd),
        lossProduct: safeNum(job.lossProduct),
        actualUsedQty: safeNum(job.actualUsedQty),
        yield: safeNum(job.yield)
      });
    }
  });

  return {
    head,
    details,
    originalJob: job.originalJob || job.originalJobNo || (job.rawJobNo && job.rawJobNo !== targetJob ? job.rawJobNo : undefined)
  };
};

const SlitContext = createContext(null);

export const SlitProvider = ({ children }) => {
  const [jobs, setJobs] = useState(getStoredJobs);
  const [header, setHeader] = useState(getStoredHeader);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_LOGGED_IN_KEY);
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    return Boolean(token && user && !isTokenExpired(token) && saved !== 'false');
  });

  const fetchJobsFromServer = useCallback(async (params = {}) => {
    setIsLoading(true);
    setError(null);
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token');
      const headers = {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const response = await axios.get(`${apiBase}/api/slit/full`, { 
        params,
        headers, 
        timeout: 10000 
      });
      if (Array.isArray(response.data)) {
        console.log(`[SQL Server (IIT_DB)] ออนไลน์: ${response.data.length} รายการ`, response.data);
        const currentStored = getStoredJobs();
        const merged = response.data.map((serverJob) => {
          const local = currentStored.find((l) => (l.jobNo && l.jobNo === serverJob.jobNo) || (l.id && l.id === serverJob.id));
          const hasValidServerTime = serverJob.createdAt && !serverJob.createdAt.endsWith('00:00:00');
          const hasValidLocalTime = local?.createdAt && !local.createdAt.endsWith('00:00:00');
          return {
            ...serverJob,
            lotNumber: serverJob.lotNumber || serverJob.lotNo || local?.lotNumber || local?.lotNo || '',
            lotNo: serverJob.lotNumber || serverJob.lotNo || local?.lotNumber || local?.lotNo || '',
            createdAt: hasValidServerTime ? serverJob.createdAt : (hasValidLocalTime ? local.createdAt : serverJob.createdAt)
          };
        });
        const renumbered = saveStoredJobs(merged);
        setJobs(renumbered);
        return renumbered;
      }
    } catch (err) {
      console.warn('[SlitContext] Cannot fetch jobs from SQL Server, fallback to cached jobs:', err);
      setError(err?.response?.data?.message || err?.message || 'Cannot fetch from SQL Server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobsFromServer();
  }, [fetchJobsFromServer]);

  useEffect(() => {
    const handleJobsUpdate = () => {
      setJobs(getStoredJobs());
    };
    const handleHeaderUpdate = () => {
      setHeader(getStoredHeader());
    };
    window.addEventListener('storage-jobs-updated', handleJobsUpdate);
    window.addEventListener('storage-header-updated', handleHeaderUpdate);
    return () => {
      window.removeEventListener('storage-jobs-updated', handleJobsUpdate);
      window.removeEventListener('storage-header-updated', handleHeaderUpdate);
    };
  }, []);

  // ── Global Axios Response Interceptor (ดักจับกรณี Token หมดอายุ หรือ 401 Unauthorized) ──
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          console.warn('[Auth Interceptor] 401 Unauthorized: Session expired or invalid token');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.setItem(LOCAL_STORAGE_LOGGED_IN_KEY, 'false');
          setIsLoggedIn(false);
          toast.error('เซสชันการเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่', {
            toastId: 'session-expired-error'
          });
          const path = window.location.pathname;
          if (path !== '/login' && path !== '/register') {
            setTimeout(() => {
              window.location.href = '/login';
            }, 1000);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptorId);
    };
  }, []);

  const saveJobToServer = async (job, isEdit = false) => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const converted = convertJobToSaveRequest(job, header?.operatorName);
      const payload = {
        ...converted,
        isEdit,
        originalJob: converted.originalJob || (isEdit ? (job.originalJob || job.originalJobNo) : undefined)
      };
      const token = localStorage.getItem('token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      if (isEdit) {
        await axios.put(`${apiBase}/api/slit/update`, payload, { headers, timeout: 10000 });
      } else {
        await axios.post(`${apiBase}/api/slit/save`, payload, { headers, timeout: 10000 });
      }
      return true;
    } catch (err) {
      console.error('[SlitContext] Save to server error:', err);
      throw err;
    }
  };

  const deleteJobFromServer = async (jobNo, id) => {
    if (!jobNo && !id) return false;
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token');
      const headers = {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      };
      const params = {};
      if (jobNo) params.job = jobNo;
      if (id && /^\d+$/.test(String(id))) params.id = parseInt(id, 10);
      await axios.delete(`${apiBase}/api/slit`, { params, headers, timeout: 10000 });
      return true;
    } catch (err) {
      console.error('[SlitContext] Delete from server error:', err);
      return false;
    }
  };

  const addJob = async (newJob, skipServerSave = false) => {
    if (!skipServerSave) {
      try {
        await saveJobToServer(newJob, false);
      } catch (err) {
        console.warn('[SlitContext] Save to server notice:', err);
      }
    }
    const updated = [...jobs, newJob];
    const saved = saveStoredJobs(updated);
    setJobs(saved);
    fetchJobsFromServer();
    return saved;
  };

  const updateJob = async (updatedJob, skipServerSave = false) => {
    if (!skipServerSave) {
      try {
        await saveJobToServer(updatedJob, true);
      } catch (err) {
        console.warn('[SlitContext] Update to server notice:', err);
      }
    }
    const updated = jobs.map((j) => {
      const matchId = (j.id != null && updatedJob.id != null && String(j.id) === String(updatedJob.id));
      const matchJobNo = (j.jobNo && updatedJob.jobNo && j.jobNo === updatedJob.jobNo);
      const matchRawJobNo = (j.rawJobNo && updatedJob.rawJobNo && j.rawJobNo === updatedJob.rawJobNo);
      const matchOriginal = Boolean(updatedJob.originalJobNo && (j.jobNo === updatedJob.originalJobNo || j.rawJobNo === updatedJob.originalJobNo));
      return (matchId || matchJobNo || matchRawJobNo || matchOriginal) ? { ...j, ...updatedJob } : j;
    });
    const saved = saveStoredJobs(updated);
    setJobs(saved);
    await fetchJobsFromServer();
    return saved;
  };

  const deleteJob = async (id, targetJobNo) => {
    const updated = jobs.filter((j) => String(j.id) !== String(id));
    const saved = saveStoredJobs(updated);
    setJobs(saved);

    const hasRemainingSameJobNo = targetJobNo && updated.some(j => j.jobNo === targetJobNo);
    if (!hasRemainingSameJobNo || id) {
      await deleteJobFromServer(targetJobNo, id);
    }
    await fetchJobsFromServer();
    return saved;
  };

  const clearAllJobs = () => {
    const saved = saveStoredJobs([]);
    setJobs(saved);
    return saved;
  };

  const updateHeader = (newHeader) => {
    setHeader(newHeader);
    saveStoredHeader(newHeader);
  };

  const logout = () => {
    setIsLoggedIn(false);
    localStorage.setItem(LOCAL_STORAGE_LOGGED_IN_KEY, 'false');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setHeader((prev) => {
      const next = {
        ...prev,
        operatorId: '',
        operatorName: 'Operator'
      };
      saveStoredHeader(next);
      return next;
    });
  };

  const login = (userData) => {
    setIsLoggedIn(true);
    localStorage.setItem(LOCAL_STORAGE_LOGGED_IN_KEY, 'true');
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      const displayName = getDisplayNameFromUser(userData);
      const empId = userData.EmployeeId 
        ? `EMP-${userData.EmployeeId}` 
        : (userData.employeeId ? `EMP-${userData.employeeId}` : '');
      setHeader((prev) => {
        const next = {
          ...prev,
          operatorName: displayName || prev.operatorName || 'Operator',
          operatorId: empId || prev.operatorId || 'EMP-001'
        };
        saveStoredHeader(next);
        return next;
      });
    }
  };

  const value = {
    jobs,
    header,
    isLoading,
    error,
    refreshJobs: fetchJobsFromServer,
    isLoggedIn,
    addJob,
    updateJob,
    deleteJob,
    clearAllJobs,
    updateHeader,
    login,
    logout
  };

  return <SlitContext.Provider value={value}>{children}</SlitContext.Provider>;
};

export const useSlit = () => {
  const context = useContext(SlitContext);
  if (!context) {
    throw new Error('useSlit must be used within a SlitProvider');
  }
  return context;
};

export default SlitContext;
