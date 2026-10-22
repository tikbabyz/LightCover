import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ConfirmModal } from '../../components/ConfirmModal';
import {
    Scan, Save, RotateCcw, Search, CheckCircle2,
    FileSpreadsheet, CalendarDays, Pencil,
    Trash2, Printer, Layers, Clock, Copy,
    X, Lock, Unlock, User, ShieldCheck, Plus, AlertTriangle
} from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';
import axios from 'axios';
import { CalculationService, extractCleanProductName, extractIpoTubeSpecs, detectIpoCoreAndTubeType, validateSlitMaterialScan, getIpoIdTolerance, getIpoThicknessTolerance } from '../../services/calculationService';
import { useIpoTube, mapServerJobsToUiRolls } from '../../context/IpoTubeContext';
import { Time24Picker } from '../../components/Time24Picker';
import { IpoService } from '../../services/ipoService';
import { isOfficerUser, getUserRole } from '../../services/authHelper';
import { ActivityLogService, ACTION_TYPES } from '../../services/activityLogService';

import {
    parseDowntimeMinutesFromNote,
    extractLostTimeAndGeneralNote,
    cleanDowntimeNote
} from '../../utils/downtimeUtils';
import { IpoStickerModal } from './components/IpoStickerModal';

export {
    parseDowntimeMinutesFromNote,
    extractLostTimeAndGeneralNote,
    cleanDowntimeNote
};

/** ดึงชื่อผู้ปฏิบัติงานที่เข้าสู่ระบบจาก LocalStorage หรือ Auth Session */
const getLoggedInOperatorName = () => {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const u = JSON.parse(userStr);
            const fn = (u.FirstName || u.firstName || '').trim();
            const ln = (u.LastName || u.lastName || '').trim();
            const full = [fn, ln].filter(Boolean).join(' ');
            if (full) return full;
            if (u.Username || u.username) return (u.Username || u.username).trim();
        }
    } catch {
        // fallback
    }
    return '';
};

/** ค้นหาและดึงข้อมูล Job โดยตรงจาก SQL Server API: GET /api/ipo/job/{jobNumber} (ไม่ใช้ Mock Data) */
const fetchJobFromServer = async (query) => {
    const rawQuery = (query || '').toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    if (!rawQuery) return null;

    const apiBase = import.meta.env.VITE_API_URL || '';
    const token = localStorage.getItem('token');
    const headers = {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    try {
        const endpoint = `${apiBase}/api/ipo/job/${encodeURIComponent(rawQuery)}`;
        const response = await axios.get(endpoint, { timeout: 10000, headers });
        const list = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
        if (list.length > 0) {
            const mappedItems = list.map(item => {
                const jobNo = (item.job || item.Job || '').toString().trim();
                const partNo = (item.item || item.Item || rawQuery).toString().trim();
                const description = (item.description || item.Description || '').toString().trim();
                const cleanProd = extractCleanProductName(item.productName || item.ProductName || description, partNo) || description || partNo;
                return {
                    jobNo,
                    jobDate: item.jobDate || item.JobDate,
                    partNo,
                    partName: description || partNo,
                    description,
                    productName: cleanProd,
                    raw: item
                };
            });

            return {
                jobNo: mappedItems[0].jobNo || rawQuery,
                items: mappedItems,
                selectedItem: mappedItems[0]
            };
        }
    } catch (err) {
        console.warn('[SQL SERVER API] Error fetching job/item:', err);
    }

    return null;
};

/** แปลง/สร้าง LOT NO. ในรูปแบบ YYYY-MM-DD */
const getTodayLotNo = (targetDate) => {
    return CalculationService.formatToYYYYMMDD(targetDate, targetDate || new Date());
};

export const ActiveJobPanel = ({
    onSaveJob,
    onSaveJobs,
    onUpdateJob,
    onDeleteJob,
    onClearAll,
    operatorName,
    recentJobs = [],
    initialJobId,
    productionDate
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const ipoContext = useIpoTube();
    const allRecordedJobs = ipoContext?.jobs || recentJobs;
    const isOfficer = isOfficerUser();

    // Barcode Search State & Modals
    const [scanQuery, setScanQuery] = useState('');
    const [availableItems, setAvailableItems] = useState([]);
    const [isSearchingJob, setIsSearchingJob] = useState(false);
    const [showRecentJobsModal, setShowRecentJobsModal] = useState(false);
    const [filterQuery, setFilterQuery] = useState('');
    const [viewingDetailJob, setViewingDetailJob] = useState(null);
    const [modalDateFilter, setModalDateFilter] = useState('today'); // 'today' | 'inProgress' | 'all'
    const [currentOperator, setCurrentOperator] = useState(() => {
        return (getLoggedInOperatorName() || operatorName || ipoContext?.header?.operatorName || 'Operator').trim();
    });
    const [currentShift, setCurrentShift] = useState(() => {
        return (ipoContext?.header?.shift || '').trim();
    });
    const [editingJob, setEditingJob] = useState(null);
    const [deleteModalState, setDeleteModalState] = useState({
        isOpen: false,
        jobId: null,
        jobNo: '',
        sequenceNo: '',
    });
    const [closeJobModalState, setCloseJobModalState] = useState({
        isOpen: false,
        jobNo: '',
        partNo: '',
        productName: '',
        existingRolls: 0,
        existingMeters: 0,
        batchMeters: 0,
        batchRolls: 0,
        totalRolls: 0,
        totalMeters: 0
    });

    const barcodeInputRef = useRef(null);
    const lotEmbossInputRef = useRef(null);
    const rollSlitInputRef = useRef(null);
    const totalRollSlitInputRef = useRef(null);
    const lotTapInputRef = useRef(null);
    const lotEmbossInputRef2 = useRef(null);
    const rollSlitInputRef2 = useRef(null);
    const totalRollSlitInputRef2 = useRef(null);
    const lotTapInputRef2 = useRef(null);
    const slitScanTimerRef = useRef(null);

    // Tube 1 Inspection Refs
    const id1_1_Ref = useRef(null);
    const id2_1_Ref = useRef(null);
    const t1_1_Ref = useRef(null);
    const t2_1_Ref = useRef(null);
    const t3_1_Ref = useRef(null);
    const t4_1_Ref = useRef(null);

    // Tube 2 Inspection Refs
    const id1_2_Ref = useRef(null);
    const id2_2_Ref = useRef(null);
    const t1_2_Ref = useRef(null);
    const t2_2_Ref = useRef(null);
    const t3_2_Ref = useRef(null);
    const t4_2_Ref = useRef(null);

    // Machine Parameters Refs
    const speedRef = useRef(null);
    const temp1Ref = useRef(null);
    const temp2Ref = useRef(null);
    const temp3Ref = useRef(null);
    const temp4Ref = useRef(null);
    const tempPipeRef = useRef(null);

    // Column 3 Production & Defects Refs
    const startTimeRef = useRef(null);
    const endTimeRef = useRef(null);
    const totalMetersRef = useRef(null);
    const defectRefs = useRef({});
    const lostTimeStartRef = useRef(null);
    const lostTimeEndRef = useRef(null);
    const lostTimeReasonRef = useRef(null);
    const kpiNoteRef = useRef(null);
    const saveButtonRef = useRef(null);
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showStickerModal, setShowStickerModal] = useState(false);
    const [selectedStickerRoll, setSelectedStickerRoll] = useState(null);

    // 1. ข้อมูลชิ้นงาน (Job & Part Info)
    const [jobNo, setJobNo] = useState('');
    const [partNo, setPartNo] = useState('');
    const [productName, setProductName] = useState('');
    const [description, setDescription] = useState('');

    // ข้อมูลสูตรวัตถุดิบ (BOM จาก SyteLine)
    const [bomMaterials, setBomMaterials] = useState([]);
    const [isLoadingBom, setIsLoadingBom] = useState(false);

    // ฟังก์ชันดึงสูตร BOM ตาม Part No.
    const fetchBomData = useCallback(async (targetPartNo) => {
        if (!targetPartNo || !targetPartNo.trim()) {
            setBomMaterials([]);
            return;
        }
        setIsLoadingBom(true);
        try {
            const boms = await IpoService.getItemBom(targetPartNo.trim());
            setBomMaterials(boms || []);
            if (boms && boms.length > 0) {
                const firstWithLen = boms.find(b => Number(b.length || b.Length) > 0);
                if (firstWithLen) {
                    const len = String(firstWithLen.length || firstWithLen.Length);
                    setStdRollLength(prev => (!prev || prev === '200') ? len : prev);
                }
            }
        } catch (err) {
            console.warn('[BOM Check] Error fetching BOM for', targetPartNo, err);
            setBomMaterials([]);
        } finally {
            setIsLoadingBom(false);
        }
    }, []);

    // ตรวจสอบ BOM อัตโนมัติเมื่อ Part No. เปลี่ยน
    useEffect(() => {
        if (partNo && partNo.trim()) {
            fetchBomData(partNo.trim());
        } else {
            setBomMaterials([]);
        }
    }, [partNo, fetchBomData]);

    // สเปกท่อและประเภทท่อ (ตั้ง default เป็นท่อคู่ และ ไม่มีไส้)
    const [isTwinTube, setIsTwinTube] = useState(true);
    const [hasNoCore, setHasNoCore] = useState(true); // true = ไม่มีไส้ (ไม่มีท่อ TAP), false = มีไส้ (มีท่อ TAP)
    const [tubeSpecs, setTubeSpecs] = useState(['', '']);
    const [isEditingTubeType, setIsEditingTubeType] = useState(false);
    const hasJob = Boolean((jobNo && jobNo.trim()) || (partNo && partNo.trim()) || (productName && productName.trim()));
    const tube1Spec = tubeSpecs[0] || '';
    const tube2Spec = tubeSpecs[1] || '';

    // ฟังก์ชันสลับโหมด มีไส้ / ไม่มีไส้ (ไม่มีท่อ TAP -> สเปกและ Lot TAP เป็น -)
    const handleToggleHasCore = (noCore) => {
        setHasNoCore(noCore);
        if (noCore) {
            setTapTube1('-');
            setTapTube2('-');
            setLotNoTap('-');
            setLotNoTap2('-');
            setFormErrors(prev => {
                const next = { ...prev };
                delete next.lotNoTap;
                delete next.lotNoTap2;
                return next;
            });
            toast.info('เลือก: ไม่มีไส้');
        } else {
            const validTapVal = (v) => (v && v !== '-' && v !== 'ไม่มีไส้') ? String(v).trim() : '';
            const autoSpecs = extractIpoTubeSpecs(productName || description, partNo);
            const s1 = validTapVal(tubeSpecs[0]) || validTapVal(tapTube1) || validTapVal(embossSlit1) || autoSpecs.spec1 || '2';
            const s2 = validTapVal(tubeSpecs[1]) || validTapVal(tapTube2) || validTapVal(embossSlit2) || autoSpecs.spec2 || '3';
            setTubeSpecs([s1, isTwinTube ? s2 : '']);
            setTapTube1(s1);
            setEmbossSlit1(s1);
            setTapTube2(isTwinTube ? s2 : '');
            if (isTwinTube) setEmbossSlit2(s2);
            setLotNoTap(prev => (prev && prev !== '-') ? prev : (productionDate || CalculationService.getCurrentDateString()));
            if (isTwinTube) {
                setLotNoTap2(prev => (prev && prev !== '-') ? prev : (productionDate || CalculationService.getCurrentDateString()));
            }
            toast.info('เลือก: มีไส้');
        }
    };

    // ฟังก์ชันสลับประเภทท่อแบบ Manual (ท่อเดี่ยว / ท่อคู่)
    const handleToggleTubeType = (type) => {
        const validTapVal = (v) => (v && v !== '-' && v !== 'ไม่มีไส้') ? String(v).trim() : '';
        const autoSpecs = extractIpoTubeSpecs(productName || description, partNo);
        if (type === 'SINGLE') {
            setIsTwinTube(false);
            setActiveTubeTab('tube1');
            const s1 = validTapVal(tubeSpecs[0]) || validTapVal(tapTube1) || validTapVal(embossSlit1) || autoSpecs.spec1 || '';
            setTubeSpecs([s1, '']);
            setTapTube1(hasNoCore ? '-' : s1);
            setEmbossSlit1(s1);
            setFormErrors(prev => {
                const next = { ...prev };
                delete next.lotNoEmboss2;
                delete next.lotNoTap2;
                delete next.id1_2;
                delete next.id2_2;
                delete next.t1_2;
                delete next.t2_2;
                delete next.t3_2;
                delete next.t4_2;
                delete next.tempPipe;
                return next;
            });
            toast.info(`เลือก: ท่อเดี่ยว (ตรวจเฉพาะ TUBE 1${hasNoCore ? ' / ไม่มีไส้' : (s1 ? ` / IPO ${s1}` : '')})`);
        } else {
            setIsTwinTube(true);
            const s1 = validTapVal(tubeSpecs[0]) || validTapVal(tapTube1) || validTapVal(embossSlit1) || autoSpecs.spec1 || '';
            let s2 = validTapVal(tubeSpecs[1]) || validTapVal(tapTube2) || validTapVal(embossSlit2) || autoSpecs.spec2 || '';
            setTubeSpecs([s1, s2]);
            setTapTube1(hasNoCore ? '-' : s1);
            setEmbossSlit1(s1);
            setTapTube2(hasNoCore ? '-' : s2);
            setEmbossSlit2(s2);
            if (!hasNoCore && hasJob && (!lotNoTap2 || lotNoTap2 === '-')) {
                setLotNoTap2(CalculationService.getCurrentDateString());
            }
            toast.info(`เลือก: ท่อคู่ (ตรวจทั้ง TUBE 1 และ TUBE 2${hasNoCore ? ' / ไม่มีไส้' : (s1 && s2 ? ` / IPO ${s1} & ${s2}` : '')})`);
        }
    };

    // ฟังก์ชันเปลี่ยนสเปกท่อ TAP ประจำท่อที่ 1 หรือ ท่อที่ 2 แบบ Manual
    const handleUpdateTubeSpec = (tubeIndex, newSpec) => {
        const trimmed = String(newSpec || '').trim();
        const isSpecNoCore = trimmed === '-' || trimmed === 'ไม่มีไส้';

        setTubeSpecs(prev => {
            const next = [...prev];
            next[tubeIndex] = trimmed;
            return next;
        });

        if (isSpecNoCore) {
            if (tubeIndex === 0) {
                setTapTube1('-');
                setLotNoTap('-');
                setHasNoCore(true);
            } else {
                setTapTube2('-');
                setLotNoTap2('-');
            }
        } else {
            setHasNoCore(false);
            if (tubeIndex === 0) {
                setTapTube1(trimmed);
                setEmbossSlit1(trimmed);
                setLotNoTap(prev => (!prev || prev === '-') ? CalculationService.getCurrentDateString() : prev);
                if (isTwinTube) {
                    setTapTube2(prev => (!prev || prev === '-') ? '3' : prev);
                    setEmbossSlit2(prev => (!prev || prev === '-') ? '3' : prev);
                    setLotNoTap2(prev => (!prev || prev === '-') ? CalculationService.getCurrentDateString() : prev);
                    setTubeSpecs(prev => [trimmed, (!prev[1] || prev[1] === '-') ? '3' : prev[1]]);
                }
                if (trimmed) toast.success(`เลือกสเปก ท่อ 1 เป็น TAP ${trimmed}`);
            } else {
                setTapTube2(trimmed);
                setEmbossSlit2(trimmed);
                setLotNoTap2(prev => (!prev || prev === '-') ? CalculationService.getCurrentDateString() : prev);
                setTapTube1(prev => (!prev || prev === '-') ? '2' : prev);
                setEmbossSlit1(prev => (!prev || prev === '-') ? '2' : prev);
                setLotNoTap(prev => (!prev || prev === '-') ? CalculationService.getCurrentDateString() : prev);
                setTubeSpecs(prev => [(!prev[0] || prev[0] === '-') ? '2' : prev[0], trimmed]);
                if (trimmed) toast.success(`เลือกสเปก ท่อ 2 เป็น TAP ${trimmed}`);
            }
        }
    };

    const handleSpecChange = (tubeIndex, val) => {
        if (val === 'CUSTOM') {
            const currentVal = tubeSpecs[tubeIndex] || '';
            const customVal = window.prompt(`ระบุเบอร์ TAP ที่ต้องการ (เช่น 7, 8, 14, ...):`, currentVal);
            if (customVal && customVal.trim()) {
                handleUpdateTubeSpec(tubeIndex, customVal.trim());
            }
            return;
        }
        handleUpdateTubeSpec(tubeIndex, val);
    };

    // วัตถุดิบและ Lot ประจำแต่ละท่อ (รองรับทั้งท่อเดี่ยวและท่อคู่ที่มี 2 ท่อ เช่น 2 4 แยก Lot ได้อิสระ)
    const [tapTube1, setTapTube1] = useState('-');
    const [embossSlit1, setEmbossSlit1] = useState('');
    const [tapTube2, setTapTube2] = useState('-');
    const [embossSlit2, setEmbossSlit2] = useState('');
    const [lotNoTap, setLotNoTap] = useState('-');
    const [lotNoEmboss, setLotNoEmboss] = useState('');
    const [rollSlit, setRollSlit] = useState('');
    const [totalRollSlit, setTotalRollSlit] = useState('');
    const [lotNoTap2, setLotNoTap2] = useState('-');
    const [lotNoEmboss2, setLotNoEmboss2] = useState('');
    const [rollSlit2, setRollSlit2] = useState('');
    const [totalRollSlit2, setTotalRollSlit2] = useState('');

    // ประมวลผลและจัดรูปแบบ Lot Slit จากการสแกน Barcode/QR Code โดยแยกเลขม้วนออกจาก Lot อย่างชัดเจน
    const handleProcessSlitScan = useCallback((raw, isTube1, showToast = true) => {
        if (!raw) return;
        const cleanRaw = raw.trim();
        const details = CalculationService.extractEmbossDetails(cleanRaw);
        const cleanLot = details.lotDate || cleanRaw.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || cleanRaw;
        const rollNo = details.rollNo || '';
        const totalRolls = details.totalRolls || '';

        if (isTube1) {
            setLotNoEmboss(cleanLot);
            if (rollNo) setRollSlit(rollNo);
            if (totalRolls) setTotalRollSlit(totalRolls);
            setFormErrors(prev => {
                const next = { ...prev };
                delete next.lotNoEmboss;
                return next;
            });
        } else {
            setLotNoEmboss2(cleanLot);
            if (rollNo) setRollSlit2(rollNo);
            if (totalRolls) setTotalRollSlit2(totalRolls);
            setFormErrors(prev => {
                const next = { ...prev };
                delete next.lotNoEmboss2;
                return next;
            });
        }

        const check = CalculationService.validateSlitMaterialScan(cleanRaw, partNo, bomMaterials);
        if (showToast) {
            if (check.isWarning) {
                toast.warning(`${check.message}`);
            } else if (cleanLot) {
                const rollNotice = (rollNo && totalRolls) ? ` (ม้วน ${rollNo}/${totalRolls})` : (rollNo ? ` (ม้วน ${rollNo})` : '');
                toast.success(`สแกน Lot Slit: ${cleanLot}${rollNotice}`);
            }
        }
    }, [partNo, bomMaterials]);

    // คัดลอกข้อมูล Lot จากท่อ 1 ไปท่อ 2 สะดวกเมื่อใช้ม้วนเดียวกัน
    const handleCopyLotFromTube1 = () => {
        setLotNoTap2(lotNoTap);
        setLotNoEmboss2(lotNoEmboss);
        setRollSlit2(rollSlit);
        setTotalRollSlit2(totalRollSlit);
        setFormErrors(prev => {
            const next = { ...prev };
            delete next.lotNoTap2;
            delete next.lotNoEmboss2;
            return next;
        });
        toast.info('คัดลอก Lot No. TAP, Slit และ Roll จากท่อ 1 ไปท่อ 2 เรียบร้อย');
    };

    // การตรวจสอบ ท่อที่ 1 (Tube 1)
    const [id1_1, setId1_1] = useState('');
    const [id2_1, setId2_1] = useState('');
    const [t1_1, setT1_1] = useState('');
    const [t2_1, setT2_1] = useState('');
    const [t3_1, setT3_1] = useState('');
    const [t4_1, setT4_1] = useState('');
    const [judgement1, setJudgement1] = useState('OK');

    // การตรวจสอบ ท่อที่ 2 (Tube 2 - เมื่อเป็นท่อคู่)
    const [id1_2, setId1_2] = useState('');
    const [id2_2, setId2_2] = useState('');
    const [t1_2, setT1_2] = useState('');
    const [t2_2, setT2_2] = useState('');
    const [t3_2, setT3_2] = useState('');
    const [t4_2, setT4_2] = useState('');
    const [judgement2, setJudgement2] = useState('OK');
    const [activeTubeTab, setActiveTubeTab] = useState('tube1'); // 'tube1' | 'tube2' | 'all'

    // 2. การตั้งค่าเครื่องจักร (Machine Settings - ใช้ร่วมกันต่อม้วน)
    const [speed, setSpeed] = useState('');
    const [temp1, setTemp1] = useState('');
    const [temp2, setTemp2] = useState('');
    const [temp3, setTemp3] = useState('');
    const [temp4, setTemp4] = useState('');
    const [tempPipe, setTempPipe] = useState('');

    // 3. เวลา & ผลผลิต (Time & Production - ต่องาน/ต่อรอบการผลิต)
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [totalMeters, setTotalMeters] = useState('');
    const [productionRows, setProductionRows] = useState('');
    const [stdRollLength, setStdRollLength] = useState('200');

    // 4. สาเหตุงานเสีย (Defects - ต่อม้วน)
    const [defectSetting, setDefectSetting] = useState('');
    const [defectJointIpo, setDefectJointIpo] = useState('');
    const [defectSplitSeam, setDefectSplitSeam] = useState('');
    const [defectDimNg, setDefectDimNg] = useState('');
    const [defectFoamDetached, setDefectFoamDetached] = useState('');
    const [defectJointMark, setDefectJointMark] = useState('');
    const [defectThickNg, setDefectThickNg] = useState('');
    const [defectFilmBlemish, setDefectFilmBlemish] = useState('');
    const [defectOtherNg, setDefectOtherNg] = useState('');

    // 5. เวลาเสียระหว่างการผลิต (Production Lost Time) & หมายเหตุ KPI - รองรับหลายช่วงเวลา (Multiple Lost Time)
    const [lostTimeList, setLostTimeList] = useState([
        { id: 1, start: '', end: '', reason: '' }
    ]);
    const [kpiNote, setKpiNote] = useState('');
    const [formErrors, setFormErrors] = useState({});

    // ฟังก์ชันช่วยจัดการรายการเวลาเสีย (Multiple Lost Time Entries)
    const addLostTimeRow = () => {
        setLostTimeList(prev => [
            ...prev,
            { id: Date.now() + Math.random(), start: '', end: '', reason: '' }
        ]);
    };

    const removeLostTimeRow = (id) => {
        setLostTimeList(prev => {
            if (prev.length <= 1) {
                return [{ id: 1, start: '', end: '', reason: '' }];
            }
            return prev.filter(item => item.id !== id);
        });
    };

    const updateLostTimeRow = (id, field, value) => {
        setLostTimeList(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    // คำนวณความต่างเวลา (นาที) สำหรับแต่ละแถว
    const getRowDiffMinutes = (start, end) => {
        if (!start || !end) return 0;
        try {
            const [sH, sM] = start.split(':').map(Number);
            const [eH, eM] = end.split(':').map(Number);
            if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
            let diffM = (eH * 60 + eM) - (sH * 60 + sM);
            if (diffM < 0) diffM += 24 * 60;
            return diffM;
        } catch {
            return 0;
        }
    };

    const formatRowDurationText = (mins) => {
        if (!mins || mins <= 0) return '';
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
        if (h > 0) return `${h} ชม.`;
        return `${m} นาที`;
    };

    // ฟังก์ชันคำนวณยอดเมตรเมื่อเปลี่ยนจำนวนแถว (กรอกจำนวนแถว แล้ว * 200 ให้อัตโนมัติ)
    const handleProductionRowsChange = (val) => {
        const cleaned = val.replace(/[^0-9.]/g, '');
        setProductionRows(cleaned);
        const numRows = parseFloat(cleaned);
        if (!isNaN(numRows) && numRows > 0) {
            const calculatedMeters = Math.round(numRows * 200);
            setTotalMeters(String(calculatedMeters));
        } else {
            setTotalMeters('');
        }
        if (formErrors.totalMeters) {
            setFormErrors(prev => ({ ...prev, totalMeters: undefined }));
        }
    };

    // Helper function สำหรับการกด Enter ข้ามไปยังช่องของเสียถัดไปจนถึงเวลาเสีย/หมายเหตุ
    const defectKeysList = ['setting', 'jointIpo', 'splitSeam', 'dimNg', 'foamDetached', 'jointMark', 'thickNg', 'filmBlemish', 'otherNg'];
    const focusNextDefect = (currentKey) => {
        const idx = defectKeysList.indexOf(currentKey);
        if (idx >= 0 && idx < defectKeysList.length - 1) {
            const nextKey = defectKeysList[idx + 1];
            const nextEl = defectRefs.current[nextKey];
            if (nextEl) {
                nextEl.focus();
                nextEl.select?.();
            }
        } else {
            if (lostTimeStartRef.current) {
                lostTimeStartRef.current.focus();
                lostTimeStartRef.current.select?.();
            } else {
                kpiNoteRef.current?.focus();
                kpiNoteRef.current?.select?.();
            }
        }
    };

    // Auto calculate ID AVG ท่อที่ 1
    const idAvg1 = useMemo(() => {
        const val1 = parseFloat(id1_1);
        const val2 = parseFloat(id2_1);
        if (!isNaN(val1) && !isNaN(val2)) return ((val1 + val2) / 2).toFixed(2);
        if (!isNaN(val1)) return val1.toFixed(2);
        if (!isNaN(val2)) return val2.toFixed(2);
        return '';
    }, [id1_1, id2_1]);

    // Auto calculate T AVG ท่อที่ 1
    const tAvg1 = useMemo(() => {
        const vals = [parseFloat(t1_1), parseFloat(t2_1), parseFloat(t3_1), parseFloat(t4_1)].filter(v => !isNaN(v));
        if (vals.length > 0) return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        return '';
    }, [t1_1, t2_1, t3_1, t4_1]);

    // Auto calculate ID AVG ท่อที่ 2
    const idAvg2 = useMemo(() => {
        const val1 = parseFloat(id1_2);
        const val2 = parseFloat(id2_2);
        if (!isNaN(val1) && !isNaN(val2)) return ((val1 + val2) / 2).toFixed(2);
        if (!isNaN(val1)) return val1.toFixed(2);
        if (!isNaN(val2)) return val2.toFixed(2);
        return '';
    }, [id1_2, id2_2]);

    // Auto calculate T AVG ท่อที่ 2
    const tAvg2 = useMemo(() => {
        const vals = [parseFloat(t1_2), parseFloat(t2_2), parseFloat(t3_2), parseFloat(t4_2)].filter(v => !isNaN(v));
        if (vals.length > 0) return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
        return '';
    }, [t1_2, t2_2, t3_2, t4_2]);

    // เกณฑ์ยอมรับ ID & ความหนา T
    const idTol1 = useMemo(() => getIpoIdTolerance(tube1Spec), [tube1Spec]);
    const idTol2 = useMemo(() => getIpoIdTolerance(tube2Spec), [tube2Spec]);
    const thickTol1 = useMemo(() => getIpoThicknessTolerance(productName || description, partNo, 1, hasNoCore), [productName, description, partNo, hasNoCore]);
    const thickTol2 = useMemo(() => getIpoThicknessTolerance(productName || description, partNo, 2, hasNoCore), [productName, description, partNo, hasNoCore]);
    const thickTol = thickTol1;

    // ตรวจสอบความถูกต้องของค่า ID AVG
    const isIdAvg1Valid = useMemo(() => {
        return CalculationService.isIpoIdValid(idAvg1, tube1Spec);
    }, [idAvg1, tube1Spec]);

    const isIdAvg2Valid = useMemo(() => {
        return CalculationService.isIpoIdValid(idAvg2, tube2Spec);
    }, [idAvg2, tube2Spec]);

    // ตรวจสอบความถูกต้องของค่า T แต่ละจุด (ท่อที่ 1)
    const isTValid1 = useCallback((val) => {
        return CalculationService.isIpoThicknessValid(val, productName || description, partNo, 1, hasNoCore);
    }, [productName, description, partNo, hasNoCore]);

    // ตรวจสอบความถูกต้องของค่า T แต่ละจุด (ท่อที่ 2)
    const isTValid2 = useCallback((val) => {
        return CalculationService.isIpoThicknessValid(val, productName || description, partNo, 2, hasNoCore);
    }, [productName, description, partNo, hasNoCore]);

    const isTValid = isTValid1;

    // Auto update judgement1 เมื่อมีการกรอกค่า
    useEffect(() => {
        const hasId = Boolean(id1_1 || id2_1);
        const hasT = Boolean(t1_1 || t2_1 || t3_1 || t4_1);
        if (!hasId && !hasT) return;

        let isNg = false;
        if (CalculationService.isIpoIdValid(id1_1, tube1Spec) === false) isNg = true;
        if (CalculationService.isIpoIdValid(id2_1, tube1Spec) === false) isNg = true;
        if (isIdAvg1Valid === false) isNg = true;
        [t1_1, t2_1, t3_1, t4_1].forEach(v => {
            if (isTValid1(v) === false) isNg = true;
        });
        if (tAvg1 && isTValid1(tAvg1) === false) isNg = true;

        setJudgement1(isNg ? 'NG' : 'OK');
    }, [isIdAvg1Valid, id1_1, id2_1, tube1Spec, t1_1, t2_1, t3_1, t4_1, tAvg1, isTValid1]);

    // Auto update judgement2 เมื่อมีการกรอกค่า
    useEffect(() => {
        if (!isTwinTube) return;
        const hasId = Boolean(id1_2 || id2_2);
        const hasT = Boolean(t1_2 || t2_2 || t3_2 || t4_2);
        if (!hasId && !hasT) return;

        let isNg = false;
        if (CalculationService.isIpoIdValid(id1_2, tube2Spec) === false) isNg = true;
        if (CalculationService.isIpoIdValid(id2_2, tube2Spec) === false) isNg = true;
        if (isIdAvg2Valid === false) isNg = true;
        [t1_2, t2_2, t3_2, t4_2].forEach(v => {
            if (isTValid2(v) === false) isNg = true;
        });
        if (tAvg2 && isTValid2(tAvg2) === false) isNg = true;

        setJudgement2(isNg ? 'NG' : 'OK');
    }, [isTwinTube, isIdAvg2Valid, id1_2, id2_2, tube2Spec, t1_2, t2_2, t3_2, t4_2, tAvg2, isTValid2]);

    // Overall judgement (กรณีตรวจ ok/ng)
    const overallJudge = useMemo(() => {
        if (!isTwinTube) return judgement1;
        return (judgement1 === 'OK' && judgement2 === 'OK') ? 'OK' : 'NG';
    }, [isTwinTube, judgement1, judgement2]);

    const hasMeasurements1 = Boolean(id1_1 || id2_1 || t1_1 || t2_1 || t3_1 || t4_1);
    const hasMeasurements2 = Boolean(id1_2 || id2_2 || t1_2 || t2_2 || t3_2 || t4_2);
    const hasAnyMeasurements = isTwinTube ? (hasMeasurements1 || hasMeasurements2) : hasMeasurements1;
    const isOverallOk = hasAnyMeasurements && overallJudge === 'OK';
    const isOverallNg = hasAnyMeasurements && overallJudge === 'NG';

    // Auto calculate Total Production Time (เช่น 3 ชม. 50 นาที)
    const totalTime = useMemo(() => {
        if (!startTime || !endTime) return '';
        try {
            const [sH, sM] = startTime.split(':').map(Number);
            const [eH, eM] = endTime.split(':').map(Number);
            if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return '';
            let diffM = (eH * 60 + eM) - (sH * 60 + sM);
            if (diffM < 0) diffM += 24 * 60;
            const h = Math.floor(diffM / 60);
            const m = diffM % 60;
            if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
            if (h > 0) return `${h} ชม.`;
            return `${m} นาที`;
        } catch {
            return '';
        }
    }, [startTime, endTime]);

    // Auto calculate Total Lost Time (ผลรวมทุกช่วงเวลาเสีย)
    const lostTimeMinutes = useMemo(() => {
        return lostTimeList.reduce((acc, item) => {
            return acc + getRowDiffMinutes(item.start, item.end);
        }, 0);
    }, [lostTimeList]);

    const lostTimeDurationText = useMemo(() => {
        return formatRowDurationText(lostTimeMinutes);
    }, [lostTimeMinutes]);

    // Backward-compatible getters สำหรับแถวแรก/หลัก
    const primaryLostTime = useMemo(() => {
        const found = lostTimeList.find(item => item.start && item.end);
        return found || lostTimeList[0] || { start: '', end: '', reason: '' };
    }, [lostTimeList]);
    const lostTimeStart = primaryLostTime.start || '';
    const lostTimeEnd = primaryLostTime.end || '';
    const lostTimeReason = primaryLostTime.reason || '';


    // Auto calculate Total Defect Meters
    const totalDefectMeters = useMemo(() => {
        const defectsList = [
            defectSetting, defectJointIpo, defectSplitSeam, defectDimNg, defectFoamDetached,
            defectJointMark, defectThickNg, defectFilmBlemish, defectOtherNg
        ];
        return defectsList.reduce((acc, d) => acc + (parseFloat(d) || 0), 0);
    }, [
        defectSetting, defectJointIpo, defectSplitSeam, defectDimNg, defectFoamDetached,
        defectJointMark, defectThickNg, defectFilmBlemish, defectOtherNg
    ]);

    // กรองเฉพาะงานของ IPO TUBE (ไม่ทำหล่น)
    const ipoRecordedJobs = useMemo(() => {
        return (allRecordedJobs || []).filter(j =>
            Boolean(j && (j.isMultiRoll || j.rollNo || j.sequenceNo || j.tapTube || j.tube1Spec || j.jobNo || j.partNo))
        );
    }, [allRecordedJobs]);

    // ตรวจสอบว่า Job ปัจจุบัน (ที่กำลังเลือก หรือกรอกอยู่) ถูกปิดไปแล้วหรือไม่ (CLOSED)
    const isCurrentJobClosed = useMemo(() => {
        if (editingJob && (editingJob.isClosed || editingJob.status === 'CLOSED')) return true;
        const currentJNo = (jobNo || scanQuery || '').trim();
        if (!currentJNo) return false;
        return (ipoRecordedJobs || []).some(j =>
            j.jobNo && j.jobNo.trim().toUpperCase() === currentJNo.toUpperCase() && (j.isClosed || j.status === 'CLOSED')
        );
    }, [editingJob, jobNo, scanQuery, ipoRecordedJobs]);

    // จำนวนม้วนของงานวันนี้ (ใช้แสดงบนปุ่มแถบด้านบนให้ตรงกับ Modal)
    const todayRollsCount = useMemo(() => {
        const today = CalculationService.getCurrentDateString();
        return (ipoRecordedJobs || []).filter(r =>
            CalculationService.safeExtractDate(r) === today || (!r.isClosed && r.status !== 'CLOSED')
        ).length;
    }, [ipoRecordedJobs]);

    // รายการม้วนทั้งหมดที่ผ่านตัวกรอง (มีครบถ้วนทุกช่องที่บันทึกไป)
    const filteredRolls = useMemo(() => {
        let list = (ipoRecordedJobs || []).map((job, idx) => {
            const rawD = (job.defects && typeof job.defects === 'object' && !Array.isArray(job.defects))
                ? job.defects
                : (Array.isArray(job.defects) ? (job.defects[0] || {}) : {});

            const normDefects = {
                setting: Number(rawD.setting ?? rawD.settingMachine ?? job.defectSetting ?? job.settingMachine ?? 0) || 0,
                jointIpo: Number(rawD.jointIpo ?? job.defectJointIpo ?? job.jointIpo ?? 0) || 0,
                splitSeam: Number(rawD.splitSeam ?? job.defectSplitSeam ?? job.splitSeam ?? 0) || 0,
                dimNg: Number(rawD.dimNg ?? rawD.dimensionNg ?? job.defectDimNg ?? job.dimensionNg ?? 0) || 0,
                foamDetached: Number(rawD.foamDetached ?? job.defectFoamDetached ?? job.foamDetached ?? 0) || 0,
                jointMark: Number(rawD.jointMark ?? job.defectJointMark ?? job.jointMark ?? 0) || 0,
                thickNg: Number(rawD.thickNg ?? job.defectThickNg ?? job.thickNg ?? 0) || 0,
                filmBlemish: Number(rawD.filmBlemish ?? job.defectFilmBlemish ?? job.filmBlemish ?? 0) || 0,
                otherNg: Number(rawD.otherNg ?? job.defectOtherNg ?? job.otherNg ?? 0) || 0,
            };
            const sumDefects = Object.values(normDefects).reduce((acc, val) => acc + val, 0);
            const dMeters = Number(job.defectMeters !== undefined && job.defectMeters !== null && job.defectMeters !== ''
                ? job.defectMeters
                : (job.ng !== undefined && job.ng !== null && job.ng !== '' ? job.ng : sumDefects)) || sumDefects;
            const mQty = Number(job.productQty || job.productedQty || 0) || 0;
            const date = (job.productionDate || CalculationService.safeExtractDate(job) || '').trim();

            return {
                ...job,
                rowNum: idx + 1,
                defects: normDefects,
                totalDefect: dMeters,
                productQty: mQty,
                productionDate: date || job.date || '-',
                operatorName: job.operatorName || job.employeeName || operatorName || 'Operator',
                shift: job.shift || 'A',
                tapTube: (job.hasNoCore || job.tapTube === '-' || job.tube1Spec === '-') ? '-' : (job.tapTube || job.tube1Spec || '-'),
                embossSlit: job.embossSlit || job.tube1Spec || '-',
                lotNoTap: (job.hasNoCore || job.tapTube === '-' || job.tube1Spec === '-') ? '-' : (job.lotNoTap && job.lotNoTap !== '-' ? job.lotNoTap : '-'),
                lotNoEmboss: job.lotNoEmboss || job.lotNoSlit || job.lotSlit || job.rawLotNo || job.embossLot || '-',
                downtimeMinutes: Number(job.downtimeMinutes || job.downtime || 0) || parseDowntimeMinutesFromNote(cleanDowntimeNote(job.downtimeNote || job.kpiNote)) || 0,
                downtimeNote: cleanDowntimeNote(job.downtimeNote || job.kpiNote),
            };
        });

        if (modalDateFilter === 'today') {
            const today = CalculationService.getCurrentDateString();
            list = list.filter(r => CalculationService.safeExtractDate(r) === today || (!r.isClosed && r.status !== 'CLOSED'));
        } else if (modalDateFilter === 'inProgress') {
            list = list.filter(r => !r.isClosed && r.status !== 'CLOSED');
        }

        if (filterQuery.trim()) {
            const q = filterQuery.toLowerCase().trim();
            list = list.filter(r =>
                (r.jobNo || '').toLowerCase().includes(q) ||
                (r.partNo || '').toLowerCase().includes(q) ||
                (r.productName || r.description || '').toLowerCase().includes(q) ||
                (r.operatorName || '').toLowerCase().includes(q) ||
                (r.lotNoTap || '').toLowerCase().includes(q) ||
                (r.lotNoEmboss || '').toLowerCase().includes(q)
            );
        }

        const parseTimeToMins = (timeStr) => {
            if (!timeStr || typeof timeStr !== 'string') return 9999;
            const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})/);
            return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : 9999;
        };

        // จัดกลุ่มตาม Job เพื่อให้ม้วนของ Job เดียวกันอยู่ด้วยกันเป็นกลุ่ม
        const byJob = {};
        const jobKeys = [];
        list.forEach((r) => {
            const k = (r.jobNo || '').trim().toUpperCase() || 'UNKNOWN';
            if (!byJob[k]) {
                byJob[k] = [];
                jobKeys.push(k);
            }
            byJob[k].push(r);
        });

        // ภายในแต่ละ Job เรียงตาม runNo (รอบที่ 1, 2, 3...) เป็นหลักเสมอ
        jobKeys.forEach((k) => {
            byJob[k].sort((a, b) => {
                const rA = Number(a.runNo || a.sequenceNo || a.rollNo || 0);
                const rB = Number(b.runNo || b.sequenceNo || b.rollNo || 0);
                if (rA > 0 && rB > 0 && rA !== rB) return rA - rB;
                const tA = parseTimeToMins(a.startTime);
                const tB = parseTimeToMins(b.startTime);
                if (tA !== tB) return tA - tB;
                return (new Date(a.createdAt || 0).getTime() || 0) - (new Date(b.createdAt || 0).getTime() || 0);
            });
        });

        // เรียงลำดับระหว่าง Job: งานที่กำลังผลิต (IN_PROGRESS) ขึ้นก่อน แล้วตามด้วยวันที่ล่าสุด
        jobKeys.sort((kA, kB) => {
            const rollsA = byJob[kA];
            const rollsB = byJob[kB];
            const isClosedA = rollsA.every(r => r.isClosed || r.status === 'CLOSED');
            const isClosedB = rollsB.every(r => r.isClosed || r.status === 'CLOSED');
            if (!isClosedA && isClosedB) return -1;
            if (isClosedA && !isClosedB) return 1;

            const dateA = rollsA[0]?.productionDate || '';
            const dateB = rollsB[0]?.productionDate || '';
            if (dateA !== dateB && dateA !== '-' && dateB !== '-') {
                return dateB.localeCompare(dateA);
            }

            const firstA = rollsA[0];
            const firstB = rollsB[0];
            const tA = parseTimeToMins(firstA?.startTime);
            const tB = parseTimeToMins(firstB?.startTime);
            if (tA !== 9999 && tB !== 9999 && tA !== tB) return tA - tB;
            return (new Date(firstB?.createdAt || 0).getTime() || 0) - (new Date(firstA?.createdAt || 0).getTime() || 0);
        });

        const sortedList = [];
        let itemSeq = 1;
        jobKeys.forEach((k) => {
            byJob[k].forEach((r, rIdx) => {
                sortedList.push({
                    ...r,
                    itemIndex: itemSeq++,
                    runNo: Number(r.runNo || r.rollNo || (rIdx + 1))
                });
            });
        });

        return sortedList;
    }, [ipoRecordedJobs, operatorName, modalDateFilter, filterQuery]);

    // คำนวณจำนวน Job ที่ไม่ซ้ำกันในรายการที่แสดง
    const uniqueJobCount = useMemo(() => {
        return new Set(filteredRolls.map(r => (r.jobNo || '').trim().toUpperCase()).filter(Boolean)).size;
    }, [filteredRolls]);

    // สรุปรวมรายการระดับ Job (1 แถวต่อ 1 Job / Part)
    const groupedRecordedJobs = useMemo(() => {
        const groups = {};
        const order = [];

        (ipoRecordedJobs || []).forEach((job) => {
            const jNo = (job.jobNo || '').trim();
            const pNo = (job.partNo || '').trim();
            const date = (job.productionDate || CalculationService.safeExtractDate(job) || '').trim();
            // ยึด Key จาก Job No. และ Part No. เพื่อรวบทุกม้วนของ Job เดียวกันให้อยู่แถวเดียวเสมอ
            const key = (jNo || pNo) ? `${jNo.toUpperCase()}_${pNo.toUpperCase()}` : (job.id ? String(job.id) : `job_row_${order.length + 1}`);

            const rawD = (job.defects && typeof job.defects === 'object' && !Array.isArray(job.defects))
                ? job.defects
                : (Array.isArray(job.defects) ? (job.defects[0] || {}) : {});

            const normDefects = {
                setting: Number(rawD.setting ?? rawD.settingMachine ?? job.defectSetting ?? job.settingMachine ?? 0) || 0,
                jointIpo: Number(rawD.jointIpo ?? job.defectJointIpo ?? job.jointIpo ?? 0) || 0,
                splitSeam: Number(rawD.splitSeam ?? job.defectSplitSeam ?? job.splitSeam ?? 0) || 0,
                dimNg: Number(rawD.dimNg ?? rawD.dimensionNg ?? job.defectDimNg ?? job.dimensionNg ?? 0) || 0,
                foamDetached: Number(rawD.foamDetached ?? job.defectFoamDetached ?? job.foamDetached ?? 0) || 0,
                jointMark: Number(rawD.jointMark ?? job.defectJointMark ?? job.jointMark ?? 0) || 0,
                thickNg: Number(rawD.thickNg ?? job.defectThickNg ?? job.thickNg ?? 0) || 0,
                filmBlemish: Number(rawD.filmBlemish ?? job.defectFilmBlemish ?? job.filmBlemish ?? 0) || 0,
                otherNg: Number(rawD.otherNg ?? job.defectOtherNg ?? job.otherNg ?? 0) || 0,
            };

            const normDtNote = cleanDowntimeNote(job.downtimeNote || job.kpiNote);
            const normDtMin = Number(job.downtimeMinutes || job.downtime || 0) || parseDowntimeMinutesFromNote(normDtNote) || 0;

            const normalizedJob = {
                ...job,
                defects: normDefects,
                downtimeMinutes: normDtMin,
                downtimeNote: normDtNote,
                operatorName: job.operatorName || job.employeeName || operatorName || 'Operator',
                shift: job.shift || 'A',
                productionDate: date || job.date || '-',
            };

            if (!groups[key]) {
                groups[key] = {
                    key,
                    jobNo: jNo || '-',
                    partNo: pNo || '-',
                    productName: job.productName || job.partName || job.description || '-',
                    lotNoTap: (job.hasNoCore || job.tapTube === '-' || job.tube1Spec === '-') ? '-' : (job.lotNoTap && job.lotNoTap !== '-' ? job.lotNoTap : '-'),
                    lotNoEmboss: job.lotNoEmboss || job.lotNoSlit || job.lotSlit || job.rawLotNo || job.embossLot || '-',
                    tapTube: (job.hasNoCore || job.tapTube === '-' || job.tube1Spec === '-') ? '-' : (job.tapTube || job.tube1Spec || '-'),
                    embossSlit: job.embossSlit || '-',
                    productionDate: date || '-',
                    operatorName: normalizedJob.operatorName,
                    shift: normalizedJob.shift,
                    totalMeters: 0,
                    totalRolls: 0,
                    totalDefectMeters: 0,
                    downtimeMinutes: 0,
                    downtimeNote: normalizedJob.downtimeNote,
                    startTime: job.startTime || '',
                    endTime: job.endTime || '',
                    totalTime: job.totalTime || '',
                    judgement: job.judgement || 'OK',
                    status: job.status || 'IN_PROGRESS',
                    isClosed: Boolean(job.isClosed || job.status === 'CLOSED'),
                    sampleJob: normalizedJob,
                    rolls: [],
                };
                order.push(key);
            }

            const g = groups[key];
            const mQty = Number(job.productQty || job.productedQty || 0) || 0;
            const dMeters = Number(job.defectMeters !== undefined ? job.defectMeters : (job.ng || 0)) || 0;

            const stdLen = Number(job.stdLength) || 200;
            const rCount = Number(job.rollCount) || (stdLen > 0 ? Math.ceil(mQty / stdLen) : 1);
            g.totalMeters += mQty;
            g.totalRolls += rCount;
            g.totalDefectMeters += dMeters;
            g.downtimeMinutes += normalizedJob.downtimeMinutes;
            if (normalizedJob.downtimeNote && !g.downtimeNote) g.downtimeNote = normalizedJob.downtimeNote;
            if (normalizedJob.operatorName && (g.operatorName === '-' || !g.operatorName)) g.operatorName = normalizedJob.operatorName;
            if (normalizedJob.shift) g.shift = normalizedJob.shift;
            if (normalizedJob.tapTube && (g.tapTube === '-' || !g.tapTube)) g.tapTube = normalizedJob.tapTube;
            if (normalizedJob.embossSlit && (g.embossSlit === '-' || !g.embossSlit)) g.embossSlit = normalizedJob.embossSlit;

            g.rolls.push(normalizedJob);

            // บันทึก Lot และ วันที่ ที่มีข้อมูล
            const currentTap = (job.hasNoCore || job.tapTube === '-' || !job.lotNoTap || job.lotNoTap === '-') ? '-' : job.lotNoTap;
            if (currentTap && currentTap !== '-' && (g.lotNoTap === '-' || !g.lotNoTap)) g.lotNoTap = currentTap;
            const currentEmboss = job.lotNoEmboss || job.rawLotNo || job.embossLot;
            if (currentEmboss && (g.lotNoEmboss === '-' || !g.lotNoEmboss)) g.lotNoEmboss = currentEmboss;
            if (date && (g.productionDate === '-' || !g.productionDate)) g.productionDate = date;

            if (!g.startTime && job.startTime) g.startTime = job.startTime;
            if (job.endTime) g.endTime = job.endTime;
            if (job.totalTime) g.totalTime = job.totalTime;
            if (job.judgement === 'NG') g.judgement = 'NG';
            if (job.status === 'CLOSED' || job.isClosed) {
                g.status = 'CLOSED';
                g.isClosed = true;
            }
        });

        return order.map(k => groups[k]);
    }, [ipoRecordedJobs, operatorName]);

    // ค้นหารายการใน Modal (Grouped View)
    const filteredGroupedJobs = useMemo(() => {
        let list = groupedRecordedJobs;

        if (modalDateFilter === 'today') {
            const today = CalculationService.getCurrentDateString();
            list = list.filter(g => g.productionDate === today || g.rolls.some(r => CalculationService.safeExtractDate(r) === today));
        }

        if (filterQuery.trim()) {
            const q = filterQuery.toLowerCase().trim();
            list = list.filter(g =>
                g.jobNo.toLowerCase().includes(q) ||
                g.partNo.toLowerCase().includes(q) ||
                g.productName.toLowerCase().includes(q) ||
                g.lotNoTap.toLowerCase().includes(q) ||
                g.lotNoEmboss.toLowerCase().includes(q) ||
                g.productionDate.toLowerCase().includes(q) ||
                (g.operatorName && g.operatorName.toLowerCase().includes(q))
            );
        }
        return list;
    }, [groupedRecordedJobs, modalDateFilter, filterQuery]);

    // สรุปรวมตัวเลขทั้งหมดสำหรับแสดงใน Modal Header
    const modalSummaryTotals = useMemo(() => {
        let totalJobs = filteredGroupedJobs.length;
        let totalRuns = filteredRolls.length;
        let totalRolls = 0;
        let totalMeters = 0;
        let totalDefect = 0;
        let totalDt = 0;

        filteredRolls.forEach(r => {
            const mQty = Number(r.productQty || 0);
            const stdLen = Number(r.stdLength) || 200;
            const rCount = Number(r.rollCount) || (stdLen > 0 ? Math.ceil(mQty / stdLen) : 1);
            totalRolls += rCount;
            totalMeters += mQty;
            totalDefect += Number(r.totalDefect || 0);
            totalDt += Number(r.downtimeMinutes || 0);
        });

        const totalGoodMeters = Math.max(0, totalMeters - totalDefect);

        return { totalJobs, totalRuns, totalRolls, totalMeters, totalGoodMeters, totalDefect, totalDt };
    }, [filteredGroupedJobs, filteredRolls]);

    // เลขที่ Job No. ปัจจุบัน
    const currentJobNo = (jobNo || scanQuery || '').trim();

    // ม้วนที่เคยบันทึกไว้ของ Job No. นี้
    const currentJobRolls = useMemo(() => {
        if (!currentJobNo) return [];
        return (ipoRecordedJobs || []).filter(j =>
            j.jobNo && j.jobNo.trim().toUpperCase() === currentJobNo.toUpperCase()
        );
    }, [ipoRecordedJobs, currentJobNo]);

    // ยอดสะสมเดิมของ Job นี้
    const prevRollCount = currentJobRolls.length;
    const prevMeters = useMemo(() => {
        return currentJobRolls.reduce((sum, r) => sum + (Number(r.productQty) || 0), 0);
    }, [currentJobRolls]);



    // ลำดับม้วนปัจจุบัน (ถ้ายังไม่ใส่ Job หรือยังไม่มีม้วนของ Job นี้ -> เริ่มม้วนที่ 1)
    const displayRollNo = editingJob
        ? (editingJob.sequenceNo || editingJob.rollNo || 1)
        : (currentJobNo ? prevRollCount + 1 : 1);

    // Focus Scanner on load
    useEffect(() => {
        setTimeout(() => {
            if (barcodeInputRef.current) {
                barcodeInputRef.current.focus();
            }
        }, 150);
    }, []);

    // Ref เก็บ Job ID ที่ถูกโหลดจาก initialJobId แล้ว เพื่อป้องกัน useEffect รันซ้ำเมื่อ recentJobs อัปเดตใน background
    const loadedInitialJobRef = useRef(null);

    // Load initial job if editing via query param
    useEffect(() => {
        if (!initialJobId) {
            loadedInitialJobRef.current = null;
            return;
        }
        const decodedId = decodeURIComponent(initialJobId).trim();
        if (loadedInitialJobRef.current === decodedId) {
            return;
        }

        if (recentJobs && recentJobs.length > 0) {
            const found = recentJobs.find((j) => String(j.id) === decodedId || String(j.jobNo) === decodedId);
            if (found) {
                loadedInitialJobRef.current = decodedId;
                if (found.isClosed || found.status === 'CLOSED') {
                    if (!isOfficer) {
                        toast.warning(`ปิด Job "${found.jobNo || decodedId}" แล้ว`, {
                            toastId: `closed-init-${decodedId}`
                        });
                        navigate('/ipo-tube/create', { replace: true });
                        return;
                    }
                    toast.info(`เปิด Job "${found.jobNo || decodedId}" ที่ปิดแล้วเพื่อทำการแก้ไข`, {
                        toastId: `officer-init-${decodedId}`
                    });
                }
                handleStartEdit(found);
                return;
            }
        }

        // Fallback: หากไม่พบใน Cache ล่าสุด ให้ดึงตรงจาก SQL Server API
        let isCancelled = false;
        IpoService.getJobByNo(decodedId)
            .then((serverJob) => {
                if (isCancelled) return;
                if (serverJob) {
                    const mapped = mapServerJobsToUiRolls([serverJob]);
                    if (mapped && mapped.length > 0) {
                        loadedInitialJobRef.current = decodedId;
                        if (mapped[0].isClosed || mapped[0].status === 'CLOSED') {
                            if (!isOfficer) {
                                toast.warning(`ปิดJob "${decodedId}"แล้ว`, {
                                    toastId: `closed-init-${decodedId}`
                                });
                                navigate('/ipo-tube/create', { replace: true });
                                return;
                            }
                            toast.info(`เปิด Job "${decodedId}" ที่ปิดแล้วเพื่อทำการแก้ไข`, {
                                toastId: `officer-init-${decodedId}`
                            });
                        }
                        handleStartEdit(mapped[0]);
                    }
                }
            })
            .catch((err) => {
                console.warn('[CreateIpoTube] Could not load initial job directly from server:', err);
            });

        return () => {
            isCancelled = true;
        };
    }, [initialJobId, recentJobs, isOfficer, navigate]);

    // ซิงค์ข้อมูลล่าสุดจากฐานข้อมูล SQL Server เสมอเมื่อเปิดหน้าเว็บ
    useEffect(() => {
        if (ipoContext?.refreshJobs) {
            ipoContext.refreshJobs();
        }
    }, []);

    // ล้างข้อมูลทั้งหมดในแบบฟอร์มเพื่อเตรียมรับ Job ใหม่ หรือรีเซ็ตหน้าจอ
    const clearJobFormData = (keepJobNo = false) => {
        setEditingJob(null);
        if (!keepJobNo) {
            setJobNo('');
            setScanQuery('');
        }
        setPartNo('');
        setAvailableItems([]);
        setProductName('');
        setDescription('');
        setTubeSpecs(['', '']);
        setIsTwinTube(true);
        setHasNoCore(true);
        setActiveTubeTab('tube1');
        setIsEditingTubeType(false);
        setTapTube1('-');
        setEmbossSlit1('');
        setTapTube2('-');
        setEmbossSlit2('');

        setLotNoTap('-');
        setLotNoEmboss('');
        setRollSlit('');
        setTotalRollSlit('');
        setLotNoTap2('-');
        setLotNoEmboss2('');
        setRollSlit2('');
        setTotalRollSlit2('');

        setId1_1('');
        setId2_1('');
        setT1_1('');
        setT2_1('');
        setT3_1('');
        setT4_1('');
        setJudgement1('OK');

        setId1_2('');
        setId2_2('');
        setT1_2('');
        setT2_2('');
        setT3_2('');
        setT4_2('');
        setJudgement2('OK');

        setSpeed('');
        setTemp1('');
        setTemp2('');
        setTemp3('');
        setTemp4('');
        setTempPipe('');

        setStartTime('');
        setEndTime('');
        setTotalMeters('');
        setProductionRows('');
        setStdRollLength('200');

        setDefectSetting('');
        setDefectJointIpo('');
        setDefectSplitSeam('');
        setDefectDimNg('');
        setDefectFoamDetached('');
        setDefectJointMark('');
        setDefectThickNg('');
        setDefectFilmBlemish('');
        setDefectOtherNg('');

        setLostTimeList([{ id: 1, start: '', end: '', reason: '' }]);
        setKpiNote('');
        setBomMaterials([]);
        setIsSearchingJob(false);
        setFormErrors({});
    };

    // 1. สแกนค้นหา Job No. จาก Server API
    const handleScanSubmit = async (e, customQuery) => {
        if (e && e.preventDefault) e.preventDefault();
        const rawInput = customQuery ?? barcodeInputRef.current?.value ?? scanQuery ?? jobNo ?? '';
        let query = rawInput.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
        if (!query) return;

        if (query.includes('|')) {
            const parts = query.split('|').map(p => p.trim()).filter(Boolean);
            if (parts.length > 0) query = parts[0];
        }

        // ล้างข้อมูล Job เก่าออกทั้งหมดทันที เพื่อไม่ให้ข้อมูลตกค้างข้าม Job
        clearJobFormData(true);
        setScanQuery(query);
        setJobNo(query);
        setIsSearchingJob(true);

        try {
            const jobData = await fetchJobFromServer(query);
            if (jobData && jobData.items && jobData.items.length > 0) {
                setAvailableItems(jobData.items);

                // ข้อ 1: สแกน JOB NO ดึง ITEM / PART NO มาเลยทันที
                const selectedItem = jobData.items[0];
                applyItemData(selectedItem);

                // ตรวจสอบประวัติของ Job นี้
                let existing = (ipoRecordedJobs || []).filter(j =>
                    j.jobNo && j.jobNo.trim().toUpperCase() === query.toUpperCase()
                );
                if (!existing || existing.length === 0) {
                    try {
                        const serverJob = await IpoService.getJobByNo(query);
                        if (serverJob) {
                            const mapped = mapServerJobsToUiRolls([serverJob]);
                            if (mapped && mapped.length > 0) {
                                existing = mapped;
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                const isClosed = existing.some(j => j.isClosed || j.status === 'CLOSED');
                if (isClosed) {
                    if (!isOfficer) {
                        toast.error(`ปิด Job "${query}" แล้ว`);
                        handleResetForm();
                        return;
                    } else {
                        toast.info(`เปิดดูข้อมูล Job "${query}" ที่ปิดแล้ว`);
                    }
                }

                if (existing.length > 0) {
                    // เรียงรอบเพื่อดึงข้อมูลจากรอบล่าสุดของ Job นี้
                    const sortedRuns = [...existing].sort((a, b) => {
                        const rA = Number(a.runNo || a.rollNo || a.sequenceNo || 0);
                        const rB = Number(b.runNo || b.rollNo || b.sequenceNo || 0);
                        return rA - rB;
                    });
                    const lastRun = sortedRuns[sortedRuns.length - 1];

                    // 1. ดึงข้อมูลการตรวจสอบ (Inspection) ของท่อที่ 1
                    setId1_1(lastRun.id1 !== undefined && lastRun.id1 !== null ? String(lastRun.id1) : (lastRun.insideDia1 ? String(lastRun.insideDia1) : ''));
                    setId2_1(lastRun.id2 !== undefined && lastRun.id2 !== null ? String(lastRun.id2) : (lastRun.insideDia2 ? String(lastRun.insideDia2) : ''));
                    setT1_1(lastRun.t1 !== undefined && lastRun.t1 !== null ? String(lastRun.t1) : (lastRun.thickness1 ? String(lastRun.thickness1) : ''));
                    setT2_1(lastRun.t2 !== undefined && lastRun.t2 !== null ? String(lastRun.t2) : (lastRun.thickness2 ? String(lastRun.thickness2) : ''));
                    setT3_1(lastRun.t3 !== undefined && lastRun.t3 !== null ? String(lastRun.t3) : (lastRun.thickness3 ? String(lastRun.thickness3) : ''));
                    setT4_1(lastRun.t4 !== undefined && lastRun.t4 !== null ? String(lastRun.t4) : (lastRun.thickness4 ? String(lastRun.thickness4) : ''));
                    setJudgement1(lastRun.judgement || 'OK');

                    // 2. ดึงข้อมูลการตรวจสอบ (Inspection) ของท่อที่ 2 (กรณีท่อคู่)
                    // ให้พนักงานเลือกประเภทท่อเองหน้างาน ไม่ดึง/สลับอัตโนมัติ เพื่อป้องกันความผิดพลาด
                    const hasTwin = lastRun.isTwinTube !== undefined
                        ? Boolean(lastRun.isTwinTube)
                        : Boolean(lastRun.tube2 || (lastRun.tube2Spec && lastRun.tube2Spec !== '-' && lastRun.tube2Spec !== ''));
                    // ไม่ override isTwinTube อัตโนมัติ: ให้พนักงานกดเลือกเองหน้างาน (ค่าเริ่มต้นเป็นท่อเดี่ยว)
                    if (hasTwin) {
                        const t2 = lastRun.tube2 || {};
                        setId1_2(t2.id1 !== undefined && t2.id1 !== null ? String(t2.id1) : (lastRun.tube2_id1 ? String(lastRun.tube2_id1) : ''));
                        setId2_2(t2.id2 !== undefined && t2.id2 !== null ? String(t2.id2) : (lastRun.tube2_id2 ? String(lastRun.tube2_id2) : ''));
                        setT1_2(t2.t1 !== undefined && t2.t1 !== null ? String(t2.t1) : (lastRun.tube2_t1 ? String(lastRun.tube2_t1) : ''));
                        setT2_2(t2.t2 !== undefined && t2.t2 !== null ? String(t2.t2) : (lastRun.tube2_t2 ? String(lastRun.tube2_t2) : ''));
                        setT3_2(t2.t3 !== undefined && t2.t3 !== null ? String(t2.t3) : (lastRun.tube2_t3 ? String(lastRun.tube2_t3) : ''));
                        setT4_2(t2.t4 !== undefined && t2.t4 !== null ? String(t2.t4) : (lastRun.tube2_t4 ? String(lastRun.tube2_t4) : ''));
                        setJudgement2(t2.judgement || lastRun.judgement2 || 'OK');
                    } else {
                        setId1_2('');
                        setId2_2('');
                        setT1_2('');
                        setT2_2('');
                        setT3_2('');
                        setT4_2('');
                        setJudgement2('OK');
                    }

                    // 3. ดึงพารามิเตอร์เครื่องจักร (Machine Parameters)
                    setSpeed(lastRun.speed !== undefined && lastRun.speed !== null ? String(lastRun.speed) : '');
                    setTemp1(lastRun.temp1 !== undefined && lastRun.temp1 !== null ? String(lastRun.temp1) : '');
                    setTemp2(lastRun.temp2 !== undefined && lastRun.temp2 !== null ? String(lastRun.temp2) : '');
                    setTemp3(lastRun.temp3 !== undefined && lastRun.temp3 !== null ? String(lastRun.temp3) : '');
                    setTemp4(lastRun.temp4 !== undefined && lastRun.temp4 !== null ? String(lastRun.temp4) : '');
                    setTempPipe(lastRun.tempPipe !== undefined && lastRun.tempPipe !== null ? String(lastRun.tempPipe) : (lastRun.temp_pipe ? String(lastRun.temp_pipe) : ''));

                    // 4. ดึง Lot No. Slit / Tap ของ Job เดิม (ทั้งท่อ 1 และท่อ 2)
                    const initialSlit1 = lastRun.lotNoSlit || lastRun.lotSlit || lastRun.lotNoEmboss || lastRun.embossLot || lastRun.rawLotNo || '';
                    if (initialSlit1) {
                        const details1 = CalculationService.extractEmbossDetails(String(initialSlit1));
                        setLotNoEmboss(details1.lotDate || String(initialSlit1).replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim());
                        setRollSlit(lastRun.rollSlit !== undefined && lastRun.rollSlit !== null && lastRun.rollSlit !== '' ? String(lastRun.rollSlit) : (details1.rollNo || ''));
                        setTotalRollSlit(lastRun.totalRollSlit !== undefined && lastRun.totalRollSlit !== null && lastRun.totalRollSlit !== '' ? String(lastRun.totalRollSlit) : (details1.totalRolls || ''));
                    }
                    if (hasNoCore) {
                        setLotNoTap('-');
                    } else if (lastRun.lotNoTap && lastRun.lotNoTap !== '-') {
                        setLotNoTap(CalculationService.safeExtractDate(lastRun.lotNoTap) || String(lastRun.lotNoTap));
                    } else {
                        setLotNoTap('');
                    }

                    const t2Run = lastRun.tube2 || {};
                    const initialSlit2 = t2Run.lotNoSlit || t2Run.lotSlit || t2Run.lotNoEmboss || lastRun.tube2LotNoSlit || lastRun.tube2LotSlit || lastRun.tube2LotEmboss || '';
                    if (initialSlit2) {
                        const details2 = CalculationService.extractEmbossDetails(String(initialSlit2));
                        setLotNoEmboss2(details2.lotDate || String(initialSlit2).replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim());
                        setRollSlit2(t2Run.rollSlit !== undefined && t2Run.rollSlit !== null && t2Run.rollSlit !== '' ? String(t2Run.rollSlit) : (lastRun.tube2RollSlit || details2.rollNo || ''));
                        setTotalRollSlit2(t2Run.totalRollSlit !== undefined && t2Run.totalRollSlit !== null && t2Run.totalRollSlit !== '' ? String(t2Run.totalRollSlit) : (lastRun.tube2TotalRollSlit || details2.totalRolls || ''));
                    }
                    if (hasNoCore) {
                        setLotNoTap2('-');
                    } else if (t2Run.lotNoTap && t2Run.lotNoTap !== '-') {
                        setLotNoTap2(CalculationService.safeExtractDate(t2Run.lotNoTap) || String(t2Run.lotNoTap));
                    } else if (lastRun.tube2LotTap && lastRun.tube2LotTap !== '-') {
                        setLotNoTap2(CalculationService.safeExtractDate(lastRun.tube2LotTap) || String(lastRun.tube2LotTap));
                    } else {
                        setLotNoTap2('');
                    }

                    // 5. สเปกท่อที่เคยเลือกไว้
                    if (lastRun.tube1Spec || lastRun.tapTube) {
                        const s1 = String(lastRun.tube1Spec || lastRun.tapTube).trim();
                        const s2 = String(lastRun.tube2Spec || lastRun.tube2?.tapTube || '').trim();
                        const sp = (hasTwin && s2) ? [s1, s2] : [s1];
                        setTubeSpecs(sp);
                        setTapTube1(hasNoCore ? '-' : s1);
                        setEmbossSlit1(s1);
                        if (hasTwin && s2) {
                            setTapTube2(hasNoCore ? '-' : s2);
                            setEmbossSlit2(s2);
                        }
                    }

                    const exMeters = existing.reduce((s, r) => s + (Number(r.productQty || r.totalMeters) || 0), 0);
                    toast.info(`Job ${query} มีประวัติเดิมแล้ว ${existing.length} รอบ (${exMeters.toLocaleString()} m.) — ดึงการตรวจสอบมาต่อรอบที่ ${existing.length + 1}`);

                    // Auto-focus ช่องจำนวนที่ผลิตได้ เพื่อให้ Operator กรอกยอดของรอบใหม่ได้ทันที
                    setTimeout(() => {
                        if (totalMetersRef.current) {
                            totalMetersRef.current.focus();
                            totalMetersRef.current.select?.();
                        } else if (lotEmbossInputRef.current) {
                            lotEmbossInputRef.current.focus();
                            lotEmbossInputRef.current.select?.();
                        }
                    }, 150);
                } else {
                    toast.success(`ดึงข้อมูลสำเร็จ: Job ${query} | Item: ${selectedItem.partNo} (${selectedItem.productName || ''})`);
                    // Auto-focus ช่องแรกของการตรวจสอบ: ถ้ามีไส้ให้เริ่มที่ Lot No. Tap Tube ก่อน, ถ้าไม่มีไส้ให้ไป Lot No. Slit
                    setTimeout(() => {
                        const detected = CalculationService.detectIpoCoreAndTubeType(selectedItem.partNo, selectedItem.productName || selectedItem.description);
                        const isNoCoreItem = Boolean(detected.hasNoCore);
                        if (!isNoCoreItem && lotTapInputRef.current) {
                            lotTapInputRef.current.focus();
                            lotTapInputRef.current.select?.();
                        } else if (lotEmbossInputRef.current) {
                            lotEmbossInputRef.current.focus();
                            lotEmbossInputRef.current.select?.();
                        }
                    }, 150);
                }
            } else {
                toast.info(`ไม่พบข้อมูลในระบบ ERP สำหรับ Job: ${query}`);
                setAvailableItems([]);
                setTimeout(() => {
                    if (!hasNoCore && lotTapInputRef.current) {
                        lotTapInputRef.current.focus();
                        lotTapInputRef.current.select?.();
                    } else if (lotEmbossInputRef.current) {
                        lotEmbossInputRef.current?.focus();
                        lotEmbossInputRef.current?.select?.();
                    }
                }, 150);
            }
        } catch (err) {
            console.error('Scan Error:', err);
            toast.warning('ไม่สามารถเชื่อมต่อได้');
        } finally {
            setIsSearchingJob(false);
        }
    };

    // นำข้อมูล Item ที่เลือก/สแกนมาอัปเดตฟอร์ม
    const applyItemData = (itemObj) => {
        if (!itemObj) return;
        const pNo = itemObj.partNo || '';
        const desc = itemObj.description || '';
        const pName = extractCleanProductName(itemObj.productName || itemObj.partName || desc, pNo) || desc || pNo || '';

        setPartNo(pNo);
        setProductName(pName);
        setDescription(desc || pName);

        // ข้อ 2: ตรวจจับอัตโนมัติ งานมีไส้ และ ไม่มีไส้ ตามตารางมาตรฐานรูปที่ 2 (TURKEY ไม่มีไส้ T323778001-4 / รายการมีไส้ T323778005-12, T323814001-13)
        const detected = CalculationService.detectIpoCoreAndTubeType(pNo, pName, desc);
        const autoNoCore = Boolean(detected.hasNoCore);
        setHasNoCore(autoNoCore);

        if (detected.isTwin) {
            setIsTwinTube(true);
            setTubeSpecs([detected.spec1, detected.spec2]);
            setTapTube1(autoNoCore ? '-' : detected.spec1);
            setTapTube2(autoNoCore ? '-' : detected.spec2);
            setEmbossSlit1(detected.spec1);
            setEmbossSlit2(detected.spec2);
        } else if (detected.spec1) {
            setIsTwinTube(false);
            setTubeSpecs([detected.spec1, '']);
            setTapTube1(autoNoCore ? '-' : detected.spec1);
            setTapTube2('');
            setEmbossSlit1(detected.spec1);
            setEmbossSlit2('');
        }

        if (autoNoCore) {
            setTapTube1('-');
            setTapTube2('-');
            setLotNoTap('-');
            setLotNoTap2('-');
            toast.info(`ตรวจพบอัตโนมัติ: ${detected.label || 'TURKEY ไม่มีไส้'} (ระบบปิดช่อง Lot TAP ให้อัตโนมัติ)`);
        } else {
            const today = CalculationService.getCurrentDateString();
            setLotNoTap(today);
            if (detected.isTwin) {
                setLotNoTap2(today);
            }
            toast.info(`ตรวจพบอัตโนมัติ: ${detected.label || 'งานมีไส้'} (ระบบเปิดช่อง Lot TAP ให้อัตโนมัติ)`);
        }

        // ให้ช่องตรวจวัดขนาด ID และ ความหนา T ว่างไว้ เพื่อให้ Operator ตรวจวัดและกรอกค่าจริง

        if (formErrors.partNo) setFormErrors(prev => ({ ...prev, partNo: undefined }));
    };


    // Populate fields when editing
    const handleStartEdit = (job) => {
        if (!job) return;
        if (job.isClosed || job.status === 'CLOSED') {
            if (!isOfficer) {
                toast.warning(`ปิด Job "${job.jobNo}" แล้ว`);
                return;
            }
        }
        clearJobFormData(true);
        setEditingJob(job);
        setJobNo(job.jobNo || '');
        setScanQuery(job.jobNo || '');
        setPartNo(job.partNo || '');

        const pName = extractCleanProductName(job.productName || job.partName || job.description, job.partNo) || job.productName || job.partName || job.description || job.partNo || '';
        setProductName(pName);
        setDescription(job.description || job.partName || pName || '');

        // หาก Job นี้เคยมีการระบุ/ปรับแต่งสเปกท่อไว้ ให้ยึดตามที่เคยบันทึกไว้เสมอ
        let savedSpecs = [];
        if (job.tube1Spec || job.tapTube) {
            savedSpecs.push(String(job.tube1Spec || job.tapTube).trim());
        }
        const hasTwin = job.isTwinTube !== undefined
            ? Boolean(job.isTwinTube)
            : Boolean(job.tube2 || (job.tube2Spec && String(job.tube2Spec).trim() !== ''));

        if (hasTwin) {
            const s2 = job.tube2Spec || job.tube2?.tapTube || job.tube2?.tubeSpec;
            if (s2) savedSpecs.push(String(s2).trim());
        }

        const specs = savedSpecs.length > 0
            ? savedSpecs
            : (hasTwin ? ['', ''] : ['']);
        setTubeSpecs(specs);
        setIsTwinTube(hasTwin);
        setActiveTubeTab('tube1');
        setIsEditingTubeType(false);

        // ตรวจสอบสถานะว่ามีไส้ (มีท่อ TAP) หรือไม่มีไส้ (-)
        const hasValidTapVal = (v) => Boolean(v && v !== '-' && v !== 'ไม่มีไส้');
        const hasAnyValidTap = Boolean(
            hasValidTapVal(job.tapTube) ||
            hasValidTapVal(job.tube1Spec) ||
            hasValidTapVal(job.tube2Spec) ||
            hasValidTapVal(job.tube2?.tapTube) ||
            hasValidTapVal(savedSpecs[0]) ||
            hasValidTapVal(savedSpecs[1])
        );
        const isExplicitWithCore = job.hasCore === true || job.hasNoCore === false;
        const isExplicitNoCore = job.hasNoCore === true || job.hasCore === false;
        const hasSpec = hasValidTapVal(job.tapTube) || hasValidTapVal(job.tube1Spec) || hasValidTapVal(savedSpecs[0]);
        const isJobNoCore = isExplicitWithCore
            ? false
            : Boolean(isExplicitNoCore || !hasSpec || job.tapTube === '-' || job.tube1Spec === '-' || job.tapTube === 'ไม่มีไส้' || job.tube1Spec === 'ไม่มีไส้');
        setHasNoCore(isJobNoCore);

        // วัตถุดิบ
        const isDateOrLotVal = (v) => Boolean(v && (String(v).includes('-') || String(v).includes('/') || String(v).length > 5));
        const cleanJobEmboss1 = !isDateOrLotVal(job.embossSlit) ? job.embossSlit : '';
        const cleanJobEmboss2 = !isDateOrLotVal(job.tube2?.embossSlit) ? job.tube2?.embossSlit : '';
        const cleanTap1 = hasValidTapVal(job.tapTube)
            ? String(job.tapTube).trim()
            : (hasValidTapVal(job.tube1Spec)
                ? String(job.tube1Spec).trim()
                : (hasValidTapVal(specs[0]) ? String(specs[0]).trim() : (isJobNoCore ? '-' : '2')));
        const cleanTap2 = hasValidTapVal(job.tube2?.tapTube)
            ? String(job.tube2.tapTube).trim()
            : (hasValidTapVal(job.tube2Spec)
                ? String(job.tube2Spec).trim()
                : (hasValidTapVal(specs[1]) ? String(specs[1]).trim() : (isJobNoCore ? '-' : (hasTwin ? '3' : ''))));

        const spec1Val = cleanJobEmboss1 || cleanTap1 || specs[0] || '2';
        const spec2Val = cleanJobEmboss2 || cleanTap2 || specs[1] || '3';

        setTapTube1(isJobNoCore ? '-' : cleanTap1);
        setEmbossSlit1(spec1Val);
        setTapTube2(isJobNoCore ? '-' : cleanTap2);
        setEmbossSlit2(hasTwin ? spec2Val : '');
        setTubeSpecs([spec1Val, hasTwin ? spec2Val : '']);
        if (isJobNoCore) {
            setLotNoTap('-');
            setLotNoTap2('-');
        } else {
            const fallbackTapLot = job.lotNumber || (job.productionDate && job.productionDate !== '-' ? job.productionDate : '') || CalculationService.getCurrentDateString();
            setLotNoTap((job.lotNoTap && job.lotNoTap !== '-') ? (CalculationService.safeExtractDate(job.lotNoTap) || String(job.lotNoTap)) : fallbackTapLot);
            const rawT2Tap = (job.tube2?.lotNoTap && job.tube2.lotNoTap !== '-')
                ? job.tube2.lotNoTap
                : ((job.tube2LotTap && job.tube2LotTap !== '-') ? job.tube2LotTap : '');
            setLotNoTap2(rawT2Tap ? (CalculationService.safeExtractDate(rawT2Tap) || String(rawT2Tap)) : ((job.lotNoTap && job.lotNoTap !== '-') ? CalculationService.safeExtractDate(job.lotNoTap) : fallbackTapLot));
        }

        const editSlit1 = job.lotNoSlit || job.lotSlit || job.lotNoEmboss || job.rawLotNo || job.embossLot || job.lotNo || '';
        const details1 = CalculationService.extractEmbossDetails(editSlit1);
        setLotNoEmboss(details1.lotDate || editSlit1.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || editSlit1);
        setRollSlit(job.rollSlit !== undefined && job.rollSlit !== null && job.rollSlit !== '' ? String(job.rollSlit) : (details1.rollNo || ''));
        setTotalRollSlit(job.totalRollSlit !== undefined && job.totalRollSlit !== null && job.totalRollSlit !== '' ? String(job.totalRollSlit) : (details1.totalRolls || ''));

        const editSlit2 = job.tube2?.lotNoSlit || job.tube2?.lotSlit || job.tube2LotNoSlit || job.tube2LotSlit || job.tube2?.lotNoEmboss || job.tube2LotEmboss || '';
        const details2 = CalculationService.extractEmbossDetails(editSlit2);
        setLotNoEmboss2(details2.lotDate || editSlit2.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || editSlit2);
        setRollSlit2(job.tube2?.rollSlit !== undefined && job.tube2?.rollSlit !== null && job.tube2?.rollSlit !== '' ? String(job.tube2.rollSlit) : (job.tube2RollSlit || details2.rollNo || ''));
        setTotalRollSlit2(job.tube2?.totalRollSlit !== undefined && job.tube2?.totalRollSlit !== null && job.tube2?.totalRollSlit !== '' ? String(job.tube2.totalRollSlit) : (job.tube2TotalRollSlit || details2.totalRolls || ''));

        // การตรวจสอบ ท่อที่ 1
        setId1_1(job.id1 !== undefined && job.id1 !== null ? String(job.id1) : '');
        setId2_1(job.id2 !== undefined && job.id2 !== null ? String(job.id2) : '');
        setT1_1(job.t1 !== undefined && job.t1 !== null ? String(job.t1) : '');
        setT2_1(job.t2 !== undefined && job.t2 !== null ? String(job.t2) : '');
        setT3_1(job.t3 !== undefined && job.t3 !== null ? String(job.t3) : '');
        setT4_1(job.t4 !== undefined && job.t4 !== null ? String(job.t4) : '');
        setJudgement1(job.judgement || 'OK');

        // การตรวจสอบ ท่อที่ 2
        if (job.tube2) {
            setId1_2(job.tube2.id1 !== undefined && job.tube2.id1 !== null ? String(job.tube2.id1) : '');
            setId2_2(job.tube2.id2 !== undefined && job.tube2.id2 !== null ? String(job.tube2.id2) : '');
            setT1_2(job.tube2.t1 !== undefined && job.tube2.t1 !== null ? String(job.tube2.t1) : '');
            setT2_2(job.tube2.t2 !== undefined && job.tube2.t2 !== null ? String(job.tube2.t2) : '');
            setT3_2(job.tube2.t3 !== undefined && job.tube2.t3 !== null ? String(job.tube2.t3) : '');
            setT4_2(job.tube2.t4 !== undefined && job.tube2.t4 !== null ? String(job.tube2.t4) : '');
            setJudgement2(job.tube2.judgement || 'OK');
        } else {
            setId1_2('12.0');
            setId2_2('12.0');
            setT1_2('6.0');
            setT2_2('6.0');
            setT3_2('6.0');
            setT4_2('6.0');
            setJudgement2('OK');
        }

        // เครื่องจักร
        setSpeed(job.speed !== undefined && job.speed !== null ? String(job.speed) : '');
        setTemp1(job.temp1 !== undefined && job.temp1 !== null ? String(job.temp1) : '');
        setTemp2(job.temp2 !== undefined && job.temp2 !== null ? String(job.temp2) : '');
        setTemp3(job.temp3 !== undefined && job.temp3 !== null ? String(job.temp3) : '');
        setTemp4(job.temp4 !== undefined && job.temp4 !== null ? String(job.temp4) : '');
        setTempPipe(job.tempPipe !== undefined && job.tempPipe !== null ? String(job.tempPipe) : '');

        // เวลา & ผลผลิต
        setStartTime(job.startTime ? String(job.startTime) : '');
        setEndTime(job.endTime ? String(job.endTime) : '');
        const pQty = Number(job.productQty || job.productedQty || job.totalMeters || 200);
        setTotalMeters(String(pQty));
        const calcRows = pQty > 0 ? (pQty / 200) : (job.rollCount || 1);
        setProductionRows(String(calcRows));
        setStdRollLength(String(job.stdLength || '200'));

        // สาเหตุงานเสีย
        const rawD = (job.defects && typeof job.defects === 'object' && !Array.isArray(job.defects))
            ? job.defects
            : (Array.isArray(job.defects) ? (job.defects[0] || {}) : {});

        const getDefVal = (...vals) => {
            for (const v of vals) {
                if (v !== undefined && v !== null && v !== '') {
                    const n = Number(v);
                    if (!isNaN(n) && n > 0) return String(n);
                }
            }
            return '';
        };

        setDefectSetting(getDefVal(rawD.setting, rawD.settingMachine, job.defectSetting, job.settingMachine));
        setDefectJointIpo(getDefVal(rawD.jointIpo, job.defectJointIpo, job.jointIpo));
        setDefectSplitSeam(getDefVal(rawD.splitSeam, job.defectSplitSeam, job.splitSeam));
        setDefectDimNg(getDefVal(rawD.dimNg, rawD.dimensionNg, job.defectDimNg, job.dimensionNg));
        setDefectFoamDetached(getDefVal(rawD.foamDetached, job.defectFoamDetached, job.foamDetached));
        setDefectJointMark(getDefVal(rawD.jointMark, job.defectJointMark, job.jointMark));
        setDefectThickNg(getDefVal(rawD.thickNg, job.defectThickNg, job.thickNg));
        setDefectFilmBlemish(getDefVal(rawD.filmBlemish, job.defectFilmBlemish, job.filmBlemish));
        setDefectOtherNg(getDefVal(rawD.otherNg, job.defectOtherNg, job.otherNg));

        // เวลาเสียระหว่างผลิต และ หมายเหตุปกติ (รองรับ Multiple Lost Time)
        const currentRollNote = cleanDowntimeNote(job.kpiNote || job.downtimeNote);
        const parsed = extractLostTimeAndGeneralNote(currentRollNote);

        if (Array.isArray(job.lostTimeEntries) && job.lostTimeEntries.length > 0) {
            setLostTimeList(job.lostTimeEntries.map((item, idx) => ({
                id: Date.now() + idx,
                start: item.start || '',
                end: item.end || '',
                reason: item.reason || ''
            })));
            setKpiNote(job.generalNote || job.kpiNote || parsed.generalNote || '');
        } else if (parsed.entries && parsed.entries.length > 0) {
            setLostTimeList(parsed.entries.map((item, idx) => ({
                id: Date.now() + idx,
                start: item.start || '',
                end: item.end || '',
                reason: item.reason || ''
            })));
            setKpiNote(parsed.generalNote || job.generalNote || job.kpiNote || '');
        } else if (job.lostTimeStart) {
            setLostTimeList([{
                id: 1,
                start: job.lostTimeStart,
                end: job.lostTimeEnd || '',
                reason: job.lostTimeReason || ''
            }]);
            setKpiNote(job.generalNote || job.kpiNote || currentRollNote);
        } else if (parsed.lostTimeStart) {
            setLostTimeList([{
                id: 1,
                start: parsed.lostTimeStart,
                end: parsed.lostTimeEnd || '',
                reason: parsed.lostTimeReason || ''
            }]);
            setKpiNote(parsed.generalNote || '');
        } else {
            setLostTimeList([{ id: 1, start: '', end: '', reason: '' }]);
            setKpiNote(job.generalNote || job.kpiNote || currentRollNote);
        }

        if (job.operatorName || job.employeeName) {
            setCurrentOperator(job.operatorName || job.employeeName);
        }
        if (job.shift) {
            setCurrentShift(job.shift);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Reset Form (เมื่อต้องการเริ่ม Job ใหม่ หรือล้างค่าทั้งหมด)
    const handleBack = () => {
        if (location.state?.from) {
            navigate(location.state.from);
            return;
        }
        if (initialJobId) {
            navigate('/ipo-tube/history');
            return;
        }
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/ipo-tube');
    };

    const handleResetForm = () => {
        if (ipoContext?.refreshJobs) {
            ipoContext.refreshJobs();
        }
        clearJobFormData(false);
        loadedInitialJobRef.current = null;
        if (location.state?.from) {
            navigate(location.state.from);
            return;
        }
        if (initialJobId) {
            navigate('/ipo-tube/history');
            return;
        }
        if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
        }
    };

    // Save Form (บันทึกต่องาน/ต่อรอบการผลิต แตกเป็น N ม้วนลง Report)
    const handleSave = (isClosing = false) => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);

        const strVal = (val) => (val !== undefined && val !== null ? String(val).trim() : '');
        const errors = {};
        const currentJobNo = strVal(jobNo || scanQuery);

        if (!currentJobNo) {
            errors.jobNo = 'กรุณาระบุ Job No.';
        }
        if (isCurrentJobClosed) {
            toast.error(`ปิด Job "${currentJobNo}" แล้ว`);
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }
        if (!strVal(partNo)) {
            errors.partNo = 'กรุณาระบุรหัสควบคุม / PART NO.';
        }
        if (!strVal(lotNoEmboss)) {
            errors.lotNoEmboss = 'กรุณากรอก LOT NO. Slit (ท่อ 1)';
        }
        if (!hasNoCore && !strVal(tube1Spec)) {
            errors.tube1Spec = 'กรุณาเลือกสเปก TAP (ท่อ 1)';
        }
        if (!hasNoCore && !strVal(lotNoTap)) {
            errors.lotNoTap = 'กรุณาระบุ LOT NO. TAP (ท่อ 1)';
        }
        if (isTwinTube) {
            if (!hasNoCore && !strVal(tube2Spec)) {
                errors.tube2Spec = 'กรุณาเลือกสเปก TAP (ท่อ 2)';
            }
            if (!strVal(lotNoEmboss2)) {
                errors.lotNoEmboss2 = 'กรุณากรอก LOT NO. Slit (ท่อ 2)';
            }
            if (!hasNoCore && !strVal(lotNoTap2)) {
                errors.lotNoTap2 = 'กรุณาระบุ LOT NO. TAP (ท่อ 2)';
            }
        }

        // การตรวจสอบ ท่อที่ 1 (Tube 1 หรือ ท่อเดี่ยว)
        if (!strVal(id1_1)) errors.id1_1 = true;
        if (!strVal(id2_1)) errors.id2_1 = true;
        if (!strVal(t1_1)) errors.t1_1 = true;
        if (!strVal(t2_1)) errors.t2_1 = true;
        if (!strVal(t3_1)) errors.t3_1 = true;
        if (!strVal(t4_1)) errors.t4_1 = true;

        // การตรวจสอบ ท่อที่ 2 (Tube 2 - เมื่อเป็นท่อคู่)
        if (isTwinTube) {
            if (!strVal(id1_2)) errors.id1_2 = true;
            if (!strVal(id2_2)) errors.id2_2 = true;
            if (!strVal(t1_2)) errors.t1_2 = true;
            if (!strVal(t2_2)) errors.t2_2 = true;
            if (!strVal(t3_2)) errors.t3_2 = true;
            if (!strVal(t4_2)) errors.t4_2 = true;
        }

        // พารามิเตอร์เครื่องจักร
        if (!strVal(speed)) errors.speed = true;
        if (!strVal(temp1)) errors.temp1 = true;
        if (!strVal(temp2)) errors.temp2 = true;
        if (!strVal(temp3)) errors.temp3 = true;
        if (!strVal(temp4)) errors.temp4 = true;
        if (!strVal(tempPipe)) errors.tempPipe = true;

        // เวลาการผลิต
        if (!strVal(startTime)) errors.startTime = true;
        if (!strVal(endTime)) errors.endTime = true;

        // ยอดผลิตรวม และ ความยาวม้วนมาตรฐาน
        const tMeters = parseFloat(totalMeters) || ((parseFloat(productionRows) || 0) * 200);
        const rollLen = parseFloat(stdRollLength) || 200;
        if (tMeters <= 0) {
            errors.totalMeters = 'กรุณาระบุจำนวนม้วนที่ผลิตได้';
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            toast.warning('กรุณากรอกข้อมูลที่จำเป็นให้ครบทุกช่อง');
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        setFormErrors({});

        const isTwin = isTwinTube;
        const s1 = tube1Spec || '';
        const s2 = tube2Spec || '';

        // Overall judgement: if either is NG, overall is NG
        const overallJudge = isTwin
            ? (judgement1 === 'NG' || judgement2 === 'NG' ? 'NG' : 'OK')
            : judgement1;

        // ข้อ 1: ชิ้นงานที่เป็น NG จะต้องไม่สามารถบันทึกข้อมูลได้
        if (overallJudge === 'NG' || judgement1 === 'NG' || (isTwin && judgement2 === 'NG')) {
            toast.error('❌ ไม่สามารถบันทึกข้อมูลได้: ผลการตรวจสอบขนาดท่อเป็น NG (ชิ้นงานไม่ได้มาตรฐาน กรุณาปรับตั้งเครื่องจักรหรือตรวจสอบใหม่)');
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        const effectiveLotTap1 = hasNoCore
            ? '-'
            : (strVal(lotNoTap) || CalculationService.formatToYYYYMMDD(lotNoTap) || '-');
        const parsedSlit1 = CalculationService.extractEmbossDetails(strVal(lotNoEmboss));
        const effectiveLotSlit1 = parsedSlit1.lotDate || strVal(lotNoEmboss).replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || strVal(lotNoEmboss);
        const finalRollSlit1 = strVal(rollSlit) || parsedSlit1.rollNo || '';
        const finalTotalRollSlit1 = strVal(totalRollSlit) || parsedSlit1.totalRolls || '';

        const effectiveLotTap2 = isTwin
            ? (hasNoCore
                ? '-'
                : (strVal(lotNoTap2) || CalculationService.formatToYYYYMMDD(lotNoTap2) || '-'))
            : null;
        const parsedSlit2 = isTwin ? CalculationService.extractEmbossDetails(strVal(lotNoEmboss2)) : null;
        const effectiveLotSlit2 = isTwin
            ? (parsedSlit2.lotDate || strVal(lotNoEmboss2).replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || strVal(lotNoEmboss2))
            : null;
        const finalRollSlit2 = isTwin ? (strVal(rollSlit2) || parsedSlit2?.rollNo || '') : null;
        const finalTotalRollSlit2 = isTwin ? (strVal(totalRollSlit2) || parsedSlit2?.totalRolls || '') : null;

        // คำนวณข้อมูลเวลาเสียระหว่างการผลิต (Lost Time) และรวมเข้ากับ Downtime Note (รองรับหลายช่วงเวลา)
        const lostMin = lostTimeMinutes;
        const lostH = lostMin > 0 ? (lostMin / 60).toFixed(2) : '0';
        const validLostTimes = lostTimeList.filter(item => item.start && item.end);
        const formattedLostTimes = validLostTimes.map(item => {
            const rowDiff = getRowDiffMinutes(item.start, item.end);
            const rowText = formatRowDurationText(rowDiff);
            return `[เวลาเสีย: ${item.start}-${item.end} ${item.reason || 'ไม่ระบุสาเหตุ'} (${rowText})]`;
        }).join('\n');
        const fullDowntimeNote = [formattedLostTimes, kpiNote].filter(Boolean).join('\n');
        const totalDtMin = lostMin + parseDowntimeMinutesFromNote(kpiNote);
        const allReasonsSummary = validLostTimes.map(item => item.reason).filter(Boolean).join(', ');

        const cleanProdName = extractCleanProductName(productName || description, partNo) || strVal(productName) || 'ALP6-25';
        const autoSpecs = extractIpoTubeSpecs(productName || description, partNo);

        const validTap = (v) => (v && v !== '-' && v !== 'ไม่มีไส้') ? String(v).trim() : '';
        const finalTap1 = hasNoCore ? '-' : (validTap(tapTube1) || validTap(tube1Spec) || validTap(s1) || autoSpecs.spec1 || '2');
        const finalTap2 = isTwin ? (hasNoCore ? '-' : (validTap(tapTube2) || validTap(tube2Spec) || validTap(s2) || autoSpecs.spec2 || '3')) : null;
        const finalEmboss1 = validTap(embossSlit1) || validTap(tube1Spec) || validTap(s1) || autoSpecs.spec1 || '2';
        const finalEmboss2 = isTwin ? (validTap(embossSlit2) || validTap(tube2Spec) || validTap(s2) || autoSpecs.spec2 || '3') : null;

        const basePayload = {
            isMultiRoll: true,
            isTwinTube: isTwin,
            hasCore: !hasNoCore,
            hasNoCore: hasNoCore,
            jobNo: currentJobNo,
            partNo: strVal(partNo),
            productName: cleanProdName,
            partName: cleanProdName,
            description: strVal(description) || (strVal(partNo) ? `${strVal(partNo)} ${cleanProdName}` : cleanProdName),
            productionDate: productionDate || getTodayLotNo(),
            operatorName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
            employeeName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
            shift: currentShift || '',

            status: isClosing ? 'CLOSED' : 'IN_PROGRESS',
            isClosed: Boolean(isClosing),
            closedAt: isClosing ? new Date().toISOString() : null,

            // ท่อที่ 1 (Tube 1)
            tube1Spec: finalTap1,
            tapTube: finalTap1,
            lotNoTap: effectiveLotTap1,
            lotNoSlit: effectiveLotSlit1,
            lotSlit: effectiveLotSlit1,
            embossSlit: finalEmboss1,
            lotNoEmboss: effectiveLotSlit1,
            rawLotNo: effectiveLotSlit1,
            embossLot: effectiveLotSlit1,
            lotNo: effectiveLotSlit1,
            rollSlit: finalRollSlit1,
            totalRollSlit: finalTotalRollSlit1,
            roll_slit: finalRollSlit1,
            total_roll_slit: finalTotalRollSlit1,
            selectedTube: finalTap1,
            tubeSpec: finalTap1,
            id1: strVal(id1_1),
            id2: strVal(id2_1),
            idAvg: idAvg1,
            t1: strVal(t1_1),
            t2: strVal(t2_1),
            t3: strVal(t3_1),
            t4: strVal(t4_1),
            tAvg: tAvg1,
            judgement: judgement1,

            // ท่อที่ 2 (Tube 2 - เมื่อเป็นท่อคู่: รองรับแยก Lot TAP และ Slit ประจำท่อ 2)
            tube2Spec: finalTap2,
            tube2LotTap: effectiveLotTap2,
            tube2LotNoSlit: effectiveLotSlit2,
            tube2LotSlit: effectiveLotSlit2,
            tube2LotEmboss: effectiveLotSlit2,
            tube2RollSlit: finalRollSlit2,
            tube2TotalRollSlit: finalTotalRollSlit2,
            tube2: isTwin ? {
                tubeSpec: finalTap2,
                tapTube: finalTap2,
                lotNoTap: effectiveLotTap2,
                lotNoSlit: effectiveLotSlit2,
                lotSlit: effectiveLotSlit2,
                embossSlit: finalEmboss2,
                lotNoEmboss: effectiveLotSlit2,
                rawLotNo: effectiveLotSlit2,
                embossLot: effectiveLotSlit2,
                lotNo: effectiveLotSlit2,
                rollSlit: finalRollSlit2,
                totalRollSlit: finalTotalRollSlit2,
                roll_slit: finalRollSlit2,
                total_roll_slit: finalTotalRollSlit2,
                id1: strVal(id1_2),
                id2: strVal(id2_2),
                idAvg: idAvg2,
                t1: strVal(t1_2),
                t2: strVal(t2_2),
                t3: strVal(t3_2),
                t4: strVal(t4_2),
                tAvg: tAvg2,
                judgement: judgement2,
            } : null,

            overallJudgement: overallJudge,

            // เครื่องจักร (ใช้ร่วมกันทั้งม้วน)
            speed: strVal(speed),
            temp1: strVal(temp1),
            temp2: strVal(temp2),
            temp3: strVal(temp3),
            temp4: strVal(temp4),
            tempPipe: strVal(tempPipe),

            // เวลา & ผลผลิต (ใช้ร่วมกันทั้งม้วน)
            startTime: strVal(startTime),
            endTime: strVal(endTime),
            totalTime: totalTime,

            // สาเหตุงานเสีย
            defects: {
                setting: strVal(defectSetting),
                jointIpo: strVal(defectJointIpo),
                splitSeam: strVal(defectSplitSeam),
                dimNg: strVal(defectDimNg),
                foamDetached: strVal(defectFoamDetached),
                jointMark: strVal(defectJointMark),
                thickNg: strVal(defectThickNg),
                filmBlemish: strVal(defectFilmBlemish),
                otherNg: strVal(defectOtherNg),
            },
            defectMeters: totalDefectMeters,
            ng: totalDefectMeters,
            lostTimeStart: strVal(primaryLostTime.start),
            lostTimeEnd: strVal(primaryLostTime.end),
            lostTimeReason: strVal(primaryLostTime.reason || allReasonsSummary),
            lostTimeMinutes: lostMin,
            lostTimeHours: lostH,
            lostTimeDisplay: lostMin > 0 ? `${lostH} ชม.` : '-',
            lostTimeEntries: validLostTimes.map(item => ({
                start: strVal(item.start),
                end: strVal(item.end),
                reason: strVal(item.reason),
                minutes: getRowDiffMinutes(item.start, item.end)
            })),
            kpiNote: strVal(kpiNote),
            generalNote: strVal(kpiNote),
            downtimeNote: fullDowntimeNote,
            downtimeMinutes: totalDtMin,
            downtime: totalDtMin,

            actualFoamWidth: 0,
            stdWidth: 1200,
            stdThick: Number(tAvg1) || (hasNoCore ? 6 : 10),
        };

        const runRolls = parseFloat(productionRows) || (rollLen > 0 ? Math.ceil(tMeters / rollLen) : 1);

        if (editingJob) {
            const isClosedEdit = Boolean(editingJob.isClosed || editingJob.status === 'CLOSED');
            const updatedPayload = {
                ...basePayload,
                id: editingJob.id,
                sequenceNo: editingJob.sequenceNo || editingJob.runNo || editingJob.rollNo || 1,
                runNo: editingJob.runNo || editingJob.sequenceNo || editingJob.rollNo || 1,
                rollNo: editingJob.rollNo || editingJob.sequenceNo || 1,
                productQty: tMeters,
                productedQty: tMeters,
                totalMeters: tMeters,
                stdLength: rollLen,
                rollCount: runRolls,
                operatorName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
                employeeName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
                shift: currentShift || '',
                status: isClosedEdit ? 'CLOSED' : (editingJob.status || 'IN_PROGRESS'),
                isClosed: isClosedEdit,
                closedAt: editingJob.closedAt || null,
                lostTimeStart: strVal(primaryLostTime.start),
                lostTimeEnd: strVal(primaryLostTime.end),
                lostTimeReason: strVal(primaryLostTime.reason || allReasonsSummary),
                lostTimeMinutes: lostMin,
                lostTimeHours: lostH,
                lostTimeDisplay: lostMin > 0 ? `${lostH} ชม.` : '-',
                lostTimeEntries: basePayload.lostTimeEntries,
                kpiNote: strVal(kpiNote),
                generalNote: strVal(kpiNote),
                downtimeNote: fullDowntimeNote,
                downtimeMinutes: totalDtMin,
                downtime: totalDtMin,
                createdAt: editingJob.createdAt || new Date().toISOString(),
            };
            onUpdateJob(updatedPayload);

            // บันทึก Activity Log สำหรับการแก้ไข
            ActivityLogService.logActivity({
                module: 'IPO_TUBE',
                job: currentJobNo,
                actionType: isClosedEdit ? ACTION_TYPES.EDIT_CLOSED_JOB : ACTION_TYPES.EDIT_ROLL,
                runNo: updatedPayload.runNo,
                details: isClosedEdit
                    ? `Officer แก้ไขข้อมูลรอบที่ ${updatedPayload.runNo} (Job ที่ปิดแล้ว): ยอดผลิต ${tMeters.toLocaleString()} ม. (${runRolls} แถว)`
                    : `แก้ไขข้อมูลรอบที่ ${updatedPayload.runNo}: ยอดผลิต ${tMeters.toLocaleString()} ม. (${runRolls} แถว)`
            });

            toast.success(isClosedEdit
                ? `[Foreman] อัปเดตข้อมูลรอบที่ ${updatedPayload.sequenceNo} ของ Job ที่ปิดแล้ว สำเร็จ!`
                : `อัปเดตข้อมูลรอบที่ ${updatedPayload.sequenceNo} (Job ${currentJobNo}) สำเร็จ!`);
            handleResetForm();
            setTimeout(() => {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
            }, 500);
            return;
        } else {
            // บันทึก 1 แถวต่อรอบการผลิต (Shift / Run Session) โดยไม่แตกเป็นแถวย่อย 200m
            const nextRunSeq = prevRollCount + 1;
            const runPayload = {
                ...basePayload,
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                sequenceNo: nextRunSeq,
                runNo: nextRunSeq,
                rollNo: nextRunSeq,
                productQty: tMeters,
                productedQty: tMeters,
                totalMeters: tMeters,
                stdLength: rollLen,
                rollCount: runRolls,
                operatorName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
                employeeName: (getLoggedInOperatorName() || currentOperator || operatorName || 'Operator').trim(),
                shift: currentShift || '',
                status: isClosing ? 'CLOSED' : 'IN_PROGRESS',
                isClosed: Boolean(isClosing),
                closedAt: isClosing ? new Date().toISOString() : null,
                createdAt: new Date().toISOString(),
                defects: basePayload.defects,
                defectMeters: totalDefectMeters,
                ng: totalDefectMeters,
                lostTimeStart: strVal(primaryLostTime.start),
                lostTimeEnd: strVal(primaryLostTime.end),
                lostTimeReason: strVal(primaryLostTime.reason || allReasonsSummary),
                lostTimeMinutes: lostMin,
                lostTimeHours: lostH,
                lostTimeDisplay: lostMin > 0 ? `${lostH} ชม.` : '-',
                lostTimeEntries: basePayload.lostTimeEntries,
                kpiNote: strVal(kpiNote),
                generalNote: strVal(kpiNote),
                downtimeNote: fullDowntimeNote,
                downtimeMinutes: totalDtMin,
                downtime: totalDtMin,
            };

            if (onSaveJob) {
                onSaveJob(runPayload);
            } else if (onSaveJobs) {
                onSaveJobs([runPayload]);
            }

            // บันทึก Activity Log สำหรับการบันทึกรอบใหม่ / ปิด Job
            ActivityLogService.logActivity({
                module: 'IPO_TUBE',
                job: currentJobNo,
                actionType: isClosing ? ACTION_TYPES.CLOSE_JOB : ACTION_TYPES.SAVE_ROLL,
                runNo: nextRunSeq,
                details: isClosing
                    ? `บันทึกรอบที่ ${nextRunSeq} (${tMeters.toLocaleString()} ม.) และปิด Job (รวม ${(prevRollCount * runRolls) + runRolls} ม้วน)`
                    : `บันทึกรอบที่ ${nextRunSeq} ยอดผลิต ${tMeters.toLocaleString()} ม. (~${runRolls} ม้วน)`
            });

            if (isClosing) {
                toast.success(`บันทึกและปิด Job ${currentJobNo} (รวม ${nextRunSeq} รอบ / ~${(prevRollCount * runRolls) + runRolls} ม้วน) เรียบร้อยแล้ว!`);
                handleResetForm();
                setTimeout(() => {
                    isSubmittingRef.current = false;
                    setIsSubmitting(false);
                }, 500);
                return;
            } else {
                toast.success(`บันทึกรอบที่ ${nextRunSeq} สำเร็จ! (${tMeters.toLocaleString()} m. ~${runRolls} ม้วน)`);
            }
        }

        // ล้างเฉพาะค่ายอดเมตร เวลา และสาเหตุงานเสียประจำรอบ เพื่อเตรียมพร้อมสำหรับรอบถัดไป
        // โดยคงค่าการตรวจสอบ & พารามิเตอร์เครื่องจักรไว้สำหรับ Job เดิมตามที่กำหนด
        setTotalMeters('');
        setDefectSetting('');
        setDefectJointIpo('');
        setDefectSplitSeam('');
        setDefectDimNg('');
        setDefectFoamDetached('');
        setDefectJointMark('');
        setDefectThickNg('');
        setDefectFilmBlemish('');
        setDefectOtherNg('');
        setKpiNote('');
        setStartTime('');
        setEndTime('');
        setFormErrors({});

        setTimeout(() => {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }, 600);
    };

    // ขอปิด Job (เปิด modal ยืนยัน)
    const handleRequestCloseJob = () => {
        const currentJobNo = (jobNo || scanQuery || '').trim();
        if (!currentJobNo) {
            toast.warning('กรุณาระบุหรือสแกน Job No. ก่อนทำการปิด Job');
            if (barcodeInputRef.current) barcodeInputRef.current.focus();
            return;
        }

        const tMeters = parseFloat(totalMeters) || 0;
        if (tMeters > 0 && (overallJudge === 'NG' || judgement1 === 'NG' || (isTwinTube && judgement2 === 'NG'))) {
            toast.error('❌ ไม่สามารถปิด Job และบันทึกยอดได้: ผลการตรวจวัดขนาดท่อเป็น NG (ชิ้นงานไม่ได้มาตรฐาน)');
            return;
        }
        const rLength = parseFloat(stdRollLength) || 200;
        const pendingRolls = tMeters > 0 ? Math.ceil(tMeters / rLength) : 0;

        setCloseJobModalState({
            isOpen: true,
            jobNo: currentJobNo,
            partNo: String(partNo || '').trim(),
            productName: extractCleanProductName(productName || description, partNo) || String(productName || '').trim() || 'ALP6-25',
            existingRolls: prevRollCount,
            existingMeters: prevMeters,
            batchMeters: tMeters,
            batchRolls: pendingRolls,
            totalRolls: prevRollCount + pendingRolls,
            totalMeters: prevMeters + tMeters
        });
    };

    // ยืนยันปิด Job
    const handleConfirmCloseJob = () => {
        const { jobNo: targetJobNo, batchMeters } = closeJobModalState;
        if (!targetJobNo) return;

        if (batchMeters > 0) {
            handleSave(true);
        } else {
            onUpdateJob({
                jobNo: targetJobNo,
                status: 'CLOSED',
                isClosed: true,
                closedAt: new Date().toISOString()
            });

            // บันทึก Activity Log สำหรับการปิด Job
            ActivityLogService.logActivity({
                module: 'IPO_TUBE',
                job: targetJobNo,
                actionType: ACTION_TYPES.CLOSE_JOB,
                details: `ปิด Job No. "${targetJobNo}" รวมทั้งหมด ${closeJobModalState.totalRolls} ม้วน (${closeJobModalState.totalMeters.toLocaleString()} ม.)`
            });

            toast.success(`ปิด Job No. "${targetJobNo}" (ทั้งหมด ${closeJobModalState.totalRolls} ม้วน) เรียบร้อยแล้ว!`);
            handleResetForm();
        }

        setCloseJobModalState({
            isOpen: false,
            jobNo: '',
            partNo: '',
            productName: '',
            existingRolls: 0,
            existingMeters: 0,
            batchMeters: 0,
            batchRolls: 0,
            totalRolls: 0,
            totalMeters: 0
        });
    };

    // สลับสถานะเปิด/ปิด Job จากหน้าต่างสรุป
    const handleToggleJobStatus = (targetJobNo, closeIt) => {
        if (!targetJobNo) return;
        onUpdateJob({
            jobNo: targetJobNo,
            status: closeIt ? 'CLOSED' : 'IN_PROGRESS',
            isClosed: Boolean(closeIt),
            closedAt: closeIt ? new Date().toISOString() : null
        });

        // บันทึก Activity Log สำหรับการสลับสถานะ
        ActivityLogService.logActivity({
            module: 'IPO_TUBE',
            job: targetJobNo,
            actionType: closeIt ? ACTION_TYPES.CLOSE_JOB : ACTION_TYPES.REOPEN_JOB,
            details: closeIt
                ? `ปิด Job "${targetJobNo}" (${isOfficer ? 'Officer' : 'Operator'})`
                : `ปลดล็อกเปิด Job "${targetJobNo}" กลับมาดำเนินการต่อ (${isOfficer ? 'Officer' : 'Operator'})`
        });

        toast.info(closeIt ? `ปิด Job "${targetJobNo}" เรียบร้อยแล้ว` : `เปิด Job "${targetJobNo}" กลับมาดำเนินการต่อ`);
    };

    return (
        <div className="animate-fadeIn w-full flex-1" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <style>{`
                .job-form-2col-grid {
                    display: grid;
                    grid-template-columns: minmax(540px, 1.4fr) minmax(350px, 1fr);
                    gap: 0;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.04);
                    flex: 1;
                }
                .job-form-col-left {
                    padding: 8px 10px;
                    min-width: 0;
                    background: #ffffff;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    overflow-x: hidden;
                    overflow-y: auto;
                    border-right: 1px solid #e2e8f0;
                    scrollbar-width: thin;
                    scrollbar-color: #cbd5e1 transparent;
                }
                .job-form-col-right {
                    padding: 8px 10px;
                    min-width: 0;
                    background: #ffffff;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    overflow-x: hidden;
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: #cbd5e1 transparent;
                }
                .job-form-col-left::-webkit-scrollbar,
                .job-form-col-right::-webkit-scrollbar {
                    width: 4px;
                }
                .job-form-col-left::-webkit-scrollbar-thumb,
                .job-form-col-right::-webkit-scrollbar-thumb {
                    background-color: #cbd5e1;
                    border-radius: 4px;
                }
                @media (max-width: 1024px) {
                    .job-form-2col-grid {
                        grid-template-columns: 1fr;
                        min-height: auto;
                    }
                    .job-form-col-left {
                        border-right: none;
                        border-bottom: 1px solid #e2e8f0;
                    }
                }
                .form-field-label {
                    display: block;
                    font-size: 13.5px;
                    font-weight: 800;
                    color: #334155;
                    margin-bottom: 4px;
                }
                .badge-req {
                    display: inline-flex;
                    align-items: center;
                    font-size: 11px;
                    font-weight: 800;
                    color: #1e40af;
                    background: #dbeafe;
                    border: 1px solid #bfdbfe;
                    padding: 1px 6px;
                    border-radius: 4px;
                    margin-left: 6px;
                    line-height: 1.2;
                }
                .badge-req-amber {
                    display: inline-flex;
                    align-items: center;
                    font-size: 11px;
                    font-weight: 800;
                    color: #b45309;
                    background: #fef3c7;
                    border: 1px solid #fde68a;
                    padding: 1px 6px;
                    border-radius: 4px;
                    margin-left: 6px;
                    line-height: 1.2;
                }
                .badge-opt {
                    display: inline-flex;
                    align-items: center;
                    font-size: 10.5px;
                    font-weight: 700;
                    color: #64748b;
                    background: #f1f5f9;
                    border: 1px solid #e2e8f0;
                    padding: 1px 5px;
                    border-radius: 4px;
                    margin-left: 6px;
                    line-height: 1.2;
                }
                .input-req-blue {
                    background: #eff6ff !important;
                    border: 2px solid #3b82f6 !important;
                    color: #1e3a8a !important;
                    font-weight: 900 !important;
                }
                .input-req-amber {
                    background: #fffbeb !important;
                    border: 2px solid #f59e0b !important;
                    color: #78350f !important;
                    font-weight: 800 !important;
                }
                .form-field-input {
                    width: 100%;
                    height: 38px;
                    padding: 4px 10px;
                    font-size: 15px;
                    font-weight: 700;
                    border: 1.5px solid #cbd5e1;
                    border-radius: 8px;
                    outline: none;
                    background-color: #ffffff;
                    color: #0f172a;
                    transition: all 0.15s ease;
                    box-sizing: border-box;
                }
                .form-field-input:focus {
                    border-color: #2563eb;
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.2);
                }
                .scanner-hero-input {
                    border: 2px solid #3b82f6;
                    border-radius: 8px;
                    outline: none;
                    font-size: 15px;
                    font-weight: 800;
                    color: #1e3a8a;
                    background: #eff6ff;
                    height: 38px;
                    padding: 4px 12px;
                    transition: all 0.15s ease;
                }
                .scanner-hero-input:focus {
                    border-color: #1d4ed8;
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25);
                }
                .btn-scanner-hero {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    background: #1d4ed8;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-weight: 800;
                    font-size: 14px;
                    cursor: pointer;
                    height: 38px;
                    padding: 0 16px;
                    transition: all 0.15s ease;
                }
                .btn-scanner-hero:hover {
                    background: #1e40af;
                }
                .btn-save-job-hero {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 8px 16px;
                    height: 46px;
                    background: #16a34a;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 900;
                    cursor: pointer;
                    box-shadow: 0 3px 8px rgba(22, 163, 74, 0.28);
                    transition: all 0.15s ease;
                }
                .btn-save-job-hero:hover {
                    background: #15803d;
                    box-shadow: 0 4px 10px rgba(22, 163, 74, 0.35);
                    transform: translateY(-1px);
                }
                .btn-save-job-hero:active {
                    transform: translateY(0);
                }
                .btn-close-job-hero {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    flex: 1;
                    padding: 6px 16px;
                    height: 46px;
                    font-size: 16px;
                    font-weight: 900;
                    border-radius: 8px;
                    border: none;
                    background: linear-gradient(135deg, #15803d 0%, #16a34a 100%);
                    color: #ffffff;
                    cursor: pointer;
                    box-shadow: 0 3px 8px rgba(22, 163, 74, 0.28);
                    white-space: nowrap;
                    transition: all 0.15s ease;
                }
                .btn-close-job-hero:hover {
                    background: linear-gradient(135deg, #166534 0%, #15803d 100%);
                    box-shadow: 0 4px 12px rgba(22, 163, 74, 0.38);
                    transform: translateY(-1px);
                }
                .btn-close-job-hero:active {
                    transform: translateY(0);
                }
                .btn-save-roll-compact {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 6px 14px;
                    height: 46px;
                    font-size: 13.5px;
                    font-weight: 800;
                    border-radius: 8px;
                    border: 1.5px solid #059669;
                    background: #ffffff;
                    color: #047857;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                    white-space: nowrap;
                    transition: all 0.15s ease;
                }
                .btn-save-roll-compact:hover {
                    background: #ecfdf5;
                    border-color: #047857;
                    color: #065f46;
                    box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);
                    transform: translateY(-1px);
                }
                .btn-save-roll-compact:active {
                    transform: translateY(0);
                }
                .btn-close-job-outline {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    padding: 4px 10px;
                    height: 36px;
                    font-size: 12px;
                    font-weight: 800;
                    border-radius: 6px;
                    border: 2px solid #059669;
                    background: #ffffff;
                    color: #047857;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    white-space: nowrap;
                    transition: all 0.15s ease;
                }
                .btn-close-job-outline:hover {
                    background: #ecfdf5;
                    border-color: #047857;
                    color: #065f46;
                    box-shadow: 0 2px 6px rgba(5, 150, 105, 0.15);
                    transform: translateY(-1px);
                }
                .btn-close-job-outline:active {
                    transform: translateY(0);
                }
                .btn-compact-secondary {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    border-radius: 6px;
                    border: 1px solid #cbd5e1;
                    background: #ffffff;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .unit-tag-badge {
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 10px;
                    font-weight: 700;
                    color: #64748b;
                    pointer-events: none;
                }
                .table-responsive-container {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    overflow-x: auto;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                }
                .modern-report-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    text-align: center;
                    background: #ffffff;
                }
                .modern-report-table th,
                .modern-report-table td {
                    border: 1px solid #cbd5e1;
                    padding: 5px 6px;
                    vertical-align: middle;
                }
                .modern-report-table thead th {
                    background: #f1f5f9;
                    color: #1e293b;
                    font-weight: 700;
                }
                .modern-report-table .th-sub {
                    background: #f8fafc;
                    font-size: 10px;
                }
                .modern-report-table .sub-en {
                    font-size: 9px;
                    font-weight: 600;
                    color: #64748b;
                    display: block;
                }
                .modern-report-table tbody tr:hover {
                    background-color: #f8fafc;
                }
                .modal-backdrop {
                    position: fixed;
                    inset: 0;
                    background-color: rgba(15, 23, 42, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    z-index: 9999;
                }
                .syteline-modal-card {
                    background: #ffffff;
                    border-radius: 14px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.25);
                    width: 100%;
                    max-width: 95vw;
                    max-height: 88vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border: 1px solid #e2e8f0;
                }
                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 10px 16px;
                    border-bottom: 1px solid #f1f5f9;
                    background: #f8fafc;
                }
                .btn-icon-close {
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 15px;
                    color: #64748b;
                    transition: all 0.15s ease;
                }
                .btn-icon-close:hover {
                    background: #f1f5f9;
                    color: #0f172a;
                }
            `}</style>

            {/* ── แถบด้านบน: สไตล์เดียวกับ Slit กะทัดรัด ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                    type="button"
                    onClick={handleBack}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                        transition: 'all 0.15s ease',
                        height: '28px'
                    }}
                    className="hover:bg-slate-50 hover:text-blue-700 hover:border-blue-300 active:scale-95"
                    title="กลับ"
                >
                    <RiArrowGoBackLine size={14} className="text-blue-600" />
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setShowRecentJobsModal(true)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 12px',
                            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                            border: '1px solid #1d4ed8',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(29, 78, 216, 0.2)',
                            transition: 'all 0.15s ease',
                            height: '28px'
                        }}
                        className="hover:brightness-110 active:scale-95"
                    >
                        <FileSpreadsheet size={14} color="#ffffff" />
                        <span>รายการที่บันทึกแล้ว</span>
                        <span style={{
                            background: 'rgba(255, 255, 255, 0.22)',
                            color: '#ffffff',
                            padding: '1px 6px',
                            borderRadius: '10px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            border: '1px solid rgba(255, 255, 255, 0.3)'
                        }}>
                            {todayRollsCount} รายการ
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Main 2-Column Form Card (คอลัมน์ซ้าย: ข้อมูลสั่งผลิต & วัตถุดิบ + การตรวจสอบอยู่ข้างล่าง / คอลัมน์ขวา: เวลาผลิต & ผลผลิต) ── */}
            <div className="job-form-2col-grid">
                {/* ══ คอลัมน์ซ้าย: 1. ข้อมูลสั่งผลิต & วัตถุดิบ + 2. การตรวจสอบ & พารามิเตอร์เครื่องจักร (อยู่ข้างล่าง 1) ══ */}
                <div className="job-form-col-left">
                    {/* ── 1. ข้อมูลสั่งผลิต & วัตถุดิบ (ไม่แสดง BOM) ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '24px', height: '24px', borderRadius: '50%',
                                    background: '#1d4ed8', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '12px', fontWeight: 800, flexShrink: 0
                                }}>1</span>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>
                                    ข้อมูลสั่งผลิต & วัตถุดิบ
                                </span>
                            </div>
                        </div>

                        {/* แถวข้อมูล Job + Part No & Prod Name: จัด 2 คอลัมน์แนวนอน กระชับ ไม่กินเนื้อที่แนวตั้ง */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(220px, 1.05fr) minmax(260px, 1.35fr)',
                            gap: '8px',
                            alignItems: 'stretch'
                        }}>
                            {/* 1. สแกน Barcode / ค้นหา Job */}
                            <div style={{
                                background: formErrors.jobNo ? '#fff5f5' : '#eff6ff',
                                border: formErrors.jobNo ? '2px solid #ef4444' : 'none',
                                borderRadius: '8px',
                                padding: '8px 10px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Scan size={18} color={formErrors.jobNo ? '#dc2626' : '#1d4ed8'} />
                                        <span style={{ fontSize: '14px', fontWeight: 900, color: formErrors.jobNo ? '#b91c1c' : '#1e40af', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            JOB NO. (สแกน Barcode) <span style={{ color: '#ef4444', fontSize: '16px', fontWeight: 900 }}>*</span>

                                        </span>
                                    </div>
                                </div>
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const val = barcodeInputRef.current?.value || scanQuery || jobNo || '';
                                        handleScanSubmit(e, val);
                                    }}
                                    style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
                                >
                                    <input
                                        ref={barcodeInputRef}
                                        type="text"
                                        className="scanner-hero-input"
                                        style={{
                                            flex: 1,
                                            minWidth: 0,
                                            padding: '4px 12px',
                                            fontSize: '16.5px',
                                            fontWeight: 900,
                                            height: '42px',
                                            background: formErrors.jobNo ? '#fef2f2' : '#ffffff',
                                            border: formErrors.jobNo ? '2px solid #ef4444' : '2.5px solid #2563eb',
                                            borderRadius: '8px'
                                        }}
                                        placeholder="ยิง Barcode หรือพิมพ์ Job No."
                                        value={jobNo || scanQuery}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setScanQuery(val);
                                            setJobNo(val);
                                            if (!val.trim()) {
                                                clearJobFormData(false);
                                            } else if (formErrors.jobNo) {
                                                setFormErrors(prev => ({ ...prev, jobNo: undefined }));
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleScanSubmit(e, e.target.value);
                                            }
                                        }}
                                        onPaste={(e) => {
                                            setTimeout(() => {
                                                const pastedVal = barcodeInputRef.current?.value || '';
                                                if (pastedVal.trim()) {
                                                    handleScanSubmit(null, pastedVal.trim());
                                                }
                                            }, 60);
                                        }}
                                        disabled={isSearchingJob}
                                    />
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            const val = barcodeInputRef.current?.value || scanQuery || jobNo || '';
                                            handleScanSubmit(e, val);
                                        }}
                                        className="btn-scanner-hero"
                                        style={{ padding: '0 16px', fontSize: '14.5px', fontWeight: 900, whiteSpace: 'nowrap', height: '42px', borderRadius: '8px' }}
                                        disabled={isSearchingJob || !(jobNo?.trim() || scanQuery?.trim())}
                                    >
                                        {isSearchingJob ? '...' : 'ค้นหา Job'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleResetForm}
                                        className="btn-compact-secondary hover:bg-slate-100 hover:text-red-600 transition-all cursor-pointer"
                                        style={{ height: '42px', width: '42px', minWidth: '42px', padding: 0, borderRadius: '8px' }}
                                        title="ล้าง Job / ข้อมูล"
                                    >
                                        <RotateCcw size={16} />
                                    </button>
                                </form>
                                {formErrors.jobNo && (
                                    <span style={{ color: '#dc2626', fontSize: '11px', fontWeight: 800, marginTop: '2px', display: 'block' }}>
                                        {formErrors.jobNo}
                                    </span>
                                )}
                                {isCurrentJobClosed && (
                                    <div style={{
                                        marginTop: '4px',
                                        background: '#fff1f2',
                                        border: '1.5px solid #fecdd3',
                                        borderRadius: '6px',
                                        padding: '4px 8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        color: '#e11d48',
                                        fontSize: '12px',
                                        fontWeight: 800
                                    }}>
                                        <Lock size={14} className="shrink-0 text-rose-600" />
                                        <span>ปิด Job แล้ว</span>
                                    </div>
                                )}
                            </div>

                            {/* 2. Info Card: PART NO. & PROD. NAME */}
                            <div style={{
                                background: '#f8fafc',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '4px'
                            }}>
                                {/* PART NO */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569', letterSpacing: '0.3px' }}>PART NO.</span>
                                        {availableItems.length > 1 && (
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: '4px' }}>
                                                {availableItems.length} Items
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '16.5px', fontWeight: 900, color: partNo ? '#0f172a' : '#94a3b8', wordBreak: 'break-all' }}>
                                        {partNo || '-'}
                                    </div>
                                    {availableItems.length > 1 && (
                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '3px' }}>
                                            {availableItems.map((it, idx) => {
                                                const isSelected = partNo === it.partNo;
                                                return (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => applyItemData(it)}
                                                        style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                                            background: isSelected ? '#eff6ff' : '#ffffff',
                                                            color: isSelected ? '#1d4ed8' : '#475569'
                                                        }}
                                                    >
                                                        {it.partNo}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '3px' }}>
                                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '1px' }}>PROD. NAME</span>
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            color: (description || productName) ? '#1e293b' : '#94a3b8',
                                            lineHeight: 1.25,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}
                                        title={description || productName || '-'}
                                    >
                                        {description || productName || '-'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── 2. การตรวจสอบ & พารามิเตอร์เครื่องจักร (อยู่ข้างล่าง 1 ข้อมูลสั่งผลิต & วัตถุดิบ) ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        flex: 1,
                        minHeight: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '26px', height: '26px', borderRadius: '50%',
                                    background: '#0369a1', color: 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '13px', fontWeight: 900, flexShrink: 0
                                }}>2</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b' }}>
                                    การตรวจสอบ
                                </span>
                            </div>

                            {/* สลับ ท่อเดี่ยว/ท่อคู่, ไม่มีไส้/มีไส้ และ กรณีตรวจ [ok] / [ng] */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {/* ท่อเดี่ยว / ท่อคู่ */}
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    background: '#f1f5f9',
                                    padding: '2px',
                                    borderRadius: '7px'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleTubeType('SINGLE')}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: !isTwinTube ? '#1d4ed8' : 'transparent',
                                            color: !isTwinTube ? '#ffffff' : '#64748b',
                                            transition: 'all 0.15s ease',
                                            height: '28px'
                                        }}
                                        title="โหมดท่อเดี่ยว"
                                    >
                                        ท่อเดี่ยว
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleTubeType('TWIN')}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: isTwinTube ? '#7c3aed' : 'transparent',
                                            color: isTwinTube ? '#ffffff' : '#64748b',
                                            transition: 'all 0.15s ease',
                                            height: '28px'
                                        }}
                                        title="โหมดท่อคู่"
                                    >
                                        ท่อคู่
                                    </button>
                                </div>

                                {/* ไม่มีไส้ / มีไส้ (UI รูปแบบ segmented pill เหมือน ท่อเดี่ยว / ท่อคู่) */}
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    background: '#f1f5f9',
                                    padding: '2px',
                                    borderRadius: '7px'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleHasCore(true)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: hasNoCore ? '#d80000ff' : 'transparent',
                                            color: hasNoCore ? '#ffffff' : '#64748b',
                                            transition: 'all 0.15s ease',
                                            height: '28px'
                                        }}
                                        title="ไม่มีไส้ — ซ่อนช่อง Lot No. Tap Tube"
                                    >
                                        ไม่มีไส้
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleHasCore(false)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '5px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            border: 'none',
                                            background: !hasNoCore ? '#00ac09ff' : 'transparent',
                                            color: !hasNoCore ? '#ffffff' : '#64748b',
                                            transition: 'all 0.15s ease',
                                            height: '28px'
                                        }}
                                        title="มีไส้ — แสดงช่อง Lot No. Tap Tube"
                                    >
                                        มีไส้
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
                            {/* การตรวจสอบ: ซ่อนกล่องไว้ก่อนเมื่อยังไม่ได้เลือก Job */}
                            {!hasJob && tubeSpecs.length === 0 ? (
                                <div style={{
                                    background: '#f8fafc',
                                    border: '1.5px dashed #cbd5e1',
                                    borderRadius: '10px',
                                    padding: '32px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    textAlign: 'center',
                                    flex: 1
                                }}>
                                    <div style={{
                                        width: '44px',
                                        height: '44px',
                                        borderRadius: '50%',
                                        background: '#eff6ff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#2563eb'
                                    }}>
                                        <Scan size={22} />
                                    </div>
                                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#334155' }}>
                                        ยังไม่ได้เลือก Job
                                    </div>
                                    <div style={{ fontSize: '11.5px', color: '#64748b', maxWidth: '320px', lineHeight: 1.4 }}>
                                        กรุณาสแกน Barcode หรือเลือก Job เพื่อโหลดสเปกการตรวจสอบท่อ (IPO) จากระบบ SyteLine
                                    </div>
                                </div>
                            ) : (() => {
                                const renderTubeCard = (idx, isSingle = false) => {
                                    const isTube1 = idx === 0;
                                    const spec = isTube1 ? tube1Spec : tube2Spec;
                                    const judgement = isTube1 ? judgement1 : judgement2;
                                    const setJudgement = isTube1 ? setJudgement1 : setJudgement2;
                                    const lotTapVal = isTube1 ? lotNoTap : lotNoTap2;
                                    const setLotTapVal = isTube1 ? setLotNoTap : setLotNoTap2;
                                    const lotTapRef = isTube1 ? lotTapInputRef : lotTapInputRef2;
                                    const tapErrKey = isTube1 ? 'lotNoTap' : 'lotNoTap2';
                                    const tapErr = formErrors[tapErrKey];
                                    const lotEmbossVal = isTube1 ? lotNoEmboss : lotNoEmboss2;
                                    const setLotEmbossVal = isTube1 ? setLotNoEmboss : setLotNoEmboss2;
                                    const lotEmbossRef = isTube1 ? lotEmbossInputRef : lotEmbossInputRef2;
                                    const embossErrKey = isTube1 ? 'lotNoEmboss' : 'lotNoEmboss2';
                                    const embossErr = formErrors[embossErrKey];

                                    const rollSlitVal = isTube1 ? rollSlit : rollSlit2;
                                    const setRollSlitVal = isTube1 ? setRollSlit : setRollSlit2;
                                    const rollSlitRef = isTube1 ? rollSlitInputRef : rollSlitInputRef2;

                                    const totalRollSlitVal = isTube1 ? totalRollSlit : totalRollSlit2;
                                    const setTotalRollSlitVal = isTube1 ? setTotalRollSlit : setTotalRollSlit2;
                                    const totalRollSlitRef = isTube1 ? totalRollSlitInputRef : totalRollSlitInputRef2;

                                    const id1Val = isTube1 ? id1_1 : id1_2;
                                    const setId1Val = isTube1 ? setId1_1 : setId1_2;
                                    const id1Ref = isTube1 ? id1_1_Ref : id1_2_Ref;
                                    const id1ErrKey = isTube1 ? 'id1_1' : 'id1_2';
                                    const id1Err = formErrors[id1ErrKey];

                                    const id2Val = isTube1 ? id2_1 : id2_2;
                                    const setId2Val = isTube1 ? setId2_1 : setId2_2;
                                    const id2Ref = isTube1 ? id2_1_Ref : id2_2_Ref;
                                    const id2ErrKey = isTube1 ? 'id2_1' : 'id2_2';
                                    const id2Err = formErrors[id2ErrKey];

                                    const idAvgVal = isTube1 ? idAvg1 : idAvg2;
                                    const isTubeIdValid = isTube1 ? isIdAvg1Valid : isIdAvg2Valid;
                                    const tubeIdTol = isTube1 ? idTol1 : idTol2;
                                    const tubeThickTol = isTube1 ? thickTol1 : thickTol2;

                                    const isId1Filled = id1Val !== '' && id1Val !== undefined && id1Val !== null;
                                    const isId1Valid = tubeIdTol ? CalculationService.isIpoIdValid(id1Val, spec) : null;
                                    const isId1HasStatus = isId1Filled && isId1Valid !== null;

                                    const isId2Filled = id2Val !== '' && id2Val !== undefined && id2Val !== null;
                                    const isId2Valid = tubeIdTol ? CalculationService.isIpoIdValid(id2Val, spec) : null;
                                    const isId2HasStatus = isId2Filled && isId2Valid !== null;

                                    const t1Val = isTube1 ? t1_1 : t1_2;
                                    const setT1Val = isTube1 ? setT1_1 : setT1_2;
                                    const t1Ref = isTube1 ? t1_1_Ref : t1_2_Ref;
                                    const t1ErrKey = isTube1 ? 't1_1' : 't1_2';
                                    const t1Err = formErrors[t1ErrKey];

                                    const t2Val = isTube1 ? t2_1 : t2_2;
                                    const setT2Val = isTube1 ? setT2_1 : setT2_2;
                                    const t2Ref = isTube1 ? t2_1_Ref : t2_2_Ref;
                                    const t2ErrKey = isTube1 ? 't2_1' : 't2_2';
                                    const t2Err = formErrors[t2ErrKey];

                                    const t3Val = isTube1 ? t3_1 : t3_2;
                                    const setT3Val = isTube1 ? setT3_1 : setT3_2;
                                    const t3Ref = isTube1 ? t3_1_Ref : t3_2_Ref;
                                    const t3ErrKey = isTube1 ? 't3_1' : 't3_2';
                                    const t3Err = formErrors[t3ErrKey];

                                    const t4Val = isTube1 ? t4_1 : t4_2;
                                    const setT4Val = isTube1 ? setT4_1 : setT4_2;
                                    const t4Ref = isTube1 ? t4_1_Ref : t4_2_Ref;
                                    const t4ErrKey = isTube1 ? 't4_1' : 't4_2';
                                    const t4Err = formErrors[t4ErrKey];

                                    const tAvgVal = isTube1 ? tAvg1 : tAvg2;
                                    const isTValid = isTube1 ? isTValid1 : isTValid2;
                                    const hasTubeMeasurements = Boolean(id1Val || id2Val || t1Val || t2Val || t3Val || t4Val);

                                    // Theme colors matching user images:
                                    // Tube 1: Pink (#ec4899), Tube 2: Purple (#8b5cf6)
                                    const themeColor = isTube1 ? '#ec4899' : '#8b5cf6';
                                    const themeCardBg = isTube1 ? '#fff7f9' : '#faf5ff';
                                    const themeCardBorder = isTube1 ? '#fbcfe8' : '#e9d5ff';
                                    const themeInputBorder = isTube1 ? '#f472b6' : '#a78bfa';

                                    const currentSpec = spec && spec !== '-' ? String(spec).trim() : '';
                                    const badgeLabel = currentSpec ? `IPO ${currentSpec}` : 'IPO';

                                    return (
                                        <div
                                            key={idx}
                                            style={{
                                                background: themeCardBg,
                                                border: `1.5px solid ${themeCardBorder}`,
                                                borderRadius: '12px',
                                                padding: '14px 18px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                                            }}
                                        >
                                            {/* Header Row: Pill Badge, Lot No. Tap & Lot No. Slit */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                                                {/* Left: Pill Badge */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{
                                                        background: themeColor,
                                                        color: '#ffffff',
                                                        padding: '5px 22px',
                                                        borderRadius: '9999px',
                                                        fontWeight: 900,
                                                        fontSize: '15px',
                                                        boxShadow: isTube1 ? '0 2px 4px rgba(236,72,153,0.3)' : '0 2px 4px rgba(139,92,246,0.3)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}>
                                                        {badgeLabel}
                                                    </div>
                                                </div>

                                                {/* Right: Lot Inputs */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                    {/* Lot No. Tap Tube (ซ่อนเมื่อไม่มีไส้ hasNoCore) */}
                                                    {!hasNoCore && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 800, color: isTube1 ? '#be185d' : '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <CalendarDays size={14} />
                                                                Lot No. Tap Tube <span style={{ color: '#ef4444' }}>*</span>
                                                            </span>
                                                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                                                                <input
                                                                    ref={lotTapRef}
                                                                    type="text"
                                                                    placeholder="yyyy-mm-dd"
                                                                    value={lotTapVal === '-' ? '' : (lotTapVal || '')}
                                                                    maxLength={10}
                                                                    onChange={(e) => {
                                                                        setLotTapVal(e.target.value);
                                                                        if (tapErr) setFormErrors(prev => ({ ...prev, [tapErrKey]: undefined }));
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            lotEmbossRef.current?.focus();
                                                                            lotEmbossRef.current?.select?.();
                                                                        }
                                                                    }}
                                                                    onFocus={(e) => e.target.select()}
                                                                    style={{
                                                                        height: '38px',
                                                                        width: '145px',
                                                                        padding: '2px 32px 2px 10px',
                                                                        borderRadius: '8px',
                                                                        border: tapErr ? '2px solid #ef4444' : `2px solid ${themeInputBorder}`,
                                                                        background: isTube1 ? '#fff1f2' : '#f5f3ff',
                                                                        color: isTube1 ? '#831843' : '#4c1d95',
                                                                        fontSize: '15px',
                                                                        fontWeight: 800,
                                                                        textAlign: 'center'
                                                                    }}
                                                                />
                                                                <input
                                                                    type="date"
                                                                    tabIndex={-1}
                                                                    value={lotTapVal && /^\d{4}-\d{2}-\d{2}$/.test(lotTapVal) ? lotTapVal : ''}
                                                                    onChange={(e) => {
                                                                        if (e.target.value) {
                                                                            setLotTapVal(e.target.value);
                                                                            if (tapErr) setFormErrors(prev => ({ ...prev, [tapErrKey]: undefined }));
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        right: 0,
                                                                        width: '32px',
                                                                        height: '100%',
                                                                        opacity: 0,
                                                                        cursor: 'pointer',
                                                                        zIndex: 2
                                                                    }}
                                                                    title="เลือกวันที่จากปฏิทิน (yyyy-mm-dd)"
                                                                />
                                                                <CalendarDays
                                                                    size={16}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        right: '8px',
                                                                        color: isTube1 ? '#be185d' : '#6d28d9',
                                                                        pointerEvents: 'none',
                                                                        zIndex: 1
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Lot No. Slit (Emboss) */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Scan size={14} color="#d97706" />
                                                            Lot No. Slit <span style={{ color: '#ef4444' }}>*</span>
                                                        </span>
                                                        <input
                                                            ref={lotEmbossRef}
                                                            type="text"
                                                            placeholder="scan barcode"
                                                            value={lotEmbossVal}
                                                            onChange={(e) => {
                                                                const raw = e.target.value;
                                                                // บันทึกค่าตามที่สแกน/พิมพ์เข้ามาทันที โดยไม่ดัดแปลงข้อความระหว่างสแกนเนอร์กำลังยิงตัวอักษร
                                                                setLotEmbossVal(raw);
                                                                if (embossErr) setFormErrors(prev => ({ ...prev, [embossErrKey]: undefined }));

                                                                // Debounce 180ms เพื่อรอให้สแกนเนอร์ส่งข้อมูลครบทุกตัวอักษรก่อนแปลงฟอร์แมต
                                                                // ป้องกัน race condition ที่ทำให้ข้อความถูกตัดทอนกลายเป็น (Roll 5)|EMBOSS|
                                                                if (raw && (raw.includes('|') || /EMBOSS|SLIT/i.test(raw))) {
                                                                    if (slitScanTimerRef.current) clearTimeout(slitScanTimerRef.current);
                                                                    slitScanTimerRef.current = setTimeout(() => {
                                                                        handleProcessSlitScan(raw, isTube1, true);
                                                                    }, 180);
                                                                }
                                                            }}
                                                            onPaste={(e) => {
                                                                const pasted = e.clipboardData?.getData('text') || '';
                                                                if (pasted && (pasted.includes('|') || /EMBOSS|SLIT/i.test(pasted) || /\d{4}[-/]\d{2}[-/]\d{2}/.test(pasted))) {
                                                                    e.preventDefault();
                                                                    if (slitScanTimerRef.current) clearTimeout(slitScanTimerRef.current);
                                                                    handleProcessSlitScan(pasted, isTube1, true);
                                                                }
                                                            }}
                                                            onBlur={(e) => {
                                                                if (slitScanTimerRef.current) clearTimeout(slitScanTimerRef.current);
                                                                const raw = e.target.value;
                                                                if (raw && (raw.includes('|') || /EMBOSS|SLIT/i.test(raw))) {
                                                                    handleProcessSlitScan(raw, isTube1, false);
                                                                }
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    if (slitScanTimerRef.current) clearTimeout(slitScanTimerRef.current);
                                                                    const raw = e.target.value;
                                                                    if (raw && (raw.includes('|') || /EMBOSS|SLIT/i.test(raw) || /\d{4}[-/]\d{2}[-/]\d{2}/.test(raw))) {
                                                                        handleProcessSlitScan(raw, isTube1, true);
                                                                    }
                                                                    rollSlitRef.current?.focus();
                                                                    rollSlitRef.current?.select?.();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                height: '38px',
                                                                width: hasNoCore ? '180px' : '145px',
                                                                padding: '2px 10px',
                                                                borderRadius: '8px',
                                                                border: embossErr ? '2px solid #ef4444' : `2px solid ${themeInputBorder}`,
                                                                background: '#ffffff',
                                                                color: isTube1 ? '#9d174d' : '#5b21b6',
                                                                fontSize: '15px',
                                                                fontWeight: 800
                                                            }}
                                                        />
                                                    </div>

                                                    {/* แยกช่อง Roll Slit (ม้วนที่ / ทั้งหมด) ไว้ข้างๆ Lot No. Slit */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 800, color: isTube1 ? '#be185d' : '#6d28d9' }}>
                                                            Roll
                                                        </span>
                                                        <input
                                                            ref={rollSlitRef}
                                                            type="text"
                                                            placeholder=""
                                                            value={rollSlitVal}
                                                            onChange={(e) => setRollSlitVal(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    totalRollSlitRef.current?.focus();
                                                                    totalRollSlitRef.current?.select?.();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                height: '38px',
                                                                width: '50px',
                                                                padding: '2px 4px',
                                                                borderRadius: '8px',
                                                                border: `2px solid ${themeInputBorder}`,
                                                                background: isTube1 ? '#fff1f2' : '#f5f3ff',
                                                                color: isTube1 ? '#9d174d' : '#5b21b6',
                                                                fontSize: '15px',
                                                                fontWeight: 800,
                                                                textAlign: 'center'
                                                            }}
                                                            title="ม้วนที่ได้ (Roll No.)"
                                                        />
                                                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#94a3b8' }}>/</span>

                                                        <input
                                                            ref={totalRollSlitRef}
                                                            type="text"
                                                            placeholder=""
                                                            value={totalRollSlitVal}
                                                            onChange={(e) => setTotalRollSlitVal(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    id1Ref.current?.focus();
                                                                    id1Ref.current?.select?.();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                height: '38px',
                                                                width: '50px',
                                                                padding: '2px 4px',
                                                                borderRadius: '8px',
                                                                border: `2px solid ${themeInputBorder}`,
                                                                background: isTube1 ? '#fff1f2' : '#f5f3ff',
                                                                color: isTube1 ? '#9d174d' : '#5b21b6',
                                                                fontSize: '15px',
                                                                fontWeight: 800,
                                                                textAlign: 'center'
                                                            }}
                                                            title="จำนวนม้วนทั้งหมดในรอบนั้น (Total Rolls)"
                                                        />
                                                    </div>

                                                    {/* Auto Judgement OK / NG (แบบเดิมในกล่องท่อ แต่กดไม่ได้ ป้องกันพนักงานเลือกเอง) */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', userSelect: 'none' }}>
                                                        <div
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '2px 14px',
                                                                borderRadius: '7px',
                                                                fontSize: '13px',
                                                                fontWeight: 900,
                                                                border: (hasTubeMeasurements && judgement === 'OK') ? '2px solid #16a34a' : '1px solid #cbd5e1',
                                                                pointerEvents: 'none',
                                                                cursor: 'default',
                                                                background: (hasTubeMeasurements && judgement === 'OK') ? '#16a34a' : '#ffffff',
                                                                color: (hasTubeMeasurements && judgement === 'OK') ? '#ffffff' : '#94a3b8',
                                                                boxShadow: (hasTubeMeasurements && judgement === 'OK') ? '0 2px 4px rgba(22,163,74,0.3)' : 'none',
                                                                height: '34px'
                                                            }}
                                                            title={hasTubeMeasurements ? "Auto Judgement: OK" : "ยังไม่มีการตรวจวัด"}
                                                        >
                                                            OK
                                                        </div>
                                                        <div
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                padding: '2px 14px',
                                                                borderRadius: '7px',
                                                                fontSize: '13px',
                                                                fontWeight: 900,
                                                                border: (hasTubeMeasurements && judgement === 'NG') ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                                                pointerEvents: 'none',
                                                                cursor: 'default',
                                                                background: (hasTubeMeasurements && judgement === 'NG') ? '#dc2626' : '#ffffff',
                                                                color: (hasTubeMeasurements && judgement === 'NG') ? '#ffffff' : '#94a3b8',
                                                                boxShadow: (hasTubeMeasurements && judgement === 'NG') ? '0 2px 8px rgba(220,38,38,0.5)' : 'none',
                                                                height: '34px'
                                                            }}
                                                            title={hasTubeMeasurements ? "Auto Judgement: NG (ไม่สามารถบันทึกได้)" : "ยังไม่มีการตรวจวัด"}
                                                        >
                                                            NG
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* แถบเตือนสีแดงเมื่อท่อนี้มีผลการตรวจวัดเป็น NG */}
                                            {hasTubeMeasurements && judgement === 'NG' && (
                                                <div style={{
                                                    width: '100%',
                                                    padding: '7px 12px',
                                                    borderRadius: '8px',
                                                    background: '#fef2f2',
                                                    border: '1.5px solid #f87171',
                                                    color: '#b91c1c',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    fontSize: '12.5px',
                                                    fontWeight: 800,
                                                    boxShadow: '0 1px 3px rgba(220, 38, 38, 0.1)'
                                                }}>
                                                    <AlertTriangle size={16} color="#dc2626" />
                                                    <span>ผลตรวจวัด {isTube1 ? 'IPO 1' : 'IPO 2'} เป็น NG </span>
                                                </div>
                                            )}

                                            {/* Bottom Row: ID1, ID2, AVG | T1, T2, T3, T4, AVG */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                width: '100%',
                                                flexWrap: 'wrap'
                                            }}>
                                                {/* ID Group: ID1, ID2, AVG */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {/* ID1 */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '84px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>ID1</span>
                                                        <input
                                                            ref={id1Ref}
                                                            type="text"
                                                            inputMode="decimal"
                                                            title={tubeIdTol ? `ขนาดรูใน ID1 (มาตรฐาน ${tubeIdTol.label})` : undefined}
                                                            value={id1Val}
                                                            onChange={(e) => {
                                                                setId1Val(e.target.value);
                                                                if (id1Err) setFormErrors(prev => ({ ...prev, [id1ErrKey]: undefined }));
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    id2Ref.current?.focus();
                                                                    id2Ref.current?.select?.();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                width: '100%',
                                                                height: '50px',
                                                                textAlign: 'center',
                                                                borderRadius: '8px',
                                                                border: id1Err
                                                                    ? '2px solid #ef4444'
                                                                    : (isId1HasStatus
                                                                        ? (isId1Valid ? '2px solid #22c55e' : '2px solid #ef4444')
                                                                        : `2px solid ${themeInputBorder}`),
                                                                background: isId1HasStatus
                                                                    ? (isId1Valid ? '#dcfce7' : '#fee2e2')
                                                                    : '#ffffff',
                                                                color: isId1HasStatus
                                                                    ? (isId1Valid ? '#15803d' : '#b91c1c')
                                                                    : '#1e293b',
                                                                fontSize: '20px',
                                                                fontWeight: 900
                                                            }}
                                                        />
                                                    </div>

                                                    {/* ID2 */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '84px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>ID2</span>
                                                        <input
                                                            ref={id2Ref}
                                                            type="text"
                                                            inputMode="decimal"
                                                            title={tubeIdTol ? `ขนาดรูใน ID2 (มาตรฐาน ${tubeIdTol.label})` : undefined}
                                                            value={id2Val}
                                                            onChange={(e) => {
                                                                setId2Val(e.target.value);
                                                                if (id2Err) setFormErrors(prev => ({ ...prev, [id2ErrKey]: undefined }));
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    t1Ref.current?.focus();
                                                                    t1Ref.current?.select?.();
                                                                }
                                                            }}
                                                            onFocus={(e) => e.target.select()}
                                                            style={{
                                                                width: '100%',
                                                                height: '50px',
                                                                textAlign: 'center',
                                                                borderRadius: '8px',
                                                                border: id2Err
                                                                    ? '2px solid #ef4444'
                                                                    : (isId2HasStatus
                                                                        ? (isId2Valid ? '2px solid #22c55e' : '2px solid #ef4444')
                                                                        : `2px solid ${themeInputBorder}`),
                                                                background: isId2HasStatus
                                                                    ? (isId2Valid ? '#dcfce7' : '#fee2e2')
                                                                    : '#ffffff',
                                                                color: isId2HasStatus
                                                                    ? (isId2Valid ? '#15803d' : '#b91c1c')
                                                                    : '#1e293b',
                                                                fontSize: '20px',
                                                                fontWeight: 900
                                                            }}
                                                        />
                                                    </div>

                                                    {/* ID AVG - แสดงผลตัวเลขเฉลี่ย ไม่ทำเป็นช่องเหมือนกรอก */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', padding: '0 4px' }}>
                                                        <span
                                                            title={tubeIdTol ? `ค่าเฉลี่ยขนาดรูใน ID AVG (มาตรฐาน ${tubeIdTol.label})` : undefined}
                                                            style={{
                                                                fontSize: '12.5px',
                                                                fontWeight: 900,
                                                                color: isTubeIdValid === false ? '#dc2626' : (isTubeIdValid === true ? '#16a34a' : (isTube1 ? '#ec4899' : '#8b5cf6')),
                                                                marginBottom: '4px'
                                                            }}
                                                        >
                                                            AVG
                                                        </span>
                                                        <div style={{
                                                            height: '50px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '22px',
                                                            fontWeight: 900,
                                                            color: isTubeIdValid === false
                                                                ? '#dc2626'
                                                                : (isTubeIdValid === true ? '#16a34a' : (isTube1 ? '#ec4899' : '#8b5cf6'))
                                                        }}>
                                                            {idAvgVal || '-'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div style={{ width: '1.5px', height: '50px', background: themeCardBorder, margin: '0 8px' }} />

                                                {/* Thickness Group: T1, T2, T3, T4, AVG */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '340px' }}>
                                                    {[
                                                        { label: 'T1', val: t1Val, setter: setT1Val, ref: t1Ref, nextRef: t2Ref, err: t1Err, errKey: t1ErrKey },
                                                        { label: 'T2', val: t2Val, setter: setT2Val, ref: t2Ref, nextRef: t3Ref, err: t2Err, errKey: t2ErrKey },
                                                        { label: 'T3', val: t3Val, setter: setT3Val, ref: t3Ref, nextRef: t4Ref, err: t3Err, errKey: t3ErrKey },
                                                        { label: 'T4', val: t4Val, setter: setT4Val, ref: t4Ref, nextRef: null, err: t4Err, errKey: t4ErrKey },
                                                    ].map((tItem) => {
                                                        const isValid = isTValid(tItem.val);
                                                        const isFilled = tItem.val !== '' && tItem.val !== undefined && tItem.val !== null;
                                                        return (
                                                            <div key={tItem.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: '65px' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '4px' }}>{tItem.label}</span>
                                                                <input
                                                                    ref={tItem.ref}
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    title={tubeThickTol ? `ความหนา ${tItem.label} (มาตรฐาน ${tubeThickTol.label})` : undefined}
                                                                    value={tItem.val}
                                                                    onChange={(e) => {
                                                                        tItem.setter(e.target.value);
                                                                        if (tItem.err) setFormErrors(prev => ({ ...prev, [tItem.errKey]: undefined }));
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') {
                                                                            e.preventDefault();
                                                                            if (tItem.nextRef) {
                                                                                tItem.nextRef.current?.focus();
                                                                                tItem.nextRef.current?.select?.();
                                                                            } else if (isTube1 && isTwinTube) {
                                                                                if (!hasNoCore && lotTapInputRef2.current) {
                                                                                    lotTapInputRef2.current.focus();
                                                                                    lotTapInputRef2.current.select?.();
                                                                                } else if (lotEmbossInputRef2.current) {
                                                                                    lotEmbossInputRef2.current.focus();
                                                                                    lotEmbossInputRef2.current.select?.();
                                                                                } else {
                                                                                    id1_2_Ref.current?.focus();
                                                                                    id1_2_Ref.current?.select?.();
                                                                                }
                                                                            } else {
                                                                                speedRef.current?.focus();
                                                                                speedRef.current?.select?.();
                                                                            }
                                                                        }
                                                                    }}
                                                                    onFocus={(e) => e.target.select()}
                                                                    style={{
                                                                        width: '100%',
                                                                        height: '50px',
                                                                        textAlign: 'center',
                                                                        borderRadius: '8px',
                                                                        border: tItem.err
                                                                            ? '2px solid #ef4444'
                                                                            : (isFilled
                                                                                ? (isValid ? '2px solid #22c55e' : '2px solid #ef4444')
                                                                                : `2px solid ${themeInputBorder}`),
                                                                        background: isFilled
                                                                            ? (isValid ? '#dcfce7' : '#fee2e2')
                                                                            : '#ffffff',
                                                                        color: isFilled
                                                                            ? (isValid ? '#15803d' : '#b91c1c')
                                                                            : '#1e293b',
                                                                        fontSize: '20px',
                                                                        fontWeight: 900
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })}

                                                    {/* T AVG - แสดงผลตัวเลขเฉลี่ย ไม่ทำเป็นช่องเหมือนกรอก */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '70px', padding: '0 4px' }}>
                                                        <span
                                                            title={tubeThickTol ? `ค่าเฉลี่ยความหนา T AVG (มาตรฐาน ${tubeThickTol.label})` : undefined}
                                                            style={{
                                                                fontSize: '12.5px',
                                                                fontWeight: 900,
                                                                color: tAvgVal ? (isTValid(tAvgVal) ? '#16a34a' : '#dc2626') : themeColor,
                                                                marginBottom: '4px'
                                                            }}
                                                        >
                                                            AVG
                                                        </span>
                                                        <div style={{
                                                            height: '50px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '22px',
                                                            fontWeight: 900,
                                                            color: tAvgVal
                                                                ? (isTValid(tAvgVal) ? '#15803d' : '#b91c1c')
                                                                : themeColor
                                                        }}>
                                                            {tAvgVal || '-'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                };

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
                                        {/* การ์ดตรวจวัดท่อ: ท่อคู่จะแสดงทั้ง 2 ท่อต่อกัน (Stacked) โดยไม่ต้องกดแท็บสลับ */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {renderTubeCard(0, !isTwinTube)}
                                            {isTwinTube && renderTubeCard(1, false)}
                                        </div>

                                        {/* พารามิเตอร์เครื่องจักร (Machine Parameters) - ช่องกรอกขนาดใหญ่ สบายตา พิมพ์สะดวก */}
                                        <div style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                            paddingTop: '10px',
                                            borderTop: '1px solid #f1f5f9'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '13.5px', fontWeight: 900, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ width: '4px', height: '14px', background: '#0284c7', borderRadius: '2px' }}></span>
                                                    พารามิเตอร์เครื่องจักร
                                                </span>
                                            </div>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                                                gap: '10px',
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                alignItems: 'center'
                                            }}>
                                                {/* 1. Speed */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.speed ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Speed (m/m)">
                                                        Speed (m/m) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={speedRef}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#1e3a8a',
                                                            background: formErrors.speed ? '#fef2f2' : '#eff6ff',
                                                            border: formErrors.speed ? '2px solid #ef4444' : '1.5px solid #2563eb',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={speed}
                                                        onChange={(e) => {
                                                            setSpeed(e.target.value);
                                                            if (formErrors.speed) setFormErrors(prev => ({ ...prev, speed: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                temp1Ref.current?.focus();
                                                                temp1Ref.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>

                                                {/* 2. Temp.1 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.temp1 ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Temp.1 (°C)">
                                                        Temp.1 (°C) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={temp1Ref}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#0f172a',
                                                            background: formErrors.temp1 ? '#fef2f2' : '#f8fafc',
                                                            border: formErrors.temp1 ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={temp1}
                                                        onChange={(e) => {
                                                            setTemp1(e.target.value);
                                                            if (formErrors.temp1) setFormErrors(prev => ({ ...prev, temp1: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                temp2Ref.current?.focus();
                                                                temp2Ref.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>

                                                {/* 3. Temp.2 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.temp2 ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Temp.2 (°C)">
                                                        Temp.2 (°C) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={temp2Ref}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#0f172a',
                                                            background: formErrors.temp2 ? '#fef2f2' : '#f8fafc',
                                                            border: formErrors.temp2 ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={temp2}
                                                        onChange={(e) => {
                                                            setTemp2(e.target.value);
                                                            if (formErrors.temp2) setFormErrors(prev => ({ ...prev, temp2: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                temp3Ref.current?.focus();
                                                                temp3Ref.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>

                                                {/* 4. Temp.3 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.temp3 ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Temp.3 (°C)">
                                                        Temp.3 (°C) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={temp3Ref}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#0f172a',
                                                            background: formErrors.temp3 ? '#fef2f2' : '#f8fafc',
                                                            border: formErrors.temp3 ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={temp3}
                                                        onChange={(e) => {
                                                            setTemp3(e.target.value);
                                                            if (formErrors.temp3) setFormErrors(prev => ({ ...prev, temp3: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                temp4Ref.current?.focus();
                                                                temp4Ref.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>

                                                {/* 5. Temp.4 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.temp4 ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Temp.4 (°C)">
                                                        Temp.4 (°C) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={temp4Ref}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#0f172a',
                                                            background: formErrors.temp4 ? '#fef2f2' : '#f8fafc',
                                                            border: formErrors.temp4 ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={temp4}
                                                        onChange={(e) => {
                                                            setTemp4(e.target.value);
                                                            if (formErrors.temp4) setFormErrors(prev => ({ ...prev, temp4: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                tempPipeRef.current?.focus();
                                                                tempPipeRef.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>

                                                {/* 6. Temp.ท่อคู่ (บังคับกรอกทุกกรณีเสมอ) */}
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', minWidth: 0 }}>
                                                    <div style={{
                                                        fontSize: '12px', fontWeight: 800,
                                                        color: formErrors.tempPipe ? '#b91c1c' : '#1d4ed8',
                                                        textAlign: 'center', marginBottom: '4px', whiteSpace: 'nowrap',
                                                        overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'
                                                    }} title="Temp.ท่อคู่ (°C)">
                                                        Temp.ท่อคู่ (°C) <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                                    </div>
                                                    <input
                                                        ref={tempPipeRef}
                                                        type="text"
                                                        inputMode="decimal"
                                                        className="form-field-input"
                                                        style={{
                                                            textAlign: 'center', padding: '2px',
                                                            width: '100%', height: '50px',
                                                            fontSize: '20px', fontWeight: 900, color: '#0f172a',
                                                            background: formErrors.tempPipe ? '#fef2f2' : '#f8fafc',
                                                            border: formErrors.tempPipe ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                                                            borderRadius: '8px', boxSizing: 'border-box'
                                                        }}
                                                        value={tempPipe}
                                                        onChange={(e) => {
                                                            setTempPipe(e.target.value);
                                                            if (formErrors.tempPipe) setFormErrors(prev => ({ ...prev, tempPipe: undefined }));
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                startTimeRef.current?.focus();
                                                                startTimeRef.current?.select?.();
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* ══ คอลัมน์ขวา: 3. เวลาการผลิต, ผลผลิต & สาเหตุงานเสีย & ปุ่มบันทึก ══ */}
                <div className="job-form-col-right">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span style={{
                            width: '26px', height: '26px', borderRadius: '50%',
                            background: '#15803d', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: 900, flexShrink: 0
                        }}>3</span>
                        <span style={{ fontSize: '15px', fontWeight: 900, color: '#1e293b' }}>
                            เวลาการผลิต, ผลผลิต & สาเหตุงานเสีย
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                        {/* 1. เวลาการผลิต - บังคับกรอก */}
                        <div style={{
                            background: (formErrors.startTime || formErrors.endTime) ? '#fff5f5' : '#f8fafc',
                            border: (formErrors.startTime || formErrors.endTime) ? '2px solid #ef4444' : '1px solid #e2e8f0',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', fontWeight: 900, color: (formErrors.startTime || formErrors.endTime) ? '#b91c1c' : '#1e3a8a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    เวลาการผลิต <span style={{ color: '#ef4444', fontWeight: 900 }}>*</span>
                                </span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                <Time24Picker
                                    inputRef={startTimeRef}
                                    label="เริ่ม *"
                                    value={startTime}
                                    hasError={Boolean(formErrors.startTime)}
                                    onChange={(val) => {
                                        setStartTime(val);
                                        if (formErrors.startTime) setFormErrors(prev => ({ ...prev, startTime: undefined }));
                                    }}
                                    onEnterNext={() => {
                                        endTimeRef.current?.focus();
                                        endTimeRef.current?.select?.();
                                    }}
                                    placeholder="HH:MM"
                                />
                                <Time24Picker
                                    inputRef={endTimeRef}
                                    label="สิ้นสุด *"
                                    value={endTime}
                                    hasError={Boolean(formErrors.endTime)}
                                    onChange={(val) => {
                                        setEndTime(val);
                                        if (formErrors.endTime) setFormErrors(prev => ({ ...prev, endTime: undefined }));
                                    }}
                                    onEnterNext={() => {
                                        totalMetersRef.current?.focus();
                                        totalMetersRef.current?.select?.();
                                    }}
                                    placeholder="HH:MM"
                                    align="right"
                                />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px', minHeight: '20px' }}>
                                        <label className="form-field-label" style={{ marginBottom: 0, fontSize: '12px', fontWeight: 800, color: '#475569' }}>ใช้เวลา</label>
                                    </div>
                                    <div style={{
                                        height: '36px',
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '7px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 900,
                                        fontSize: '14.5px',
                                        color: '#0f172a'
                                    }}>
                                        {totalTime || '-'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. ยอดผลิตต่องาน / ต่อรอบการผลิต (PRODUCT) - บังคับกรอก ตัวเลขใหญ่มาก 22px */}
                        <div style={{
                            background: formErrors.totalMeters ? '#fff5f5' : '#eff6ff',
                            border: formErrors.totalMeters ? '2px solid #ef4444' : '1px solid #bfdbfe',
                            borderRadius: '8px',
                            padding: '6px 10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <label className="form-field-label" style={{ color: '#1e40af', fontWeight: 900, margin: 0, fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    จำนวนม้วนที่ผลิตได้ <span style={{ color: '#ef4444', fontWeight: 900, fontSize: '15px' }}>*</span>
                                </label>
                                {Number(totalMeters) > 0 && (
                                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: '5px', border: '1px solid #bfdbfe' }}>
                                        = {Number(totalMeters).toLocaleString()} ม. ({productionRows} ม้วน × 200 ม.)
                                    </span>
                                )}
                            </div>
                            {/* กรอกจำนวนม้วน คำนวณยอดเมตรอัตโนมัติ */}
                            <div style={{ position: 'relative' }}>
                                <input
                                    ref={totalMetersRef}
                                    type="text"
                                    inputMode="numeric"
                                    className="form-field-input"
                                    style={{
                                        textAlign: 'center',
                                        fontWeight: 900,
                                        fontSize: '22px',
                                        color: '#1e40af',
                                        height: '44px',
                                        paddingRight: '46px',
                                        width: '100%',
                                        background: formErrors.totalMeters ? '#fef2f2' : '#ffffff',
                                        border: formErrors.totalMeters ? '2.5px solid #ef4444' : '2.5px solid #2563eb',
                                        borderRadius: '8px'
                                    }}
                                    value={productionRows}
                                    onChange={(e) => handleProductionRowsChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            // หากมียอดของเสียระบุไว้ ให้วิ่งไปตรวจของเสียต่อ
                                            if (Number(totalDefectMeters) > 0) {
                                                const firstDefect = defectRefs.current['setting'];
                                                if (firstDefect) {
                                                    firstDefect.focus();
                                                    firstDefect.select?.();
                                                    return;
                                                }
                                            }
                                            // กรณีทั่วไป (ไม่มียอดของเสีย) ให้ข้ามไปที่ปุ่ม "บันทึก" ทันที เพื่อให้พนักงานกด Enter บันทึกได้เลย
                                            if (saveButtonRef.current) {
                                                saveButtonRef.current.focus();
                                            } else if (kpiNoteRef.current) {
                                                kpiNoteRef.current.focus();
                                                kpiNoteRef.current.select?.();
                                            }
                                        }
                                    }}
                                    onFocus={(e) => e.target.select()}
                                    placeholder="ระบุจำนวนม้วน เช่น 8"
                                    title="กรอกจำนวนม้วน ระบบจะคำนวณคูณ 200 เมตรให้อัตโนมัติ"
                                />
                                <span className="unit-tag-badge" style={{ right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', fontWeight: 900, color: '#2563eb' }}>ม้วน</span>
                            </div>
                        </div>

                        {/* 3. สาเหตุงานเสีย & รวมของเสีย (ไม่บังคับ - ถ้ามี) */}
                        <div style={{
                            background: '#fff5f5',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            {/* Header row: title + total badge */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    สาเหตุงานเสีย
                                </span>
                                <span style={{
                                    background: Number(totalDefectMeters) > 0 ? '#fee2e2' : '#f8fafc',
                                    color: Number(totalDefectMeters) > 0 ? '#b91c1c' : '#64748b',
                                    border: Number(totalDefectMeters) > 0 ? '1.5px solid #fca5a5' : '1px solid #e2e8f0',
                                    padding: '1px 8px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 800
                                }}>
                                    รวมเสีย: {totalDefectMeters} m.
                                </span>
                            </div>

                            {/* ── P1: ของเสียหลัก (5 รายการแถวเดียว ไม่ตีกรอบซ้อน) ── */}
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: '#dc2626', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span style={{ width: '3px', height: '9px', background: '#dc2626', borderRadius: '1px' }}></span>
                                    Prod.1
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                                    {[
                                        { key: 'setting', label: 'ตั้งเครื่อง', value: defectSetting, setter: setDefectSetting },
                                        { key: 'jointIpo', label: 'ต่อ IPO', value: defectJointIpo, setter: setDefectJointIpo },
                                        { key: 'splitSeam', label: 'ตะเข็บแตก', value: defectSplitSeam, setter: setDefectSplitSeam },
                                        { key: 'dimNg', label: 'ขนาด NG', value: defectDimNg, setter: setDefectDimNg },
                                        { key: 'foamDetached', label: 'โฟมไม่ติด', value: defectFoamDetached, setter: setDefectFoamDetached }
                                    ].map((df) => {
                                        const hasVal = Number(df.value) > 0;
                                        return (
                                            <div key={df.key} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: hasVal ? 900 : 700,
                                                    color: hasVal ? '#dc2626' : '#475569',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    textAlign: 'center'
                                                }}>{df.label}</span>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        ref={(el) => { if (el) defectRefs.current[df.key] = el; }}
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={df.value}
                                                        onChange={(e) => df.setter(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                focusNextDefect(df.key);
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                        style={{
                                                            width: '100%',
                                                            height: '28px',
                                                            textAlign: 'center',
                                                            fontSize: '13px',
                                                            fontWeight: 800,
                                                            borderRadius: '5px',
                                                            border: hasVal ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                                                            background: hasVal ? '#fef2f2' : '#ffffff',
                                                            color: hasVal ? '#dc2626' : '#1e293b',
                                                            padding: '0 18px 0 2px'
                                                        }}
                                                    />
                                                    <span style={{
                                                        position: 'absolute',
                                                        right: '3px',
                                                        top: '6px',
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        color: hasVal ? '#dc2626' : '#94a3b8',
                                                        pointerEvents: 'none'
                                                    }}>m.</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── P2: ของเสียรอง (4 รายการแถวเดียว ธีมสีแดงเดียวกัน ไม่ตีกรอบซ้อน) ── */}
                            <div style={{ marginTop: '1px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: '#dc2626', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span style={{ width: '3px', height: '9px', background: '#f87171', borderRadius: '1px' }}></span>
                                    Prod.2
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                                    {[
                                        { key: 'jointMark', label: 'รอยมาร์ค', value: defectJointMark, setter: setDefectJointMark },
                                        { key: 'thickNg', label: 'หนา NG', value: defectThickNg, setter: setDefectThickNg },
                                        { key: 'filmBlemish', label: 'ฟิล์มด่าง', value: defectFilmBlemish, setter: setDefectFilmBlemish },
                                        { key: 'otherNg', label: 'อื่นๆ', value: defectOtherNg, setter: setDefectOtherNg }
                                    ].map((df) => {
                                        const hasVal = Number(df.value) > 0;
                                        return (
                                            <div key={df.key} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                <span style={{
                                                    fontSize: '11px',
                                                    fontWeight: hasVal ? 900 : 700,
                                                    color: hasVal ? '#dc2626' : '#475569',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    textAlign: 'center'
                                                }}>{df.label}</span>
                                                <div style={{ position: 'relative' }}>
                                                    <input
                                                        ref={(el) => { if (el) defectRefs.current[df.key] = el; }}
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={df.value}
                                                        onChange={(e) => df.setter(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                focusNextDefect(df.key);
                                                            }
                                                        }}
                                                        onFocus={(e) => e.target.select()}
                                                        placeholder=""
                                                        style={{
                                                            width: '100%',
                                                            height: '28px',
                                                            textAlign: 'center',
                                                            fontSize: '13px',
                                                            fontWeight: 800,
                                                            borderRadius: '5px',
                                                            border: hasVal ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                                                            background: hasVal ? '#fef2f2' : '#ffffff',
                                                            color: hasVal ? '#dc2626' : '#1e293b',
                                                            padding: '0 18px 0 2px'
                                                        }}
                                                    />
                                                    <span style={{
                                                        position: 'absolute',
                                                        right: '3px',
                                                        top: '6px',
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        color: hasVal ? '#dc2626' : '#94a3b8',
                                                        pointerEvents: 'none'
                                                    }}>m.</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* 4. เวลาเสียระหว่างการผลิต (Lost Time / Downtime) - รองรับหลายช่วงเวลา (เดินงานยาว) */}
                        <div style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <Clock size={15} />
                                    เวลาเสียระหว่างการผลิต (ถ้ามี)
                                </span>
                                {lostTimeMinutes > 0 && (
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '5px', border: '1px solid #fde68a' }}>
                                        เสียเวลารวม {lostTimeDurationText} ({(lostTimeMinutes / 60).toFixed(2)} ชม.)
                                    </span>
                                )}
                            </div>

                            {/* วนลูปแสดงแต่ละช่วงเวลาที่หยุดผลิต */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {lostTimeList.map((item, idx) => {
                                    const rowDiff = getRowDiffMinutes(item.start, item.end);
                                    const rowDurationText = formatRowDurationText(rowDiff);
                                    const isFirst = idx === 0;
                                    const isLast = idx === lostTimeList.length - 1;

                                    return (
                                        <div
                                            key={item.id}
                                            style={{
                                                background: lostTimeList.length > 1 ? '#ffffff' : 'transparent',
                                                border: lostTimeList.length > 1 ? '1px solid #fde68a' : 'none',
                                                borderRadius: '7px',
                                                padding: lostTimeList.length > 1 ? '7px 9px' : '0',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '4px'
                                            }}
                                        >
                                            {lostTimeList.length > 1 && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        ช่วงที่ {idx + 1}
                                                        {rowDiff > 0 && (
                                                            <span style={{ fontSize: '10.5px', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                                                {rowDurationText}
                                                            </span>
                                                        )}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLostTimeRow(item.id)}
                                                        style={{
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            color: '#b91c1c',
                                                            background: '#fee2e2',
                                                            border: '1px solid #fca5a5',
                                                            borderRadius: '4px',
                                                            padding: '1px 6px',
                                                            cursor: 'pointer'
                                                        }}
                                                        title={`ลบช่วงที่ ${idx + 1}`}
                                                    >
                                                        ✕ ลบช่วงนี้
                                                    </button>
                                                </div>
                                            )}

                                            {/* แถวเวลาหยุด: เวลาเริ่มหยุด - เวลาสิ้นสุดที่หยุด - เวลาที่เสีย */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                                <Time24Picker
                                                    inputRef={isFirst ? lostTimeStartRef : undefined}
                                                    label={isFirst || lostTimeList.length === 1 ? "เริ่มหยุด" : `เริ่มหยุด (${idx + 1})`}
                                                    value={item.start}
                                                    onChange={(val) => updateLostTimeRow(item.id, 'start', val)}
                                                    onEnterNext={() => {
                                                        if (isFirst) {
                                                            lostTimeEndRef.current?.focus();
                                                            lostTimeEndRef.current?.select?.();
                                                        }
                                                    }}
                                                    placeholder="HH:MM"
                                                />
                                                <Time24Picker
                                                    inputRef={isFirst ? lostTimeEndRef : undefined}
                                                    label={isFirst || lostTimeList.length === 1 ? "สิ้นสุดที่หยุด" : `สิ้นสุด (${idx + 1})`}
                                                    value={item.end}
                                                    onChange={(val) => updateLostTimeRow(item.id, 'end', val)}
                                                    onEnterNext={() => {
                                                        if (isFirst && lostTimeReasonRef.current) {
                                                            lostTimeReasonRef.current.focus();
                                                            lostTimeReasonRef.current.select?.();
                                                        }
                                                    }}
                                                    placeholder="HH:MM"
                                                    align="right"
                                                />
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px', minHeight: '20px' }}>
                                                        <label className="form-field-label" style={{ marginBottom: 0, fontSize: '12px', color: '#b45309', fontWeight: 800 }}>เวลาที่เสีย</label>
                                                    </div>
                                                    <div style={{
                                                        height: '36px',
                                                        background: '#ffffff',
                                                        border: '1.5px solid #cbd5e1',
                                                        borderRadius: '7px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 800,
                                                        fontSize: '13px',
                                                        color: rowDiff > 0 ? '#b45309' : '#64748b'
                                                    }}>
                                                        {rowDurationText || '-'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ระบุสาเหตุที่หยุดผลิต (Defects Dropdown & Input) */}
                                            <div style={{ marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <label className="form-field-label" style={{ marginBottom: 0, fontSize: '12px', color: '#78350f', fontWeight: 800 }}>
                                                        สาเหตุ {lostTimeList.length > 1 ? `ช่วงที่ ${idx + 1}` : ''} (Defects / เวลาเสีย)
                                                    </label>
                                                    {item.reason && (
                                                        <button
                                                            type="button"
                                                            onClick={() => updateLostTimeRow(item.id, 'reason', '')}
                                                            style={{
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                color: '#b91c1c',
                                                                background: '#fee2e2',
                                                                border: '1px solid #fca5a5',
                                                                borderRadius: '4px',
                                                                padding: '1px 7px',
                                                                cursor: 'pointer'
                                                            }}
                                                            title="ล้างสาเหตุ"
                                                        >
                                                            ✕ ล้าง
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Dropdown สาเหตุงานเสีย (Defects) */}
                                                <select
                                                    ref={isFirst ? lostTimeReasonRef : undefined}
                                                    className="form-field-input"
                                                    value={item.reason || ''}
                                                    onChange={(e) => updateLostTimeRow(item.id, 'reason', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            kpiNoteRef.current?.focus();
                                                            kpiNoteRef.current?.select?.();
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        height: '34px',
                                                        fontSize: '13px',
                                                        fontWeight: 700,
                                                        padding: '2px 8px',
                                                        background: '#ffffff',
                                                        borderColor: '#cbd5e1',
                                                        color: '#1e293b',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="">-- เลือกสาเหตุงานเสีย (Defects) --</option>
                                                    {item.reason && ![
                                                        'ตั้งเครื่อง', 'ต่อ IPO', 'ตะเข็บแตก', 'ขนาด NG', 'โฟมไม่ติด',
                                                        'รอยมาร์ค', 'หนา NG', 'ฟิล์มด่าง', 'อื่นๆ',
                                                        'ความสะอาด 5 ส',
                                                        'Heater 1 ขาด', 'Heater 2 ขาด', 'Heater 3 ขาด', 'Heater 4 ขาด', 'Heater 5 ขาด',
                                                        'รอโฟมจากเครื่อง Slit', 'หยุดรอซ่อมเครื่องจักร', 'ไปช่วย light cover'
                                                    ].includes(item.reason) && (
                                                            <option value={item.reason}>{item.reason}</option>
                                                        )}
                                                    <optgroup label="สาเหตุงานเสียหลัก (Prod.1)">
                                                        <option value="ตั้งเครื่อง">ตั้งเครื่อง</option>
                                                        <option value="ต่อ IPO">ต่อ IPO</option>
                                                        <option value="ตะเข็บแตก">ตะเข็บแตก</option>
                                                        <option value="ขนาด NG">ขนาด NG</option>
                                                        <option value="โฟมไม่ติด">โฟมไม่ติด</option>
                                                    </optgroup>
                                                    <optgroup label="สาเหตุงานเสียรอง (Prod.2)">
                                                        <option value="รอยมาร์ค">รอยมาร์ค</option>
                                                        <option value="หนา NG">หนา NG</option>
                                                        <option value="ฟิล์มด่าง">ฟิล์มด่าง</option>
                                                        <option value="อื่นๆ">อื่นๆ</option>
                                                    </optgroup>
                                                    <optgroup label="สาเหตุหยุดเครื่อง (Downtime)">
                                                        <option value="ความสะอาด 5 ส">ความสะอาด 5 ส   </option>
                                                        <option value="Heater 1 ขาด">Heater 1 ขาด</option>
                                                        <option value="Heater 2 ขาด">Heater 2 ขาด</option>
                                                        <option value="Heater 3 ขาด">Heater 3 ขาด</option>
                                                        <option value="Heater 4 ขาด">Heater 4 ขาด</option>
                                                        <option value="Heater 5 ขาด">Heater 5 ขาด</option>
                                                        <option value="รอโฟมจากเครื่อง Slit">รอโฟมจากเครื่อง Slit</option>
                                                        <option value="หยุดรอซ่อมเครื่องจักร">หยุดรอซ่อมเครื่องจักร</option>
                                                        <option value="ไปช่วย light cover">ไปช่วย light cover</option>
                                                    </optgroup>
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ปุ่มเพิ่มช่วงเวลาหยุด (สำหรับกรณีเดินงานยาว แล้วมีหยุดหลายช่วง) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', paddingTop: '4px', borderTop: '1px dashed #fde68a' }}>
                                <button
                                    type="button"
                                    onClick={addLostTimeRow}
                                    style={{
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        color: '#b45309',
                                        background: '#fef3c7',
                                        border: '1px dashed #f59e0b',
                                        borderRadius: '6px',
                                        padding: '4px 12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={(e) => { e.currentTarget.style.background = '#fde68a'; }}
                                    onMouseOut={(e) => { e.currentTarget.style.background = '#fef3c7'; }}
                                >
                                    <Plus size={14} />
                                    <span>เพิ่มช่วงเวลาหยุดอีก (เดินงานยาว / หยุดหลายช่วง)</span>
                                </button>
                                {lostTimeList.length > 1 && (
                                    <span style={{ fontSize: '11px', color: '#92400e', fontWeight: 700 }}>
                                        ทั้งหมด {lostTimeList.length} ช่วงเวลา
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* 5. หมายเหตุปกติ (เช่น เริ่มงานช้า, ประชุม) - ไม่บังคับ */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                <label className="form-field-label" style={{ fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: 0 }}>
                                    หมายเหตุปกติ
                                </label>
                                {parseDowntimeMinutesFromNote(kpiNote) > 0 && (
                                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                        {parseDowntimeMinutesFromNote(kpiNote)} นาที
                                    </span>
                                )}
                            </div>
                            <textarea
                                ref={kpiNoteRef}
                                className="form-field-input"
                                rows={2}
                                style={{
                                    height: '36px',
                                    minHeight: '34px',
                                    fontSize: '13px',
                                    padding: '5px 10px',
                                    lineHeight: 1.35,
                                    resize: 'none',
                                    boxSizing: 'border-box'
                                }}
                                value={kpiNote}
                                onChange={(e) => setKpiNote(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        saveButtonRef.current?.focus();
                                    }
                                }}
                                placeholder="ระบุหมายเหตุปกติ เช่น เริ่มงานช้า 08:00-08:30 ประชุม (ถ้ามี)"
                            />
                        </div>
                    </div>

                    {/* ป้ายเตือน Officer Mode เมื่อ Job ถูกปิดแล้ว */}
                    {isCurrentJobClosed && isOfficer && (
                        <div className="w-full mb-1.5 px-3 py-2 bg-indigo-50/90 border border-indigo-200 rounded-lg text-indigo-950 text-xs font-bold flex items-center justify-between animate-fadeIn shadow-2xs">

                            {!editingJob && (
                                <span className="text-[12px] text-indigo-700 font-normal">
                                    (คลิกเลือกรอบด้านล่างเพื่อแก้ไข)
                                </span>
                            )}
                        </div>
                    )}

                    {/* 5. ปุ่มบันทึกรอบ (Compact) & ปิด Job (Primary สีเขียว ขยายใหญ่เด่นชัดเจน) */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '8px' }}>
                        {editingJob && (
                            <button
                                type="button"
                                onClick={() => {
                                    handleResetForm();
                                    toast.info('ยกเลิกการแก้ไขแล้ว');
                                }}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#64748b',
                                    fontSize: '14px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    height: '46px'
                                }}
                                className="hover:bg-slate-50 active:scale-95"
                            >
                                ยกเลิก
                            </button>
                        )}
                        {/* ปุ่มบันทึกรอบ (ขนาดกะทัดรัด เมื่ออยู่ในโหมดปกติ / หรือขยายใหญ่เมื่อกำลังแก้ไขรอบเดิม) */}
                        <button
                            ref={saveButtonRef}
                            type="button"
                            disabled={isSubmitting || (isCurrentJobClosed && (!isOfficer || !editingJob))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.currentTarget.click();
                                }
                            }}
                            onClick={() => {
                                if (isSubmitting) return;
                                if (isCurrentJobClosed && !isOfficer) {
                                    toast.warning(`Job ${jobNo} ปิดแล้ว (CLOSED) — Operator ไม่สามารถแก้ไขได้`);
                                    return;
                                }
                                if (isCurrentJobClosed && isOfficer && !editingJob) {
                                    toast.info('กรุณาคลิกเลือกม้วน/รอบที่ต้องการแก้ไขในรายการด้านล่าง');
                                    return;
                                }
                                if (isOverallNg) {
                                    toast.error('❌ ไม่สามารถบันทึกได้: ผลการตรวจวัดขนาดท่อเป็น NG (ชิ้นงานไม่ได้มาตรฐาน)');
                                    return;
                                }
                                handleSave(false);
                            }}
                            className={
                                editingJob || isCurrentJobClosed
                                    ? `btn-save-job-hero ${(isSubmitting || (isCurrentJobClosed && (!isOfficer || !editingJob))) ? 'cursor-not-allowed opacity-60' : 'hover:opacity-95 active:scale-95'}`
                                    : `btn-save-roll-compact ${(isSubmitting || isOverallNg) ? 'cursor-not-allowed opacity-80' : 'active:scale-95'}`
                            }
                            style={{
                                flex: (editingJob || isCurrentJobClosed) ? 1 : 'none',
                                padding: (editingJob || isCurrentJobClosed) ? '6px 16px' : '6px 14px',
                                height: '46px',
                                fontSize: (editingJob || isCurrentJobClosed) ? '16px' : '13.5px',
                                fontWeight: 800,
                                background: isSubmitting
                                    ? '#64748b'
                                    : isOverallNg
                                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                        : isCurrentJobClosed
                                            ? (isOfficer && editingJob
                                                ? 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                                                : '#94a3b8')
                                            : editingJob
                                                ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)'
                                                : '#ffffff',
                                color: (isOverallNg || editingJob || isCurrentJobClosed || isSubmitting) ? '#ffffff' : '#047857',
                                border: (isOverallNg || editingJob || isCurrentJobClosed || isSubmitting) ? 'none' : '1.5px solid #059669',
                                borderRadius: '8px',
                                boxShadow: isSubmitting
                                    ? 'none'
                                    : isOverallNg
                                        ? '0 2px 8px rgba(220, 38, 38, 0.4)'
                                        : isCurrentJobClosed
                                            ? (isOfficer && editingJob ? '0 2px 6px rgba(79, 70, 229, 0.35)' : 'none')
                                            : editingJob
                                                ? '0 2px 6px rgba(234, 88, 12, 0.35)'
                                                : '0 1px 3px rgba(0, 0, 0, 0.05)',
                                cursor: (isSubmitting || (isCurrentJobClosed && (!isOfficer || !editingJob))) ? 'not-allowed' : 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                            title={
                                isSubmitting
                                    ? "กำลังบันทึกข้อมูล..."
                                    : isOverallNg
                                        ? " ผลตรวจวัดขนาดท่อเป็น NG (ระบบไม่อนุญาตให้บันทึก)"
                                        : isCurrentJobClosed
                                            ? (isOfficer && editingJob ? "บันทึกการแก้ไขในฐานะ Officer" : "ปิด Job แล้ว")
                                            : editingJob
                                                ? "บันทึกการแก้ไขข้อมูลรอบนี้"
                                                : "บันทึกยอดรอบนี้และคงค่า Job ในหน้าจอไว้เพื่อผลิตต่อ"
                            }
                        >
                            {isSubmitting ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>กำลังบันทึก...</span>
                                </span>
                            ) : isOverallNg ? (
                                <AlertTriangle size={16} color="#ffffff" />
                            ) : isCurrentJobClosed ? (
                                isOfficer && editingJob ? <ShieldCheck size={15} /> : <Lock size={15} />
                            ) : editingJob ? (
                                <Pencil size={15} />
                            ) : (
                                <Save size={15} color="#047857" />
                            )}
                            {!isSubmitting && (
                                <span>
                                    {isOverallNg
                                        ? 'ผลตรวจเป็น NG'
                                        : isCurrentJobClosed
                                            ? (isOfficer && editingJob
                                                ? `บันทึกการแก้ไขรอบที่ ${displayRollNo} (Officer)`
                                                : 'ปิด Job แล้ว')
                                            : editingJob
                                                ? `บันทึกการแก้ไขรอบที่ ${displayRollNo}`
                                                : `บันทึกรอบที่ ${displayRollNo} (${Number(totalMeters || 0).toLocaleString()} m.)`}
                                </span>
                            )}
                        </button>

                        {/* ปุ่มปิด Job (ขนาดใหญ่ สีเขียว Solid - Primary เด่นชัดเจน) */}
                        {!editingJob && !isCurrentJobClosed && (
                            <button
                                type="button"
                                disabled={isSubmitting || isOverallNg}
                                onClick={() => {
                                    if (isOverallNg) {
                                        toast.error(' ไม่สามารถปิด Job และบันทึกยอดได้: ผลการตรวจวัดขนาดท่อเป็น NG');
                                        return;
                                    }
                                    handleRequestCloseJob();
                                }}
                                className={`btn-close-job-hero ${(isSubmitting || isOverallNg) ? 'cursor-not-allowed opacity-60' : 'hover:opacity-95 active:scale-95'}`}
                                style={{
                                    flex: 1,
                                    height: '46px',
                                    fontSize: '16px',
                                    fontWeight: 900,
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: (isSubmitting || isOverallNg) ? '#94a3b8' : 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                                    color: '#ffffff',
                                    boxShadow: (isSubmitting || isOverallNg) ? 'none' : '0 2px 6px rgba(22, 163, 74, 0.3)',
                                    cursor: (isSubmitting || isOverallNg) ? 'not-allowed' : 'pointer'
                                }}
                                title={isOverallNg ? " ผลตรวจเป็น NG (ไม่สามารถปิด Job และบันทึกได้)" : (Number(totalMeters) > 0 ? "บันทึกยอดรอบนี้และปิด Job พร้อมเริ่ม Job ถัดไป" : "ยืนยันปิด Job นี้และล้างหน้าจอเพื่อเริ่ม Job ถัดไป")}
                            >
                                <CheckCircle2 size={18} color="#ffffff" />
                                <span>{isOverallNg ? 'ติดผลตรวจ NG' : (Number(totalMeters) > 0 ? 'บันทึก & ปิด Job' : 'ปิด Job')}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>



            {/* ── Modal Dialog: รายการที่บันทึกแล้ว (ดีไซน์สไตล์ Slit 100%) ── */}
            {showRecentJobsModal && (
                <div className="modal-backdrop animate-fadeIn" onClick={() => setShowRecentJobsModal(false)}>
                    <div
                        className="recent-jobs-modal-card"
                        style={{
                            background: 'white',
                            borderRadius: '16px',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25), 0 10px 10px -5px rgba(0,0,0,0.1)',
                            border: '1px solid #cbd5e1',
                            width: '98vw',
                            maxWidth: '98vw',
                            maxHeight: '94vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '12px 18px',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '8px',
                                    background: '#eff6ff', border: '1px solid #bfdbfe',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#1d4ed8'
                                }}>
                                    <FileSpreadsheet size={18} />
                                </div>
                                <div>
                                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        รายการที่บันทึกแล้ว
                                        <span style={{
                                            background: '#dbeafe', color: '#1d4ed8',
                                            padding: '2px 8px', borderRadius: '12px',
                                            fontSize: '11px', fontWeight: 800
                                        }}>
                                            {uniqueJobCount} Job ({filteredRolls.length} รอบ)
                                        </span>
                                    </h3>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        แสดงข้อมูลการผลิตและสเปคทั้งหมด
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    className="btn-icon-close"
                                    onClick={() => setShowRecentJobsModal(false)}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: 'white',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#64748b', fontSize: '15px', fontWeight: 700
                                    }}
                                    title="ปิดหน้าต่าง"
                                ><X size={18} /></button>
                            </div>
                        </div>

                        {/* Modal Body: Table */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
                            {filteredRolls.length === 0 ? (
                                <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
                                    <FileSpreadsheet size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                                    <p style={{ fontSize: '14px', fontWeight: 600 }}>
                                        {filterQuery.trim()
                                            ? `ไม่พบรายการที่ตรงกับ "${filterQuery}"`
                                            : (modalDateFilter === 'today'
                                                ? 'ยังไม่มีรายการที่บันทึกในรอบวันนี้'
                                                : (modalDateFilter === 'inProgress'
                                                    ? 'ไม่มีงานที่กำลังผลิต (ทุก Job ปิดแล้ว)'
                                                    : 'ยังไม่มีรายการที่บันทึกในระบบ'))}
                                    </p>
                                </div>
                            ) : (
                                <div className="table-responsive-container" style={{ overflowX: 'auto', maxHeight: '100%' }}>
                                    <table className="modern-report-table w-full">
                                        <thead>
                                            <tr>
                                                <th rowSpan={2} style={{ width: '50px', minWidth: '50px' }}>
                                                    จัดการ<br />
                                                    <span className="sub-en">ACTION</span>
                                                </th>
                                                <th rowSpan={2} style={{ width: '45px', minWidth: '45px' }}>
                                                    รอบที่<br />
                                                    <span className="sub-en">RUN NO.</span>
                                                </th>
                                                <th rowSpan={2} style={{ minWidth: '105px' }}>
                                                    เวลาผลิต<br />
                                                    <span className="sub-en">PROD. TIME</span>
                                                </th>
                                                <th colSpan={5}>
                                                    วัตถุดิบที่ใช้<br />
                                                    <span className="sub-en">RAW MATERIALS</span>
                                                </th>
                                                <th colSpan={9}>
                                                    การตรวจสอบ<br />
                                                    <span className="sub-en">INSPECTION</span>
                                                </th>
                                                <th colSpan={6}>
                                                    เครื่องจักร & อุณหภูมิ<br />
                                                    <span className="sub-en">MACHINE & TEMPS</span>
                                                </th>
                                                <th rowSpan={2} style={{ width: '75px', minWidth: '75px' }}>
                                                    ผลิตได้<br />
                                                    <span className="sub-en">GOOD (m.)</span>
                                                </th>
                                                <th colSpan={9}>
                                                    สาเหตุงานเสีย<br />
                                                    <span className="sub-en">DEFECTS (m.)</span>
                                                </th>
                                                <th rowSpan={2} style={{ width: '75px', minWidth: '75px' }}>
                                                    Downtime<br />
                                                    <span className="sub-en">(นาที)</span>
                                                </th>
                                            </tr>
                                            <tr>
                                                {/* วัตถุดิบที่ใช้ (5 cols) */}
                                                <th className="th-sub" style={{ width: '42px', minWidth: '42px' }}>Tap<br /><span className="sub-en">Tube</span></th>
                                                <th className="th-sub" style={{ width: '85px', minWidth: '85px' }}>Lot No.<br /><span className="sub-en">Tap</span></th>
                                                <th className="th-sub" style={{ width: '42px', minWidth: '42px' }}>Emboss<br /><span className="sub-en">Slit</span></th>
                                                <th className="th-sub" style={{ width: '85px', minWidth: '85px' }}>Lot No.<br /><span className="sub-en">Slit</span></th>
                                                <th className="th-sub" style={{ width: '58px', minWidth: '58px', background: '#eff6ff' }}>ม้วน LOT<br /><span className="sub-en">ROLL</span></th>

                                                {/* การตรวจสอบ (9 cols) - ตรงตาม Report */}
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ID1<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ID2<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '44px', minWidth: '44px', background: '#e0f2fe' }}>AVG.<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '34px', minWidth: '34px' }}>T1<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '34px', minWidth: '34px' }}>T2<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '34px', minWidth: '34px' }}>T3<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '34px', minWidth: '34px' }}>T4<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '44px', minWidth: '44px', background: '#e0f2fe' }}>AVG.<br /><span className="sub-en">(mm.)</span></th>
                                                <th className="th-sub" style={{ width: '46px', minWidth: '46px' }}>Judgement<br /><span className="sub-en">JUDGE</span></th>

                                                {/* เครื่องจักร (6 cols) */}
                                                <th className="th-sub" style={{ width: '44px', minWidth: '44px' }}>Speed<br /><span className="sub-en">m/min</span></th>
                                                <th className="th-sub" style={{ width: '40px', minWidth: '40px' }}>Temp 1<br /><span className="sub-en">°C</span></th>
                                                <th className="th-sub" style={{ width: '40px', minWidth: '40px' }}>Temp 2<br /><span className="sub-en">°C</span></th>
                                                <th className="th-sub" style={{ width: '40px', minWidth: '40px' }}>Temp 3<br /><span className="sub-en">°C</span></th>
                                                <th className="th-sub" style={{ width: '40px', minWidth: '40px' }}>Temp 4<br /><span className="sub-en">°C</span></th>
                                                <th className="th-sub" style={{ width: '48px', minWidth: '48px', background: '#fef3c7' }}>Temp Pipe<br /><span className="sub-en">°C</span></th>

                                                {/* สาเหตุงานเสีย (9 cols) */}
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ตั้งเครื่อง<br /><span className="sub-en">setting</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>รอยต่อ IPO<br /><span className="sub-en">joint</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ตะเข็บแตก<br /><span className="sub-en">split</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ขนาด NG<br /><span className="sub-en">dim</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>โฟมไม่ติด Tube<br /><span className="sub-en">foam</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>รอยต่อ รอยมาร์ค<br /><span className="sub-en">mark</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>ความหนา NG<br /><span className="sub-en">thick</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>EMBOSS FILM ลอยด่าง<br /><span className="sub-en">blemish</span></th>
                                                <th className="th-sub" style={{ width: '36px', minWidth: '36px' }}>อื่นๆ<br /><span className="sub-en">other</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredRolls.map((r, idx) => {
                                                const d = r.defects || {};
                                                const defectTotal = Number(r.defectMeters !== undefined ? r.defectMeters : (r.ng || 0)) || 0;
                                                const autoSpecs = extractIpoTubeSpecs(r.productName || r.description, r.partNo);
                                                const hasT2Data = Boolean(
                                                    r.tube2 ||
                                                    (r.tube2List && r.tube2List.length > 0) ||
                                                    (r.tube2Spec && r.tube2Spec !== '-' && r.tube2Spec !== '')
                                                );
                                                const isTwin = r.isTwinTube !== undefined
                                                    ? Boolean(r.isTwinTube)
                                                    : Boolean(hasT2Data || autoSpecs.isTwin);
                                                const tube2 = r.tube2 || {};

                                                const isNewJob = idx === 0 || (r.jobNo || '').trim().toUpperCase() !== (filteredRolls[idx - 1].jobNo || '').trim().toUpperCase();
                                                const jobRolls = filteredRolls.filter(x => (x.jobNo || '').trim().toUpperCase() === (r.jobNo || '').trim().toUpperCase());
                                                const totalJobMeters = jobRolls.reduce((sum, x) => sum + (Number(x.productQty) || 0), 0);
                                                const cleanProdName = extractCleanProductName(r.productName || r.description, r.partNo) || r.productName || r.partNo || '-';

                                                // Tube 1 Data
                                                const isDateOrLotVal = (v) => Boolean(v && (String(v).includes('-') || String(v).includes('/') || String(v).length > 5));
                                                const hasValidTapSpec = (v) => Boolean(v && v !== '-' && v !== 'ไม่มีไส้');
                                                const isNoCoreRoll = !hasValidTapSpec(r.tapTube) && !hasValidTapSpec(r.tube1Spec) && Boolean(
                                                    r.hasNoCore === true ||
                                                    r.hasCore === false ||
                                                    r.tapTube === '-' ||
                                                    r.tapTube === 'ไม่มีไส้' ||
                                                    r.tube1Spec === '-' ||
                                                    r.tube1Spec === 'ไม่มีไส้'
                                                );
                                                const tube1Tap = isNoCoreRoll ? '-' : (r.tapTube || r.tube1Spec || r.selectedTube || autoSpecs.spec1 || '-');
                                                const tube1LotTap = isNoCoreRoll ? '-' : (r.lotNoTap && r.lotNoTap !== '-' ? r.lotNoTap : '-');
                                                const tube1LotEmboss = r.lotNoSlit || r.lotSlit || r.lotNoEmboss || r.rawLotNo || r.embossLot || r.lotNo || '-';
                                                const parsedT1Details = CalculationService.extractEmbossDetails(tube1LotEmboss);
                                                const tube1CleanLotEmboss = parsedT1Details.lotDate || tube1LotEmboss.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || tube1LotEmboss;
                                                const tube1RollSlit = (r.rollSlit !== undefined && r.rollSlit !== null && r.rollSlit !== '')
                                                    ? String(r.rollSlit).trim()
                                                    : ((r.roll_slit !== undefined && r.roll_slit !== null && r.roll_slit !== '')
                                                        ? String(r.roll_slit).trim()
                                                        : (parsedT1Details.rollNo || '-'));
                                                const tube1TotalRollSlit = (r.totalRollSlit !== undefined && r.totalRollSlit !== null && r.totalRollSlit !== '')
                                                    ? String(r.totalRollSlit).trim()
                                                    : ((r.total_roll_slit !== undefined && r.total_roll_slit !== null && r.total_roll_slit !== '')
                                                        ? String(r.total_roll_slit).trim()
                                                        : (parsedT1Details.totalRolls || '-'));

                                                const cleanREmboss = (!isDateOrLotVal(r.embossSlit) && r.embossSlit && r.embossSlit !== '-') ? r.embossSlit : '';
                                                const tube1Emboss = cleanREmboss || (r.tube1Spec && r.tube1Spec !== '-' && r.tube1Spec !== 'ไม่มีไส้' ? r.tube1Spec : '') || autoSpecs.spec1 || '-';
                                                const tube1Id1 = r.id1 !== undefined && r.id1 !== null && r.id1 !== '' ? r.id1 : '-';
                                                const tube1Id2 = r.id2 !== undefined && r.id2 !== null && r.id2 !== '' ? r.id2 : '-';
                                                const tube1IdAvg = r.idAvg !== undefined && r.idAvg !== null && r.idAvg !== '' ? r.idAvg : '-';
                                                const tube1T1 = r.t1 !== undefined && r.t1 !== null && r.t1 !== '' ? r.t1 : '-';
                                                const tube1T2 = r.t2 !== undefined && r.t2 !== null && r.t2 !== '' ? r.t2 : '-';
                                                const tube1T3 = r.t3 !== undefined && r.t3 !== null && r.t3 !== '' ? r.t3 : '-';
                                                const tube1T4 = r.t4 !== undefined && r.t4 !== null && r.t4 !== '' ? r.t4 : '-';
                                                const tube1TAvg = r.tAvg !== undefined && r.tAvg !== null && r.tAvg !== '' ? r.tAvg : '-';
                                                const isJudge1Ok = r.judgement !== 'NG';

                                                // Tube 2 Data (when isTwin)
                                                const tube2Tap = isNoCoreRoll ? '-' : (tube2.tapTube || r.tube2Spec || autoSpecs.spec2 || '-');
                                                const tube2LotTap = isNoCoreRoll ? '-' : (tube2.lotNoTap && tube2.lotNoTap !== '-' ? tube2.lotNoTap : (r.tube2LotTap && r.tube2LotTap !== '-' ? r.tube2LotTap : '-'));
                                                const sameLotTap = isNoCoreRoll ? true : (tube2LotTap === tube1LotTap && tube2LotTap !== '-');

                                                const tube2LotEmboss = tube2.lotNoSlit || tube2.lotSlit || tube2.lotNoEmboss || r.tube2LotNoSlit || r.tube2LotSlit || r.tube2LotEmboss || '-';
                                                const parsedT2Details = CalculationService.extractEmbossDetails(tube2LotEmboss);
                                                const tube2CleanLotEmboss = parsedT2Details.lotDate || tube2LotEmboss.replace(/\s*\(?(?:Roll|ม้วน)\s*\d+.*$/i, '').trim() || tube2LotEmboss;
                                                const tube2RollSlit = (tube2.rollSlit !== undefined && tube2.rollSlit !== null && tube2.rollSlit !== '')
                                                    ? String(tube2.rollSlit).trim()
                                                    : ((r.tube2RollSlit !== undefined && r.tube2RollSlit !== null && r.tube2RollSlit !== '')
                                                        ? String(r.tube2RollSlit).trim()
                                                        : (parsedT2Details.rollNo || tube1RollSlit));
                                                const tube2TotalRollSlit = (tube2.totalRollSlit !== undefined && tube2.totalRollSlit !== null && tube2.totalRollSlit !== '')
                                                    ? String(tube2.totalRollSlit).trim()
                                                    : ((r.tube2TotalRollSlit !== undefined && r.tube2TotalRollSlit !== null && r.tube2TotalRollSlit !== '')
                                                        ? String(r.tube2TotalRollSlit).trim()
                                                        : (parsedT2Details.totalRolls || tube1TotalRollSlit));

                                                const cleanT2Emboss = (!isDateOrLotVal(tube2.embossSlit) && tube2.embossSlit && tube2.embossSlit !== '-') ? tube2.embossSlit : '';
                                                const tube2Emboss = cleanT2Emboss || (r.tube2Spec && r.tube2Spec !== '-' && r.tube2Spec !== 'ไม่มีไส้' ? r.tube2Spec : '') || autoSpecs.spec2 || tube1Emboss || '-';
                                                const sameLotEmboss = (tube2CleanLotEmboss === tube1CleanLotEmboss && tube2CleanLotEmboss !== '-');
                                                const sameRollSlit = (tube2RollSlit === tube1RollSlit && tube2RollSlit !== '-');
                                                const sameTotalRollSlit = (tube2TotalRollSlit === tube1TotalRollSlit && tube2TotalRollSlit !== '-');

                                                const tube2Id1 = tube2.id1 !== undefined && tube2.id1 !== null && tube2.id1 !== '' ? tube2.id1 : '-';
                                                const tube2Id2 = tube2.id2 !== undefined && tube2.id2 !== null && tube2.id2 !== '' ? tube2.id2 : '-';
                                                const tube2IdAvg = tube2.idAvg !== undefined && tube2.idAvg !== null && tube2.idAvg !== '' ? tube2.idAvg : '-';
                                                const tube2T1 = tube2.t1 !== undefined && tube2.t1 !== null && tube2.t1 !== '' ? tube2.t1 : '-';
                                                const tube2T2 = tube2.t2 !== undefined && tube2.t2 !== null && tube2.t2 !== '' ? tube2.t2 : '-';
                                                const tube2T3 = tube2.t3 !== undefined && tube2.t3 !== null && tube2.t3 !== '' ? tube2.t3 : '-';
                                                const tube2T4 = tube2.t4 !== undefined && tube2.t4 !== null && tube2.t4 !== '' ? tube2.t4 : '-';
                                                const tube2TAvg = tube2.tAvg !== undefined && tube2.tAvg !== null && tube2.tAvg !== '' ? tube2.tAvg : '-';
                                                const isJudge2Ok = tube2.judgement ? tube2.judgement !== 'NG' : isJudge1Ok;

                                                const rowSpanCount = isTwin ? 2 : 1;

                                                return (
                                                    <React.Fragment key={r.id ? `${r.id}_${idx}` : `roll_${idx}`}>
                                                        {isNewJob && (
                                                            <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', borderBottom: '1.5px solid #cbd5e1' }}>
                                                                <td colSpan={34} style={{ padding: '6px 12px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                                                                                JOB: {r.jobNo || '-'}
                                                                            </span>
                                                                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', background: '#eff6ff', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bfdbfe' }}>
                                                                                {r.partNo || '-'} {cleanProdName ? `— ${cleanProdName}` : ''}
                                                                            </span>
                                                                            <span style={{ fontSize: '11px', color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                                                                                รวม {jobRolls.length} รอบ (~{totalJobMeters.toLocaleString()} m.)
                                                                            </span>
                                                                            <span style={{
                                                                                fontSize: '11px',
                                                                                color: '#475569',
                                                                                background: '#ffffff',
                                                                                border: '1px solid #cbd5e1',
                                                                                padding: '2px 8px',
                                                                                borderRadius: '6px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}>
                                                                                <CalendarDays size={11} style={{ color: '#64748b' }} />
                                                                                วันที่: <strong>{r.productionDate || '-'}</strong>
                                                                            </span>
                                                                            <span style={{
                                                                                fontSize: '11px',
                                                                                fontWeight: 700,
                                                                                color: '#0369a1',
                                                                                background: '#e0f2fe',
                                                                                border: '1px solid #bae6fd',
                                                                                padding: '2px 8px',
                                                                                borderRadius: '6px',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}>
                                                                                <User size={11} style={{ color: '#0284c7' }} />
                                                                                ผู้บันทึก: <strong>{r.operatorName || r.employeeName || currentOperator || getLoggedInOperatorName() || '-'}</strong>
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}

                                                        {/* แถวที่ 1 (Tube 1 และคอลัมน์ส่วนกลางที่มี rowSpan) */}
                                                        <tr className="text-xs hover:bg-slate-50">
                                                            {/* 1. จัดการ */}
                                                            <td rowSpan={rowSpanCount} className="text-center" style={{ padding: '4px 2px' }}>
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                                                                    {(r.isClosed || r.status === 'CLOSED') && !isOfficer ? (
                                                                        <span style={{ padding: '4px', color: '#94a3b8' }} title="ปิด Job แล้ว">
                                                                            <Lock size={13} />
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                handleStartEdit(r);
                                                                                setShowRecentJobsModal(false);
                                                                            }}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                padding: '4px 6px',
                                                                                borderRadius: '6px',
                                                                                border: (r.isClosed || r.status === 'CLOSED') ? '1px solid #c7d2fe' : '1px solid #bfdbfe',
                                                                                background: (r.isClosed || r.status === 'CLOSED') ? '#eef2ff' : '#eff6ff',
                                                                                color: (r.isClosed || r.status === 'CLOSED') ? '#4338ca' : '#1d4ed8',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                            className="hover:opacity-85 transition-colors"
                                                                            title={(r.isClosed || r.status === 'CLOSED') ? "แก้ไขรอบนี้ (Officer Mode)" : "ดึงข้อมูลรอบนี้กลับไปแก้ไขที่ฟอร์มด้านบน"}
                                                                        >
                                                                            <Pencil size={13} />
                                                                        </button>
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setSelectedStickerRoll(r);
                                                                            setShowStickerModal(true);
                                                                        }}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            padding: '4px 6px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid #fed7aa',
                                                                            background: '#fff7ed',
                                                                            color: '#c2410c',
                                                                            cursor: 'pointer'
                                                                        }}
                                                                        className="hover:bg-orange-100 transition-colors"
                                                                        title="พิมพ์ฉลากติดม้วนนี้ (Sticker Label)"
                                                                    >
                                                                        <Printer size={13} />
                                                                    </button>

                                                                    {onDeleteJob && !(r.isClosed || r.status === 'CLOSED') && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setDeleteModalState({
                                                                                    isOpen: true,
                                                                                    jobId: r.id,
                                                                                    jobNo: r.jobNo || '',
                                                                                    sequenceNo: r.sequenceNo || (idx + 1),
                                                                                    runNo: r.runNo || r.rollNo || (idx + 1),
                                                                                    isClearAll: false,
                                                                                    totalRolls: 1
                                                                                });
                                                                            }}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                padding: '4px 6px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #fecaca',
                                                                                background: '#fff5f5',
                                                                                color: '#dc2626',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                            className="hover:bg-red-100 transition-colors"
                                                                            title="ลบข้อมูลรอบนี้"
                                                                        >
                                                                            <Trash2 size={13} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            {/* 2. รอบที่ */}
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px' }}>
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    background: '#e0f2fe',
                                                                    color: '#0369a1',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px'
                                                                }}>
                                                                    #{r.runNo || r.rollNo || (idx + 1)}
                                                                </span>
                                                            </td>

                                                            {/* 3. เวลาผลิต */}
                                                            <td rowSpan={rowSpanCount} className="text-left" style={{ padding: '4px 6px' }}>
                                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>
                                                                    {r.startTime && r.endTime ? `${r.startTime} - ${r.endTime}` : (r.startTime || '-')}
                                                                </div>
                                                                {r.totalTime && (
                                                                    <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 600 }}>
                                                                        รวม: {r.totalTime}
                                                                    </div>
                                                                )}
                                                            </td>

                                                            {/* 4. วัตถุดิบ: TAP Tube 1 */}
                                                            <td className="text-center font-bold text-slate-800" style={{ padding: '4px 2px', fontSize: '11.5px' }}>
                                                                {tube1Tap}
                                                            </td>

                                                            {/* 5. วัตถุดิบ: Lot No. TAP */}
                                                            <td
                                                                rowSpan={isTwin && sameLotTap ? 2 : 1}
                                                                className="text-center font-mono text-slate-700"
                                                                style={{ padding: '4px 3px', fontSize: '10px' }}
                                                            >
                                                                {tube1LotTap}
                                                            </td>

                                                            {/* 6. วัตถุดิบ: Emboss Slit 1 */}
                                                            <td className="text-center font-bold text-slate-800" style={{ padding: '4px 2px', fontSize: '11.5px' }}>
                                                                {tube1Emboss}
                                                            </td>

                                                            {/* 7. วัตถุดิบ: Lot No. Slit */}
                                                            <td
                                                                rowSpan={isTwin && sameLotEmboss ? 2 : 1}
                                                                className="text-center font-mono text-slate-700"
                                                                style={{ padding: '4px 3px', fontSize: '10px' }}
                                                            >
                                                                {tube1CleanLotEmboss}
                                                            </td>

                                                            {/* 7.1 ม้วน LOT */}
                                                            <td
                                                                rowSpan={isTwin && sameRollSlit && sameTotalRollSlit ? 2 : 1}
                                                                className="text-center"
                                                                style={{ padding: '4px 3px' }}
                                                            >
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '2px 6px',
                                                                    background: '#eff6ff',
                                                                    color: '#1d4ed8',
                                                                    fontWeight: 800,
                                                                    fontSize: '11px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #bfdbfe'
                                                                }}>
                                                                    {(tube1RollSlit && tube1TotalRollSlit && tube1RollSlit !== '-' && tube1TotalRollSlit !== '-')
                                                                        ? `${tube1RollSlit}/${tube1TotalRollSlit}`
                                                                        : (tube1RollSlit !== '-' ? tube1RollSlit : '-')}
                                                                </span>
                                                            </td>

                                                            {/* 8. ตรวจขนาด: ID 1 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1Id1}
                                                            </td>

                                                            {/* 9. ตรวจขนาด: ID 2 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1Id2}
                                                            </td>

                                                            {/* 10. ตรวจขนาด: AVG. (ID) */}
                                                            <td className="text-center font-bold text-blue-900 bg-sky-50/50" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1IdAvg}
                                                            </td>

                                                            {/* 11. ตรวจขนาด: T1 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1T1}
                                                            </td>

                                                            {/* 12. ตรวจขนาด: T2 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1T2}
                                                            </td>

                                                            {/* 13. ตรวจขนาด: T3 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1T3}
                                                            </td>

                                                            {/* 14. ตรวจขนาด: T4 */}
                                                            <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1T4}
                                                            </td>

                                                            {/* 15. ตรวจขนาด: AVG. (T) */}
                                                            <td className="text-center font-bold text-blue-900 bg-sky-50/50" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {tube1TAvg}
                                                            </td>

                                                            {/* 16. ตรวจขนาด: ผลตรวจ (Judge-ment 1) */}
                                                            <td className="text-center font-bold" style={{ padding: '3px 2px' }}>
                                                                {isJudge1Ok ? (
                                                                    <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '1px 5px', borderRadius: '4px' }}>
                                                                        OK
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '4px' }}>
                                                                        NG
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* 17. เครื่องจักร: Speed */}
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold text-slate-800" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.speed || '-'}
                                                            </td>

                                                            {/* 18. เครื่องจักร: Temp 1 */}
                                                            <td rowSpan={rowSpanCount} className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.temp1 || '-'}
                                                            </td>

                                                            {/* 19. เครื่องจักร: Temp 2 */}
                                                            <td rowSpan={rowSpanCount} className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.temp2 || '-'}
                                                            </td>

                                                            {/* 20. เครื่องจักร: Temp 3 */}
                                                            <td rowSpan={rowSpanCount} className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.temp3 || '-'}
                                                            </td>

                                                            {/* 21. เครื่องจักร: Temp 4 */}
                                                            <td rowSpan={rowSpanCount} className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.temp4 || '-'}
                                                            </td>

                                                            {/* 22. เครื่องจักร: Temp Pipe */}
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold text-amber-950 bg-amber-50/50" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                {r.tempPipe || '-'}
                                                            </td>

                                                            {/* 23. ผลิตดี (m.) */}
                                                            <td rowSpan={rowSpanCount} className="text-right font-black text-emerald-700" style={{ padding: '4px 8px' }}>
                                                                <div>{Number(r.productQty || 0).toLocaleString()}</div>
                                                                {r.rollCount ? <div style={{ fontSize: '9px', color: '#64748b', fontWeight: 500 }}>~{r.rollCount} ม้วน</div> : null}
                                                            </td>

                                                            {/* 24-32. สาเหตุงานเสีย 9 ช่อง */}
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.setting > 0 ? Number(d.setting).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.jointIpo > 0 ? Number(d.jointIpo).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.splitSeam > 0 ? Number(d.splitSeam).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.dimNg > 0 ? Number(d.dimNg).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.foamDetached > 0 ? Number(d.foamDetached).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.jointMark > 0 ? Number(d.jointMark).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.thickNg > 0 ? Number(d.thickNg).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.filmBlemish > 0 ? Number(d.filmBlemish).toLocaleString() : ''}</td>
                                                            <td rowSpan={rowSpanCount} className="text-center font-bold" style={{ padding: '4px 2px', color: '#dc2626' }}>{d.otherNg > 0 ? Number(d.otherNg).toLocaleString() : ''}</td>

                                                            {/* 33. Downtime (นาที) */}
                                                            <td rowSpan={rowSpanCount} className="text-center" style={{ padding: '4px' }}>
                                                                {(r.downtimeMinutes > 0 || r.downtimeNote) ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                                                        {r.downtimeMinutes > 0 && (
                                                                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', background: '#fef3c7', padding: '1px 5px', borderRadius: '4px', border: '1px solid #fde68a', whiteSpace: 'nowrap' }}>
                                                                                {r.downtimeMinutes} น.
                                                                            </span>
                                                                        )}
                                                                        {r.downtimeNote && (
                                                                            <div style={{ fontSize: '8.5px', color: '#92400e', maxWidth: '85px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.downtimeNote}>
                                                                                {r.downtimeNote}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <span style={{ color: '#94a3b8' }}>-</span>
                                                                )}
                                                            </td>
                                                        </tr>

                                                        {/* แถวที่ 2 (Tube 2 เฉพาะเมื่อเป็นท่อคู่) */}
                                                        {isTwin && (
                                                            <tr className="text-xs hover:bg-slate-50">
                                                                {/* TAP Tube 2 */}
                                                                <td className="text-center font-bold text-slate-800" style={{ padding: '4px 2px', fontSize: '11.5px' }}>
                                                                    {tube2Tap}
                                                                </td>

                                                                {/* Lot No. TAP 2 (แสดงเฉพาะกรณี Lot ต่างกัน) */}
                                                                {!sameLotTap && (
                                                                    <td className="text-center font-mono text-slate-700" style={{ padding: '4px 3px', fontSize: '10px' }}>
                                                                        {tube2LotTap}
                                                                    </td>
                                                                )}

                                                                {/* Emboss Slit 2 */}
                                                                <td className="text-center font-bold text-slate-800" style={{ padding: '4px 2px', fontSize: '11.5px' }}>
                                                                    {tube2Emboss}
                                                                </td>

                                                                {/* Lot No. Emboss 2 (แสดงเฉพาะกรณี Lot ต่างกัน) */}
                                                                {!sameLotEmboss && (
                                                                    <td className="text-center font-mono text-slate-700" style={{ padding: '4px 3px', fontSize: '10px' }}>
                                                                        {tube2CleanLotEmboss}
                                                                    </td>
                                                                )}

                                                                {/* ม้วน LOT 2 (แสดงเฉพาะกรณีต่างกัน) */}
                                                                {!(sameRollSlit && sameTotalRollSlit) && (
                                                                    <td className="text-center" style={{ padding: '4px 3px' }}>
                                                                        <span style={{
                                                                            display: 'inline-block',
                                                                            padding: '2px 6px',
                                                                            background: '#eff6ff',
                                                                            color: '#1d4ed8',
                                                                            fontWeight: 800,
                                                                            fontSize: '11px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid #bfdbfe'
                                                                        }}>
                                                                            {(tube2RollSlit && tube2TotalRollSlit && tube2RollSlit !== '-' && tube2TotalRollSlit !== '-')
                                                                                ? `${tube2RollSlit}/${tube2TotalRollSlit}`
                                                                                : (tube2RollSlit !== '-' ? tube2RollSlit : '-')}
                                                                        </span>
                                                                    </td>
                                                                )}

                                                                {/* ID1 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2Id1}
                                                                </td>

                                                                {/* ID2 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2Id2}
                                                                </td>

                                                                {/* AVG. (ID) 2 */}
                                                                <td className="text-center font-bold text-blue-900 bg-sky-50/50" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2IdAvg}
                                                                </td>

                                                                {/* T1 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2T1}
                                                                </td>

                                                                {/* T2 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2T2}
                                                                </td>

                                                                {/* T3 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2T3}
                                                                </td>

                                                                {/* T4 2 */}
                                                                <td className="text-center text-slate-700" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2T4}
                                                                </td>

                                                                {/* AVG. (T) 2 */}
                                                                <td className="text-center font-bold text-blue-900 bg-sky-50/50" style={{ padding: '3px 2px', fontSize: '11px' }}>
                                                                    {tube2TAvg}
                                                                </td>

                                                                {/* ผลตรวจ (Judge-ment 2) */}
                                                                <td className="text-center font-bold" style={{ padding: '3px 2px' }}>
                                                                    {isJudge2Ok ? (
                                                                        <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '1px 5px', borderRadius: '4px' }}>
                                                                            OK
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '10px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '4px' }}>
                                                                            NG
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '10px 20px',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#f8fafc'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: '#475569' }}>
                                <span>จำนวน: <strong style={{ color: '#0369a1' }}>{uniqueJobCount} Job ({filteredRolls.length} รอบ)</strong></span>
                                <span>•</span>
                                <span>รวมผลิตดี: <strong style={{ color: '#15803d' }}>{modalSummaryTotals.totalGoodMeters.toLocaleString()} m.</strong></span>
                                <span>•</span>
                                <span>รวมงานเสีย: <strong style={{ color: '#dc2626' }}>{modalSummaryTotals.totalDefect.toLocaleString()} m.</strong></span>
                                <span>•</span>
                                <span>ผลิตทั้งหมด: <strong style={{ color: '#0f172a' }}>{modalSummaryTotals.totalMeters.toLocaleString()} m.</strong></span>
                                <span>•</span>
                                <span>Downtime รวม: <strong style={{ color: '#b45309' }}>{modalSummaryTotals.totalDt} นาที</strong></span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRecentJobsModal(false)}
                                className="btn-compact-secondary"
                                style={{
                                    padding: '6px 16px',
                                    fontSize: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #cbd5e1',
                                    background: '#ffffff',
                                    color: '#334155',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={deleteModalState.isOpen}
                title={deleteModalState.isClearAll ? "ยืนยันการล้างรายการทั้งหมด" : "ยืนยันการลบข้อมูลการผลิต"}
                message={deleteModalState.isClearAll
                    ? "คุณแน่ใจหรือไม่ว่าต้องการล้างรายการที่บันทึกไว้ทั้งหมดออกจากระบบ?"
                    : `คุณต้องการลบข้อมูล Job No. "${deleteModalState.jobNo || deleteModalState.jobId}" ${deleteModalState.runNo ? `(รอบที่ ${deleteModalState.runNo})` : (deleteModalState.totalRolls ? `(ทั้งหมด ${deleteModalState.totalRolls} รอบ)` : '')} ใช่หรือไม่?`}
                confirmText={deleteModalState.isClearAll ? "ล้างทั้งหมด" : "ลบข้อมูล"}
                cancelText="ยกเลิก"
                onConfirm={async () => {
                    if (deleteModalState.isClearAll) {
                        if (onClearAll) await onClearAll();
                        setShowRecentJobsModal(false);
                    } else if (deleteModalState.rolls && deleteModalState.rolls.length > 0) {
                        for (const r of deleteModalState.rolls) {
                            await onDeleteJob?.(r.id, deleteModalState.jobNo, r.runNo);
                        }
                    } else {
                        await onDeleteJob?.(deleteModalState.jobId, deleteModalState.jobNo, deleteModalState.runNo);
                    }
                    setDeleteModalState({ isOpen: false, jobId: null, jobNo: '', sequenceNo: '', runNo: '', totalRolls: 0, rolls: [], isClearAll: false });
                }}
                onClose={() => setDeleteModalState({ isOpen: false, jobId: null, jobNo: '', sequenceNo: '', runNo: '', totalRolls: 0, rolls: [], isClearAll: false })}
                onCancel={() => setDeleteModalState({ isOpen: false, jobId: null, jobNo: '', sequenceNo: '', runNo: '', totalRolls: 0, rolls: [], isClearAll: false })}
            />

            {/* Modal ยืนยันการปิด Job (จบงาน) */}
            {closeJobModalState.isOpen && (
                <div className="modal-backdrop animate-fadeIn" style={{ zIndex: 1050 }} onClick={() => setCloseJobModalState({ ...closeJobModalState, isOpen: false })}>
                    <div className="syteline-modal-card" style={{ maxWidth: '440px', padding: 0 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{
                            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                            padding: '14px 18px',
                            color: '#ffffff',
                            borderTopLeftRadius: '12px',
                            borderTopRightRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '15px' }}>
                                <CheckCircle2 size={20} />
                                <span>ยืนยันการปิด Job</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setCloseJobModalState({ ...closeJobModalState, isOpen: false })}
                                style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '2px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ padding: '18px' }}>
                            <div style={{
                                background: '#f0fdf4',
                                border: '1px solid #bbf7d0',
                                borderRadius: '8px',
                                padding: '12px',
                                marginBottom: '14px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: '#166534', fontWeight: 600, fontSize: '13px' }}>Job:</span>
                                    <strong style={{ color: '#15803d', fontSize: '14px' }}>{closeJobModalState.jobNo}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: '#166534', fontWeight: 600, fontSize: '13px' }}>Part No:</span>
                                    <span style={{ color: '#0f172a', fontWeight: 700 }}>
                                        {closeJobModalState.partNo || '-'} {closeJobModalState.productName ? `(${closeJobModalState.productName})` : ''}
                                    </span>
                                </div>
                                {closeJobModalState.batchMeters > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '12px', color: '#0369a1' }}>
                                        <span>ยอดรอบนี้ที่กำลังจะบันทึก:</span>
                                        <strong>+{closeJobModalState.batchMeters.toLocaleString()} m. (~{closeJobModalState.batchRolls} ม้วน)</strong>
                                    </div>
                                )}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    paddingTop: '6px',
                                    borderTop: '1px dashed #86efac',
                                    fontSize: '13.5px'
                                }}>
                                    <span style={{ color: '#166534', fontWeight: 800 }}>ยอดรวมทั้งสิ้นของ Job นี้:</span>
                                    <strong style={{ color: '#15803d', fontSize: '15px' }}>
                                        {closeJobModalState.totalMeters.toLocaleString()} m. ({closeJobModalState.totalRolls} รอบ)
                                    </strong>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    onClick={() => setCloseJobModalState({ ...closeJobModalState, isOpen: false })}
                                    style={{
                                        padding: '7px 14px',
                                        borderRadius: '6px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        fontWeight: 700,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmCloseJob}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                        color: '#ffffff',
                                        fontWeight: 800,
                                        fontSize: '12.5px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
                                    }}
                                >
                                    <CheckCircle2 size={15} />
                                    <span>ยืนยัน</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Dialog: พิมพ์ฉลากติดม้วน (Sticker Label / QR) ── */}
            {showStickerModal && (
                <IpoStickerModal
                    isOpen={showStickerModal}
                    onClose={() => {
                        setShowStickerModal(false);
                        setSelectedStickerRoll(null);
                    }}
                    jobData={selectedStickerRoll || {
                        jobNo: jobNo || scanQuery || '',
                        partNo: partNo || '',
                        productName: productName || '',
                        description: description || `${partNo || ''} ${productName || ''}`.trim(),
                        productionDate: productionDate || getTodayLotNo(),
                        lotNo: lotNoTap || getTodayLotNo(),
                        stdRollLength: stdRollLength || '1000',
                        rolls: ipoRecordedJobs || []
                    }}
                    initialRollNo={selectedStickerRoll ? (selectedStickerRoll.runNo || selectedStickerRoll.sequenceNo || null) : null}
                    allJobs={ipoRecordedJobs || []}
                />
            )}
        </div>
    );
};

export const CreateIpoTube = (props) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const context = useIpoTube();

    const todayDateStr = CalculationService.getCurrentDateString();
    const allJobs = props.recentJobs || context.jobs || [];

    const header = props.header || context.header;
    const productionDate = header?.date || todayDateStr;
    const operatorName = props.operatorName || getLoggedInOperatorName() || header?.operatorName || 'Operator';

    const handleSaveJob = (job) => {
        if (props.onSaveJob) {
            props.onSaveJob(job);
            return;
        }

        context.addJob(job);
    };

    const handleSaveJobs = (jobsArray) => {
        if (props.onSaveJobs) {
            props.onSaveJobs(jobsArray);
            return;
        }

        if (context.addJobs) {
            context.addJobs(jobsArray);
        } else {
            jobsArray.forEach(job => context.addJob(job));
        }
    };

    const handleUpdateJob = (job) => {
        if (props.onUpdateJob) {
            props.onUpdateJob(job);
            return;
        }

        context.updateJob(job);
        if (id) {
            navigate('/ipo-tube/history');
        }
    };

    const handleDeleteJob = async (jobId, targetJobNo, targetRunNo) => {
        if (props.onDeleteJob) {
            props.onDeleteJob(jobId, targetJobNo, targetRunNo);
            return;
        }

        const jobObj = allJobs.find(j => j.id === jobId || (targetJobNo && (j.jobNo || j.job) === targetJobNo));
        const effectiveJobNo = targetJobNo || jobObj?.jobNo || jobObj?.job || (typeof jobId === 'string' && jobId.includes('_') ? jobId.split('_')[0] : jobId);

        try {
            await context.deleteJob(jobId, effectiveJobNo, targetRunNo);
            toast.success('ลบข้อมูลออกจากฐานข้อมูลเรียบร้อย');
        } catch (err) {
            console.error('handleDeleteJob error:', err);
        }
    };

    return (
        <ActiveJobPanel
            onSaveJob={handleSaveJob}
            onSaveJobs={handleSaveJobs}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onClearAll={props.onClearAll || context.clearAllJobs}
            operatorName={operatorName}
            recentJobs={allJobs}
            initialJobId={id}
            productionDate={productionDate}
        />
    );
};

export default CreateIpoTube;
