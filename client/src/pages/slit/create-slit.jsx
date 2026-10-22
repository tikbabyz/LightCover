import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Scan, Save, RotateCcw, CheckCircle2, AlertTriangle, FileSpreadsheet, Pencil, Trash2, Plus, Search, Eye, Printer } from 'lucide-react';
import { RiArrowGoBackLine } from 'react-icons/ri';
import axios from 'axios';
import { CalculationService } from '../../services/calculationService';
import { useSlit } from '../../context/SlitContext';
import { ActivityLogService, ACTION_TYPES } from '../../services/activityLogService';
import { SlitStickerModal } from './components/SlitStickerModal';
import { isOfficerUser } from '../../services/authHelper';

/** แยกขนาดความหนา ความกว้าง ความยาว จาก Description เช่น "TC-3HR(BR)9X1200X100M" */
const parseDescriptionSpecs = (description) => {
    if (!description) return { thick: 0, width: 0, length: 0 };
    try {
        const match3 = description.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/);
        if (match3) {
            return {
                thick: parseFloat(match3[1]) || 0,
                width: parseFloat(match3[2]) || 0,
                length: parseFloat(match3[3]) || 0
            };
        }
        const match2 = description.match(/(\d+(?:\.\d+)?)\s*[xX\*]\s*(\d+(?:\.\d+)?)/);
        if (match2) {
            return {
                thick: Math.min(parseFloat(match2[1]) || 0, parseFloat(match2[2]) || 0),
                width: Math.max(parseFloat(match2[1]) || 0, parseFloat(match2[2]) || 0),
                length: 0
            };
        }
    } catch {
        // ignore
    }
    return { thick: 0, width: 0, length: 0 };
};

/** ค้นหาและดึงข้อมูล Job โดยตรงจาก SQL Server API: GET /api/slit/job/{jobNumber} */
const fetchJobFromServer = async (query) => {
    const rawQuery = (query || '').toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
    if (!rawQuery) return null;

    const apiBase = import.meta.env.VITE_API_URL || '';
    const endpoint = `${apiBase}/api/slit/job/${encodeURIComponent(rawQuery)}`;
    console.log(`[SQL SERVER API] กำลังเรียก API จาก Server จริง:`, endpoint);

    const token = localStorage.getItem('token');
    const headers = {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const response = await axios.get(endpoint, {
        timeout: 10000,
        headers
    });

    const data = response.data;
    const list = Array.isArray(data) ? data : (data ? [data] : []);

    if (list.length === 0) {
        return null;
    }

    const item = list[0];
    const jobNo = item.job || item.Job || rawQuery;
    const itemMst = (item.itemMst || item.ItemMst || item.finishedItem || item.FinishedItem || (item.item && !item.item.startsWith('P') ? item.item : '') || item.item || item.Item || '').trim();
    const partNo = itemMst;
    const finishedItem = itemMst;
    const itemDescription = (item.description || item.Description || '').trim();

    let materialNo = (item.item?.startsWith('P') ? item.item : '').trim();
    let materialDescription = '';
    const specs = parseDescriptionSpecs(itemDescription);

    let thickness = Number(item.thickness ?? item.Thickness ?? 0) || specs.thick || 0;
    let width = Number(item.width ?? item.Width ?? 0) || specs.width || 0;
    let length = Number(item.length ?? item.Length ?? 0) || specs.length || 0;
    const qtyReleased = Number(item.qtyReleased ?? item.QtyReleased ?? 0);

    let colorName = (item.colorName || item.ColorName || '').trim();
    let colorCode = (item.colorCode || item.ColorCode || '').trim();
    let pvcColor = (item.pvcColor || item.PvcColor || '').trim();
    let color = colorName || colorCode || pvcColor || '';

    let materialType = (item.materialType || item.MaterialType || '').trim();
    let descWords = itemDescription ? itemDescription.split(/\s+/) : [];
    let foamName = materialType || (descWords.length > 0 ? descWords[0] : (partNo.includes('TC-3HR') ? 'TC-3HR' : ''));

    // ดึง BOM เพื่อหารหัสม้วนวัตถุดิบ (P...) และสเปก STD
    try {
        const bomTarget = itemMst || jobNo;
        const bomEndpoint = `${apiBase}/api/slit/bom/${encodeURIComponent(bomTarget)}`;
        const bomRes = await axios.get(bomEndpoint, { timeout: 5000, headers });
        const rawBom = bomRes.data;
        const bomList = Array.isArray(rawBom) ? rawBom : (rawBom?.value && Array.isArray(rawBom.value) ? rawBom.value : []);
        let foamMat = bomList.find(b => {
            const w = Number(b.width || b.Width || 0);
            const itemCode = (b.materialItem || b.MaterialItem || '').trim();
            return (w >= 500 && itemCode.startsWith('P')) || (itemCode.startsWith('P') && w >= 200) || w >= 500;
        }) || bomList.find(b => (b.materialItem || b.MaterialItem || '').startsWith('P'));

        if (!foamMat && jobNo && jobNo !== itemMst) {
            try {
                const jobBomRes = await axios.get(`${apiBase}/api/slit/bom/${encodeURIComponent(jobNo)}`, { timeout: 5000, headers });
                const rawJobBom = jobBomRes.data;
                const jobBomList = Array.isArray(rawJobBom) ? rawJobBom : (rawJobBom?.value && Array.isArray(rawJobBom.value) ? rawJobBom.value : []);
                const jMat = jobBomList.find(b => {
                    const w = Number(b.width || b.Width || 0);
                    const itemCode = (b.materialItem || b.MaterialItem || '').trim();
                    return (w >= 500 && itemCode.startsWith('P')) || (itemCode.startsWith('P') && w >= 200) || w >= 500;
                }) || jobBomList.find(b => (b.materialItem || b.MaterialItem || '').startsWith('P'));
                if (jMat) foamMat = jMat;
            } catch (errJobBom) {
                console.warn('[Slit Job BOM Fallback Notice]:', errJobBom);
            }
        }

        if (foamMat) {
            materialNo = (foamMat.materialItem || foamMat.MaterialItem || materialNo).trim();
            materialDescription = (foamMat.materialDescription || foamMat.MaterialDescription || '').trim();
            const bomThick = Number(foamMat.thickness ?? foamMat.Thickness);
            if (bomThick > 0) thickness = bomThick;
            const bomWidth = Number(foamMat.width ?? foamMat.Width);
            if (bomWidth > 0) width = bomWidth;
            const bomLength = Number(foamMat.length ?? foamMat.Length);
            if (bomLength > 0) length = bomLength;
            color = (foamMat.materialColor || foamMat.MaterialColor || color).trim();
            colorName = color;
            const foamDescWords = materialDescription ? materialDescription.split(/\s+/) : [];
            foamName = foamDescWords.length > 0 ? foamDescWords[0].replace(/\(.*\)/, '') : (materialType || foamName);
        }
    } catch (e) {
        console.warn('[Slit BOM Resolve] Notice:', e);
    }

    if (!materialNo && item.item?.startsWith('P')) {
        materialNo = item.item;
    }

    return {
        jobNo,
        jobDate: item.jobDate || item.JobDate,
        partNo,
        itemMst,
        finishedItem,
        materialNo,
        partName: itemDescription || partNo,
        description: itemDescription || materialDescription || partNo,
        itemDescription,
        materialDescription,
        materialType,
        foamName: foamName || '',
        thicknessStd: thickness,
        widthStd: width,
        lengthStd: length,
        firstSheetThick: thickness,
        color,
        colorCode,
        colorName,
        pvcColor,
        orderQtyPcs: qtyReleased,
        customerName: 'SyteLine ERP',
        firstSheetWidth1: '',
        productedQty1: '',
        firstSheetWidth2: '',
        productedQty2: '',
        firstSheetEntries: [],
        raw: item
    };
};

/** สร้าง/แปลง LOT NO. ให้อยู่ในรูปแบบ YYYY-MM-DD (ค.ศ.) */
const getTodayLotNo = (targetDate) => {
    return CalculationService.formatToYYYYMMDD(targetDate, targetDate || new Date());
};

export const ActiveJobPanel = ({
    onSaveJob,
    onUpdateJob,
    onDeleteJob,
    onClearAll,
    operatorName,
    nextSequenceNo,
    recentJobs = [],
    allJobs = [],
    initialJobId,
    productionDate,
    isReadOnly: propReadOnly,
    viewJob
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const isReadOnly = Boolean(propReadOnly || location.state?.readOnly || location.pathname.includes('/slit/view'));
    const slitContext = useSlit();
    const allRecordedJobs = (allJobs && allJobs.length > 0) ? allJobs : (slitContext?.jobs || recentJobs);

    // ─────────────────────────────────────────────────────────────
    // รายการ Jobs ในรอบตัดนี้: เริ่มต้นแสดง Job 1 เป็นหลัก (หากต้องการเพิ่ม Job กดปุ่ม + เพิ่ม Job)
    // ─────────────────────────────────────────────────────────────
    const defaultJobs = [
        { id: 1, jobNo: '', partNo: '', materialNo: '', description: '', foamName: '', color: '', width: '', qty: '', isSearching: false }
    ];
    const [jobsList, setJobsList] = useState(defaultJobs);
    // Alias เพื่อความเข้ากันได้กับ Modal ติดสติกเกอร์
    const sheetEntries = jobsList;

    // ส่วนที่ 1: ข้อมูลม้วนวัตถุดิบ & การตรวจวัด
    const [embossLot, setEmbossLot] = useState('');
    const [embossRoll, setEmbossRoll] = useState('');
    const [embossTotalRoll, setEmbossTotalRoll] = useState('');
    const [actualFoamWidth, setActualFoamWidth] = useState('');
    const [firstSheetThick, setFirstSheetThick] = useState('');
    const [ngQty, setNgQty] = useState('0');
    const rollUsed = 1; // FIX ถาวร 1 ม้วน ไม่ต้องให้พนักงานกรอก

    // ข้อมูลสเปก STD ของม้วนโฟม
    const [materialNo, setMaterialNo] = useState('');
    const [foamName, setFoamName] = useState('');
    const [stdThick, setStdThick] = useState('');
    const [stdWidth, setStdWidth] = useState('');
    const [stdLength, setStdLength] = useState('');
    const [color, setColor] = useState('');
    const [itemDescription, setItemDescription] = useState('');
    const [lotNo, setLotNo] = useState(() => getTodayLotNo(productionDate));
    const [isEditingSpecs, setIsEditingSpecs] = useState(false);
    const [isManualMode, setIsManualMode] = useState(false);

    // ส่วนที่ 3: ผลคำนวณสด
    const [calcResult, setCalcResult] = useState({
        actualUsedQty: 0,
        remainWidth: 0,
        lossOverStd: 0,
        lossProduct: 0,
        yield: 0,
        isYieldWarning: false
    });
    const [formErrors, setFormErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);

    // State จัดการ Modal & แก้ไข Job (ต้องประกาศก่อนฟังก์ชันตรวจสอบ Lot ซ้ำ)
    const [editingJob, setEditingJob] = useState(null);
    const [showRecentJobsModal, setShowRecentJobsModal] = useState(false);
    const [deleteModalState, setDeleteModalState] = useState({
        isOpen: false,
        jobId: null,
        jobNo: '',
        sequenceNo: '',
        isClearAll: false,
    });
    const [showStickerModal, setShowStickerModal] = useState(false);
    const [selectedStickerRoll, setSelectedStickerRoll] = useState(null);

    // ตรวจจับ Lot Emboss ซ้ำ (ห้ามซ้ำ)
    const [duplicateLotInfo, setDuplicateLotInfo] = useState(null); // { jobNo: string, lot: string }
    const checkLotTimerRef = useRef(null);

    const normalizeLotForComparison = (lotStr) => {
        if (!lotStr) return '';
        let s = String(lotStr).trim();
        if (!s || s === '-') return '';
        s = s.replace(/ม้วน/gi, 'Roll');
        const bracketMatch = s.match(/\(([^)]+)\)/);
        let bracket = '';
        if (bracketMatch) {
            bracket = bracketMatch[1].trim().toLowerCase().replace(/\s+/g, '');
        }
        const datePart = s.replace(/\(.*?\)/g, '').trim();
        const normDate = CalculationService.formatToYYYYMMDD(datePart, '') || datePart;
        if (bracket) {
            return `${normDate} (${bracket})`.toLowerCase();
        }
        return normDate.toLowerCase();
    };

    const findDuplicateInRecordedJobs = (lotToCheck, excludeJobId, excludeJobNo) => {
        if (!lotToCheck || !lotToCheck.trim() || lotToCheck.trim() === '-') return null;
        const targetKey = normalizeLotForComparison(lotToCheck);
        if (!targetKey || targetKey === '-') return null;

        const cleanExcludeJob = excludeJobNo ? String(excludeJobNo).trim() : null;
        const cleanExcludeId = excludeJobId ? String(excludeJobId) : null;

        for (const j of allRecordedJobs) {
            if (!j) continue;
            const jId = String(j.id ?? '');
            const jHeadId = String(j.headId ?? '');
            const jNo = String(j.jobNo || j.job || j.rawJobNo || '').trim();

            // ข้าม Job ปัจจุบันที่กำลังแก้ไข
            if (cleanExcludeId && (jId === cleanExcludeId || jHeadId === cleanExcludeId)) {
                continue;
            }
            if (cleanExcludeJob && (jNo === cleanExcludeJob || jNo.startsWith(`${cleanExcludeJob}#`))) {
                continue;
            }

            const candidateLots = [];
            if (j.embossLot) candidateLots.push(j.embossLot);
            if (j.emboss_lot) candidateLots.push(j.emboss_lot);
            if (j.EmbossLot) candidateLots.push(j.EmbossLot);

            if (Array.isArray(j.firstSheetEntries)) {
                j.firstSheetEntries.forEach(e => {
                    if (e?.embossLot) candidateLots.push(e.embossLot);
                });
            }
            if (Array.isArray(j.details)) {
                j.details.forEach(d => {
                    if (d?.embossLot || d?.emboss_lot) candidateLots.push(d.embossLot || d.emboss_lot);
                });
            }

            for (const cLot of candidateLots) {
                if (normalizeLotForComparison(cLot) === targetKey) {
                    return {
                        jobNo: jNo || jId || 'ในระบบ',
                        lot: cLot
                    };
                }
            }
        }
        return null;
    };

    const checkEmbossLotDuplicateOnServer = async (lotToCheck, excludeJobNo, excludeId) => {
        if (!lotToCheck || !lotToCheck.trim() || lotToCheck.trim() === '-') return null;
        try {
            const apiBase = import.meta.env.VITE_API_URL || '';
            const token = localStorage.getItem('token');
            const headers = {
                'Accept': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
            const response = await axios.get(`${apiBase}/api/slit/check-emboss-lot`, {
                params: {
                    lot: lotToCheck.trim(),
                    excludeJob: excludeJobNo || undefined,
                    excludeId: (excludeId && !isNaN(Number(excludeId))) ? Number(excludeId) : undefined
                },
                headers,
                timeout: 5000
            });
            if (response.data?.isDuplicate) {
                return {
                    jobNo: response.data.existingJob,
                    lot: lotToCheck.trim()
                };
            }
        } catch (err) {
            console.warn('[checkEmbossLotOnServer error]:', err);
        }
        return null;
    };

    const verifyEmbossLotDuplicate = async (lotValue) => {
        if (!lotValue || !lotValue.trim() || lotValue.trim() === '-') {
            setDuplicateLotInfo(null);
            return null;
        }

        const currentExcludeJob = editingJob?.jobNo || editingJob?.rawJobNo;
        const currentExcludeId = editingJob?.id || editingJob?.headId;

        // 1. ตรวจสอบในความจำเครื่องทันที (0ms)
        const localDup = findDuplicateInRecordedJobs(lotValue, currentExcludeId, currentExcludeJob);
        if (localDup) {
            setDuplicateLotInfo(localDup);
            return localDup;
        }

        // 2. ตรวจสอบกับ Server SQL Database
        const serverDup = await checkEmbossLotDuplicateOnServer(lotValue, currentExcludeJob, currentExcludeId);
        if (serverDup) {
            setDuplicateLotInfo(serverDup);
            return serverDup;
        }

        setDuplicateLotInfo(null);
        return null;
    };

    // ตรวจสอบแบบ Debounce เมื่อผู้ใช้พิมพ์หรือเปลี่ยน Lot Emboss หรือ Roll
    useEffect(() => {
        if (checkLotTimerRef.current) clearTimeout(checkLotTimerRef.current);
        const clean = (embossLot || '').trim();
        if (!clean || clean === '-') {
            setDuplicateLotInfo(null);
            return;
        }

        const currentExcludeJob = editingJob?.jobNo || editingJob?.rawJobNo;
        const currentExcludeId = editingJob?.id || editingJob?.headId;
        const targetToCheck = (embossRoll && embossTotalRoll) ? `${clean} (Roll ${embossRoll}/${embossTotalRoll})` : clean;

        // In-memory check ทันทีไม่ต้องรอ
        const localDup = findDuplicateInRecordedJobs(targetToCheck, currentExcludeId, currentExcludeJob);
        if (localDup) {
            setDuplicateLotInfo(localDup);
            return;
        }

        // หน่วงเวลาตรวจสอบกับ Server 300ms
        checkLotTimerRef.current = setTimeout(async () => {
            const serverDup = await checkEmbossLotDuplicateOnServer(targetToCheck, currentExcludeJob, currentExcludeId);
            if (serverDup) {
                setDuplicateLotInfo(serverDup);
            } else {
                setDuplicateLotInfo(null);
            }
        }, 300);

        return () => {
            if (checkLotTimerRef.current) clearTimeout(checkLotTimerRef.current);
        };
    }, [embossLot, embossRoll, embossTotalRoll, allRecordedJobs, editingJob]);

    // Refs สำหรับการสแกนและกดปุ่ม Enter เลื่อนลำดับโฟกัสอัตโนมัติ
    const embossInputRef = useRef(null);
    const actualFoamWidthInputRef = useRef(null);
    const firstSheetThickInputRef = useRef(null);
    const ngQtyInputRef = useRef(null);
    const jobInputRefs = useRef([]);
    const partNoInputRefs = useRef([]);
    const widthInputRefs = useRef([]);
    const qtyInputRefs = useRef([]);
    const saveButtonRef = useRef(null);

    useEffect(() => {
        if (!editingJob) {
            setLotNo(getTodayLotNo(productionDate));
        }
    }, [productionDate, editingJob]);

    // โฟกัสเริ่มต้นที่ช่องแรก (Lot วัตถุดิบ)
    useEffect(() => {
        setTimeout(() => {
            if (embossInputRef.current) {
                embossInputRef.current.focus();
                embossInputRef.current.select?.();
            }
        }, 150);
    }, []);

    // คำนวณสรุปผลผลิตแบบเรียลไทม์
    const validEntries = jobsList.filter(
        j => parseFloat(j.width) > 0 && parseInt(j.qty, 10) > 0
    );

    const totalCutWidthMm = validEntries.reduce((sum, j) => {
        return sum + (parseFloat(j.width) * parseInt(j.qty, 10));
    }, 0);

    const isCalcReady = Boolean(
        (parseFloat(stdWidth) > 0 || parseFloat(actualFoamWidth) > 0) &&
        validEntries.length > 0
    );

    useEffect(() => {
        if (!isCalcReady) {
            setCalcResult({
                actualUsedQty: 0,
                remainWidth: 0,
                lossOverStd: 0,
                lossProduct: 0,
                yield: 0,
                isYieldWarning: false
            });
            return;
        }

        const foamW = parseFloat(actualFoamWidth) || 0;
        const wStd = parseFloat(stdWidth) > 0 ? parseFloat(stdWidth) : foamW;

        const result = CalculationService.calculatePipeLineMetrics({
            stdWidth: wStd,
            actualFoamWidth: foamW,
            firstSheetEntries: validEntries,
            rollUsed: 1,
            targetYieldStd: 95.0
        });
        setCalcResult(result);
    }, [isCalcReady, stdWidth, actualFoamWidth, jobsList]);

    // ฟังก์ชันจัดการฟิลด์ในการ์ด Job
    const handleJobFieldChange = (idx, field, value) => {
        setJobsList(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], [field]: value };
            return next;
        });
        if (formErrors[`${field}_${idx}`]) {
            setFormErrors(prev => ({ ...prev, [`${field}_${idx}`]: undefined }));
        }
    };

    // ค้นหา Job จาก SyteLine
    const handleSearchJob = async (idx, customQuery) => {
        const rawInput = customQuery ?? jobsList[idx]?.jobNo ?? '';
        let query = rawInput.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
        if (!query || query === '-') {
            widthInputRefs.current[idx]?.focus();
            widthInputRefs.current[idx]?.select?.();
            return;
        }

        // กรณีสแกน QR Code ที่มีหลายฟิลด์คั่นด้วย |
        let extractedEmbossDetails = null;
        if (query.includes('|')) {
            extractedEmbossDetails = CalculationService.extractEmbossDetails(query);
            const parts = query.split('|').map(p => p.trim()).filter(Boolean);
            if (parts.length > 0) query = parts[0];
        }

        setJobsList(prev => prev.map((item, i) => i === idx ? { ...item, jobNo: query, isSearching: true } : item));
        if (formErrors[`jobNo_${idx}`]) {
            setFormErrors(prev => ({ ...prev, [`jobNo_${idx}`]: undefined }));
        }

        try {
            const fetched = await fetchJobFromServer(query);
            if (fetched) {
                const parsed = parseDescriptionSpecs(fetched.itemDescription || fetched.description || fetched.materialDescription);
                const thick = (Number(fetched.firstSheetThick) > 0 ? Number(fetched.firstSheetThick) : null)
                    ?? (Number(fetched.thicknessStd) > 0 ? Number(fetched.thicknessStd) : null)
                    ?? (parsed.thick > 0 ? parsed.thick : null);
                const wStd = (Number(fetched.widthStd) > 0 ? Number(fetched.widthStd) : null) || (parsed.width > 0 ? parsed.width : null) || '';
                const lStd = (Number(fetched.lengthStd) > 0 ? Number(fetched.lengthStd) : null) || (parsed.length > 0 ? parsed.length : null) || '';
                const fName = (fetched.materialType || fetched.foamName || (fetched.description ? fetched.description.trim().split(/\s+/)[0] : '')).trim();

                const descWords = fetched.description ? fetched.description.trim().split(/\s+/) : [];
                const lastWord = descWords.length > 0 ? descWords[descWords.length - 1].toUpperCase() : '';
                const detectedColor = ['BR', 'GY', 'BK', 'WH', 'BL', 'RD', 'IV'].includes(lastWord) ? lastWord : '';
                const fColor = fetched.colorName || fetched.color || detectedColor || '';

                // อัปเดตข้อมูลของ Job นี้ในการ์ด
                setJobsList(prev => prev.map((item, i) => {
                    if (i !== idx) return item;
                    return {
                        ...item,
                        jobNo: fetched.jobNo,
                        partNo: fetched.partNo || fetched.itemMst || item.partNo || '',
                        materialNo: fetched.materialNo || item.materialNo || '',
                        description: fetched.itemDescription || fetched.description || item.description || '',
                        foamName: fName || item.foamName,
                        color: fColor || item.color,
                        isSearching: false
                    };
                }));

                // ออโต้เซ็ตข้อมูลม้วนวัตถุดิบและสเปก STD ของม้วน (Job 1 เป็นงานหลัก ควบคุมสเปกม้วนแม่เสมอ)
                if (idx === 0) {
                    if (fetched.materialNo) setMaterialNo(fetched.materialNo);
                    if (fName) setFoamName(fName);
                    if (fetched.itemDescription || fetched.description) setItemDescription(fetched.itemDescription || fetched.description);
                    if (thick) {
                        setFirstSheetThick(String(thick));
                        setStdThick(String(thick));
                    }
                    if (wStd) setStdWidth(String(wStd));
                    if (lStd) setStdLength(String(lStd));
                    if (fColor) setColor(fColor);
                    if (extractedEmbossDetails?.lotDate && !embossLot) {
                        setEmbossLot(extractedEmbossDetails.lotDate);
                        if (extractedEmbossDetails.rollNo && extractedEmbossDetails.totalRolls) {
                            setEmbossRoll(String(extractedEmbossDetails.rollNo));
                            setEmbossTotalRoll(String(extractedEmbossDetails.totalRolls));
                        }
                    }
                } else if (!materialNo) {
                    if (fetched.materialNo) setMaterialNo(fetched.materialNo);
                    if (fName) setFoamName(fName);
                    if (fetched.itemDescription || fetched.description) setItemDescription(fetched.itemDescription || fetched.description);
                    if (thick && !firstSheetThick) setFirstSheetThick(String(thick));
                    if (thick && !stdThick) setStdThick(String(thick));
                    if (wStd && !stdWidth) setStdWidth(String(wStd));
                    if (lStd && !stdLength) setStdLength(String(lStd));
                    if (fColor && !color) setColor(fColor);
                    if (extractedEmbossDetails?.lotDate && !embossLot) {
                        setEmbossLot(extractedEmbossDetails.lotDate);
                        if (extractedEmbossDetails.rollNo && extractedEmbossDetails.totalRolls) {
                            setEmbossRoll(String(extractedEmbossDetails.rollNo));
                            setEmbossTotalRoll(String(extractedEmbossDetails.totalRolls));
                        }
                    }
                }

                // แจ้งเตือนกรณีวัตถุดิบต่างกันระหว่าง Job 1 กับ Job ย่อย
                if (idx > 0) {
                    const job1Mat = (jobsList[0]?.materialNo || materialNo || '').trim();
                    const curMat = (fetched.materialNo || '').trim();
                    if (job1Mat && curMat && job1Mat !== curMat) {
                        toast.warning(` Job ${idx + 1} วัตถุดิบ (${curMat}) ต่างจาก Job 1 (${job1Mat})`, { autoClose: 4000 });
                    } else {
                        toast.success(`ดึงข้อมูล Job ${idx + 1} (${fetched.jobNo}) สำเร็จ`);
                    }
                } else {
                    toast.success(`ดึงข้อมูล Job 1 (${fetched.jobNo}) สำเร็จ`);
                }

                // เลื่อนโฟกัสไปที่ช่องถัดไป (หากยังไม่ได้สแกน Lot Emboss ให้โฟกัส Lot Emboss ก่อน หรือถ้ามีแล้วไปที่ First shot)
                setTimeout(() => {
                    if (!embossLot && embossInputRef.current) {
                        embossInputRef.current?.focus();
                        embossInputRef.current?.select?.();
                    } else if (widthInputRefs.current[idx]) {
                        widthInputRefs.current[idx]?.focus();
                        widthInputRefs.current[idx]?.select?.();
                    }
                }, 100);
            } else {
                toast.warning(`ไม่พบข้อมูล Job "${query}" ในระบบ`);
                setJobsList(prev => prev.map((item, i) => i === idx ? { ...item, isSearching: false } : item));
                setFormErrors(prev => ({ ...prev, [`jobNo_${idx}`]: `ไม่พบข้อมูล Job "${query}"` }));
            }
        } catch (err) {
            console.error('[Job Search Error]:', err);
            const msg = err?.response?.data?.message || `เกิดข้อผิดพลาดในการเชื่อมต่อข้อมูล Job "${query}"`;
            toast.error(msg);
            setJobsList(prev => prev.map((item, i) => i === idx ? { ...item, isSearching: false } : item));
            setFormErrors(prev => ({ ...prev, [`jobNo_${idx}`]: msg }));
        }
    };

    // ค้นหาสเปกวัตถุดิบ Emboss เมื่อสแกนจาก QR Code (P-Number หรือ Job)
    const handleLookupEmbossMaterial = async (matNo) => {
        if (!matNo) return;
        const cleanMat = matNo.trim();
        try {
            const fetched = await fetchJobFromServer(cleanMat);
            if (fetched) {
                if (fetched.materialType || fetched.foamName) setFoamName(fetched.materialType || fetched.foamName);
                if (fetched.itemDescription || fetched.description) setItemDescription(fetched.itemDescription || fetched.description);
                const thick = (Number(fetched.firstSheetThick) > 0 ? Number(fetched.firstSheetThick) : null)
                    ?? (Number(fetched.thicknessStd) > 0 ? Number(fetched.thicknessStd) : null);
                if (thick) {
                    setStdThick(String(thick));
                    setFirstSheetThick(String(thick));
                }
                if (fetched.widthStd) setStdWidth(String(fetched.widthStd));
                if (fetched.lengthStd) setStdLength(String(fetched.lengthStd));
                if (fetched.color) setColor(fetched.color);
            }
        } catch (e) {
            console.warn('[handleLookupEmbossMaterial] Notice:', e);
        }
    };

    // ตัวแปรจับเวลาสำหรับ Debounce การสแกนบาร์โค้ด ป้องกันการตัดทอนตัวอักษรระหว่างที่สแกนเนอร์กำลังพิมพ์
    const scanTimerRef = useRef(null);

    // ประมวลผลข้อความ QR Code / Barcode ที่สแกนเข้ามาสำหรับช่อง Lot Emboss อย่างแม่นยำ
    const processScannedEmbossInput = async (rawVal) => {
        if (!rawVal || !rawVal.trim()) return;
        const cleanRaw = rawVal.trim();
        const details = CalculationService.extractEmbossDetails(cleanRaw);

        // 1. Lot No. Emboss จะเก็บเฉพาะวันที่สะอาด เช่น 2026-10-20 (ไม่มี (Roll 1/9) ติดมา)
        const cleanLot = details.lotDate || CalculationService.formatToYYYYMMDD(cleanRaw.replace(/\(.*?\)/g, '').replace(/(?:Roll|ม้วน)\s*\d+.*$/i, '').trim(), productionDate) || cleanRaw;

        let roll = '';
        let total = '';

        // 2. ม้วน และ ทั้งหมด จะแยกออกมาใส่อัตโนมัติ (หากไม่มีใน QR/Barcode ไม่ต้องใส่เลขอัตโนมัติ alert error)
        if (details.rollNo && details.totalRolls) {
            roll = String(details.rollNo).trim();
            total = String(details.totalRolls).trim();
            setEmbossRoll(roll);
            setEmbossTotalRoll(total);
        } else {
            setEmbossRoll('');
            setEmbossTotalRoll('');
            toast.error('❌ ไม่พบข้อมูลเลขม้วน (Roll) ใน Barcode/QR Code กรุณาสแกน QR Code ที่มีข้อมูลม้วนครบถ้วน', { autoClose: 5000 });
        }

        if (cleanLot) {
            setEmbossLot(cleanLot);
            // ตรวจสอบ Lot ซ้ำทันที
            const fullLot = (roll && total) ? `${cleanLot} (Roll ${roll}/${total})` : cleanLot;
            const dup = await verifyEmbossLotDuplicate(fullLot);
            if (dup) {
                toast.error(`❌ Lot Emboss "${fullLot}" ซ้ำกับ Job ${dup.jobNo} (ห้ามใช้ซ้ำ)`, { autoClose: 6000 });
            }
        }

        if (details.materialNo && (details.materialNo.toUpperCase().startsWith('P') || details.materialNo.length >= 4)) {
            setMaterialNo(details.materialNo);
            handleLookupEmbossMaterial(details.materialNo);
        }

        if (cleanLot && roll && total) {
            toast.success(`สแกน Emboss: ${cleanLot} ม้วน ${roll}/${total}${details.materialNo ? ` (วัตถุดิบ: ${details.materialNo})` : ''}`, { autoClose: 3500 });
        } else if (cleanLot) {
            toast.info(`สแกน Lot: ${cleanLot}`, { autoClose: 3000 });
        }
    };

    // เพิ่มการ์ด Job (Add Job)
    const handleAddJobCard = () => {
        setJobsList(prev => [
            ...prev,
            {
                id: prev.length + 1,
                jobNo: isManualMode ? '-' : '',
                partNo: '',
                materialNo: materialNo || '',
                description: '',
                foamName: foamName || '',
                color: color || '',
                width: '',
                qty: '',
                isSearching: false
            }
        ]);
        setTimeout(() => {
            const newIdx = jobsList.length;
            if (isManualMode && partNoInputRefs.current[newIdx]) {
                partNoInputRefs.current[newIdx]?.focus();
                partNoInputRefs.current[newIdx]?.select?.();
            } else if (jobInputRefs.current[newIdx]) {
                jobInputRefs.current[newIdx]?.focus();
                jobInputRefs.current[newIdx]?.select?.();
            }
        }, 100);
    };

    // ลบการ์ด Job (สำหรับ Job 3 ขึ้นไป)
    const handleRemoveJobCard = (idx) => {
        if (jobsList.length <= 1) return;
        setJobsList(prev => prev.filter((_, i) => i !== idx));
    };

    // ล้างข้อมูลการ์ด Job (สำหรับ Job 2 หากไม่ต้องการผลิต)
    const handleClearJobCard = (idx) => {
        setJobsList(prev => prev.map((item, i) => i === idx ? {
            ...item,
            jobNo: isManualMode ? '-' : '',
            partNo: '',
            materialNo: '',
            description: '',
            foamName: '',
            color: '',
            width: '',
            qty: '',
            isSearching: false
        } : item));
    };

    // ล้างฟอร์มทั้งหมดเพื่อเริ่มรอบใหม่
    const handleResetForm = (keepManual = false) => {
        setEditingJob(null);
        setDuplicateLotInfo(null);
        const shouldKeepManual = Boolean(keepManual && isManualMode);
        setJobsList([
            { id: 1, jobNo: shouldKeepManual ? '-' : '', partNo: '', materialNo: shouldKeepManual ? materialNo : '', description: '', foamName: shouldKeepManual ? foamName : '', color: shouldKeepManual ? color : '', width: '', qty: '', isSearching: false }
        ]);
        setEmbossLot('');
        setEmbossRoll('');
        setEmbossTotalRoll('');
        setActualFoamWidth('');
        setFirstSheetThick(shouldKeepManual ? firstSheetThick : '');
        setNgQty('0');
        if (!shouldKeepManual) {
            setMaterialNo('');
            setFoamName('');
            setStdThick('');
            setStdWidth('');
            setStdLength('');
            setColor('');
            setItemDescription('');
            setIsEditingSpecs(false);
            setIsManualMode(false);
        }
        setLotNo(getTodayLotNo(productionDate));
        setFormErrors({});
        setCalcResult({
            actualUsedQty: 0,
            remainWidth: 0,
            lossOverStd: 0,
            lossProduct: 0,
            yield: 0,
            isYieldWarning: false
        });
        setTimeout(() => {
            embossInputRef.current?.focus();
            embossInputRef.current?.select?.();
        }, 100);
    };

    // เริ่มแก้ไข Job จากประวัติ
    const handleStartEdit = (job) => {
        setEditingJob(job);
        setDuplicateLotInfo(null);
        const isManual = (
            job.jobNo === '-' ||
            !job.jobNo ||
            String(job.jobNo).toUpperCase().startsWith('MANUAL') ||
            String(job.jobNo).toUpperCase().startsWith('M-') ||
            String(job.jobNo).toUpperCase().startsWith('NO-JOB')
        );
        setIsManualMode(isManual);
        setIsEditingSpecs(isManual);

        const editJobs = (job.jobNo || '').split(',').map(s => s.trim());
        const editParts = (job.partNo || job.itemMst || job.finishedItem || '').split(',').map(s => s.trim());
        const editMats = (job.materialNo || job.MaterialNo || '').split(',').map(s => s.trim());
        const editDescs = (job.description || '').split(',').map(s => s.trim());
        const editFoams = (job.foamName || job.materialType || '').split(',').map(s => s.trim());

        if (job.embossLot) {
            const parsed = CalculationService.extractEmbossDetails(job.embossLot);
            setEmbossLot(parsed.lotDate || CalculationService.formatToYYYYMMDD(job.embossLot.replace(/\(.*?\)/g, ''), ''));
            setEmbossRoll(job.embossRoll || parsed.rollNo || '');
            setEmbossTotalRoll(job.embossTotalRoll || parsed.totalRolls || '');
        } else {
            setEmbossLot('');
            setEmbossRoll('');
            setEmbossTotalRoll('');
        }
        setActualFoamWidth(String(job.actualFoamWidth || ''));
        setFirstSheetThick(String(job.firstSheetThick || job.stdThick || ''));
        setNgQty(String(job.ng ?? 0));
        setMaterialNo(editMats[0] || '');
        setFoamName(editFoams[0] || '');
        setStdThick(String(job.stdThick || ''));
        setStdWidth(String(job.stdWidth || ''));
        setStdLength(String(job.stdLength || ''));
        setColor(job.color || job.colorName || '');
        setItemDescription(job.itemDescription || job.description || '');
        setLotNo(getTodayLotNo(job.lotNo || job.productionDate || productionDate));

        if (job.firstSheetEntries && job.firstSheetEntries.length > 0) {
            const loaded = job.firstSheetEntries.map((e, idx) => ({
                id: idx + 1,
                jobNo: e.jobNo || editJobs[idx] || (idx === 0 ? job.jobNo : ''),
                partNo: e.partNo || editParts[idx] || (idx === 0 ? job.partNo : ''),
                materialNo: e.materialNo || editMats[idx] || editMats[0] || '',
                description: e.description || editDescs[idx] || '',
                foamName: e.foamName || editFoams[idx] || editFoams[0] || '',
                color: e.color || job.color || '',
                width: String(e.width ?? ''),
                qty: String(e.qty ?? ''),
                isSearching: false
            }));
            setJobsList(loaded);
        } else if (job.firstSheetWidth2 || job.productedQty2) {
            setJobsList([
                {
                    id: 1,
                    jobNo: editJobs[0] || job.jobNo || '',
                    partNo: editParts[0] || job.partNo || '',
                    materialNo: editMats[0] || '',
                    description: editDescs[0] || '',
                    foamName: editFoams[0] || '',
                    color: job.color || '',
                    width: String(job.firstSheetWidth1 || job.firstSheetWidth || ''),
                    qty: String(job.productedQty1 || job.productedQty || ''),
                    isSearching: false
                },
                {
                    id: 2,
                    jobNo: editJobs[1] || '',
                    partNo: editParts[1] || '',
                    materialNo: editMats[1] || editMats[0] || '',
                    description: editDescs[1] || '',
                    foamName: editFoams[1] || editFoams[0] || '',
                    color: job.color || '',
                    width: String(job.firstSheetWidth2 || ''),
                    qty: String(job.productedQty2 || ''),
                    isSearching: false
                }
            ]);
        } else {
            setJobsList([
                {
                    id: 1,
                    jobNo: editJobs[0] || job.jobNo || '',
                    partNo: editParts[0] || job.partNo || '',
                    materialNo: editMats[0] || '',
                    description: editDescs[0] || '',
                    foamName: editFoams[0] || '',
                    color: job.color || '',
                    width: String(job.firstSheetWidth1 || job.firstSheetWidth || ''),
                    qty: String(job.productedQty1 || job.productedQty || ''),
                    isSearching: false
                }
            ]);
        }
        setFormErrors({});
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // โหลดข้อมูล Job เข้าโหมดแก้ไขอัตโนมัติเมื่อกดมาจากหน้าประวัติ (slit-history) หรือ URL ที่มี ID
    useEffect(() => {
        if (viewJob) {
            handleStartEdit(viewJob);
        } else if (initialJobId && allJobs && allJobs.length > 0) {
            const target = allJobs.find(j => String(j.id) === String(initialJobId) || j.jobNo === initialJobId || j.rawJobNo === initialJobId);
            if (target) {
                handleStartEdit(target);
            }
        }
    }, [initialJobId, viewJob, allJobs]);

    const handleCancelEdit = () => {
        handleResetForm();
        if (location.state?.from) {
            navigate(location.state.from);
            return;
        }
        if (initialJobId) {
            navigate('/slit-history');
        }
    };

    const handleBack = () => {
        if (location.state?.from) {
            navigate(location.state.from);
            return;
        }
        if (initialJobId || editingJob) {
            navigate('/slit-history');
            return;
        }
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/slit');
    };

    // ─────────────────────────────────────────────────────────────
    // บันทึกข้อมูล: รองรับทั้ง Job 1 เดี่ยว หรือบันทึกคู่ Job 1 + Job 2 แยกแถวใน SQL Server
    // ─────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setIsSubmitting(true);

        const errors = {};
        const missing = [];

        // 1. ตรวจสอบข้อมูลส่วนที่ 1 (ม้วนวัตถุดิบ & การตรวจวัด)
        if (!embossLot.trim()) {
            errors.embossLot = 'กรุณากรอกหรือสแกน Lot วัตถุดิบ';
            missing.push('1) Lot วัตถุดิบ (Lot Emboss)');
        } else if (!embossRoll.trim() || !embossTotalRoll.trim()) {
            errors.embossRoll = 'กรุณาสแกน QR Code ที่มีข้อมูลม้วน (Roll)';
            missing.push('เลขม้วน Emboss (Roll/ทั้งหมด)');
        } else if (duplicateLotInfo) {
            errors.embossLot = `ซ้ำกับ Job ${duplicateLotInfo.jobNo} (ห้ามใช้ซ้ำ)`;
            missing.push(`Lot Emboss ซ้ำกับ Job ${duplicateLotInfo.jobNo}`);
        } else {
            const cleanDate = CalculationService.formatToYYYYMMDD(embossLot.trim(), productionDate) || embossLot.trim();
            const formattedLot = `${cleanDate} (Roll ${embossRoll.trim()}/${embossTotalRoll.trim()})`;
            const curExcludeJob = editingJob?.jobNo || editingJob?.rawJobNo;
            const curExcludeId = editingJob?.id || editingJob?.headId;
            const localDup = findDuplicateInRecordedJobs(formattedLot, curExcludeId, curExcludeJob) || findDuplicateInRecordedJobs(embossLot.trim(), curExcludeId, curExcludeJob);
            if (localDup) {
                setDuplicateLotInfo(localDup);
                errors.embossLot = `ซ้ำกับ Job ${localDup.jobNo} (ห้ามใช้ซ้ำ)`;
                missing.push(`Lot Emboss ซ้ำกับ Job ${localDup.jobNo}`);
            } else {
                const srvDup = await checkEmbossLotDuplicateOnServer(formattedLot, curExcludeJob, curExcludeId);
                if (srvDup) {
                    setDuplicateLotInfo(srvDup);
                    errors.embossLot = `ซ้ำกับ Job ${srvDup.jobNo} (ห้ามใช้ซ้ำ)`;
                    missing.push(`Lot Emboss ซ้ำกับ Job ${srvDup.jobNo}`);
                }
            }
        }
        const numActualWidth = parseFloat(actualFoamWidth);
        if (isNaN(numActualWidth) || numActualWidth <= 0) {
            errors.actualFoamWidth = 'กรุณากรอกความกว้างโฟมจริง';
            missing.push('2) กว้างจริง (มม.)');
        }
        const numFirstSheetThick = parseFloat(firstSheetThick) || parseFloat(stdThick) || 0;

        // 2. ตรวจสอบ Job 1 (บังคับต้องมีเสมอ)
        const job1 = jobsList[0];
        if (!isManualMode && (!job1?.jobNo || !job1.jobNo.trim())) {
            errors.jobNo_0 = 'กรุณาระบุเลขที่ Job 1';
            missing.push('เลขที่ Job 1');
        }
        if (!job1?.partNo?.trim()) {
            errors.partNo_0 = 'กรุณาสแกนหรือระบุ Part No ของ Job 1';
            missing.push('Part No (Job 1)');
        }
        const job1Width = parseFloat(job1?.width);
        if (isNaN(job1Width) || job1Width <= 0) {
            errors.width_0 = 'กรุณากรอกกว้าง First shot ของ Job 1';
            missing.push('กว้าง First shot (Job 1)');
        }
        const job1Qty = parseInt(job1?.qty, 10);
        if (isNaN(job1Qty) || job1Qty <= 0) {
            errors.qty_0 = 'กรุณากรอกจำนวนที่ผลิตได้ของ Job 1';
            missing.push('จำนวนที่ผลิตได้ (Job 1)');
        }

        // 3. ตรวจสอบ Job 2 และ Job ถัดไป (ถ้ามีการกรอกข้อมูลช่องใดช่องหนึ่ง ต้องกรอกให้ครบ)
        for (let i = 1; i < jobsList.length; i++) {
            const item = jobsList[i];
            const hasAny = Boolean(item.jobNo?.trim() || item.partNo?.trim() || item.width?.trim() || item.qty?.trim());
            if (hasAny) {
                if (!isManualMode && (!item.jobNo || !item.jobNo.trim())) {
                    errors[`jobNo_${i}`] = `กรุณาระบุเลขที่ Job ${i + 1}`;
                    missing.push(`เลขที่ Job ${i + 1}`);
                }
                if (!item.partNo?.trim()) {
                    errors[`partNo_${i}`] = `กรุณาระบุ Part No ของ Job ${i + 1}`;
                    missing.push(`Part No (Job ${i + 1})`);
                }
                const w = parseFloat(item.width);
                if (isNaN(w) || w <= 0) {
                    errors[`width_${i}`] = `กรุณากรอกกว้าง First shot ของ Job ${i + 1}`;
                    missing.push(`กว้าง First shot (Job ${i + 1})`);
                }
                const q = parseInt(item.qty, 10);
                if (isNaN(q) || q <= 0) {
                    errors[`qty_${i}`] = `กรุณากรอกจำนวนที่ผลิตได้ของ Job ${i + 1}`;
                    missing.push(`จำนวนที่ผลิตได้ (Job ${i + 1})`);
                }
            }
        }

        if (missing.length > 0) {
            setFormErrors(errors);
            if (errors.embossLot && (duplicateLotInfo || errors.embossLot.includes('ซ้ำ'))) {
                toast.error(`❌ ไม่สามารถบันทึกได้: ${errors.embossLot}`, { autoClose: 6000 });
                if (embossInputRef.current) {
                    embossInputRef.current.focus();
                    embossInputRef.current.select?.();
                }
            } else {
                toast.warning(
                    <div>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#92400e', marginBottom: '4px' }}>
                            กรุณากรอกข้อมูลให้ครบถ้วน
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {missing.slice(0, 4).map((m, idx) => (
                                <span key={idx} style={{ fontSize: '11.5px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#fef3c7', color: '#b45309' }}>
                                    {m}
                                </span>
                            ))}
                            {missing.length > 4 && <span style={{ fontSize: '11px', color: '#b45309', alignSelf: 'center' }}>+ อีก {missing.length - 4} ช่อง</span>}
                        </div>
                    </div>
                );
            }
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        // Live Safety Warning: ตรวจสอบหน้ากว้างตัดรวมว่าเกินขนาดม้วนโฟมจริงหรือไม่
        const totalCut = jobsList
            .filter(j => parseFloat(j.width) > 0 && parseInt(j.qty, 10) > 0)
            .reduce((sum, j) => sum + (parseFloat(j.width) * parseInt(j.qty, 10)), 0);

        if (numActualWidth > 0 && totalCut > numActualWidth) {
            toast.warning(` คำเตือน: หน้ากว้างตัดรวม (${totalCut} มม.) เกินความกว้างโฟมจริง (${numActualWidth} มม.)!`, { autoClose: 5000 });
        }

        const effectiveLotNo = CalculationService.formatToYYYYMMDD(lotNo, productionDate) || getTodayLotNo(productionDate);
        const validJobs = jobsList.filter(j => parseFloat(j.width) > 0 && parseInt(j.qty, 10) > 0);

        // กรณีโหมดแก้ไข Job เดิม
        if (editingJob) {
            const first = validJobs[0];
            const second = validJobs[1];
            const allJobNos = validJobs.map(j => (j.jobNo?.trim() || (isManualMode ? '-' : ''))).filter(Boolean).join(', ') || (isManualMode ? '-' : '');
            const allPartNos = validJobs.map(j => (j.partNo || '').trim()).filter(Boolean).join(', ');

            const cleanRawJobNo = editingJob.rawJobNo ? editingJob.rawJobNo.split('#')[0].trim() : '';
            const isSameBaseJob = Boolean(cleanRawJobNo && cleanRawJobNo === allJobNos);
            const preservedRawJobNo = isSameBaseJob ? editingJob.rawJobNo : (allJobNos || editingJob.rawJobNo);

            const updatedJob = {
                ...editingJob,
                id: editingJob.id,
                headId: editingJob.id,
                jobNo: allJobNos || editingJob.jobNo,
                rawJobNo: preservedRawJobNo,
                originalJobNo: editingJob.rawJobNo || editingJob.jobNo,
                originalJob: editingJob.rawJobNo || editingJob.jobNo,
                partNo: allPartNos || editingJob.partNo,
                itemMst: allPartNos || editingJob.itemMst,
                finishedItem: allPartNos || editingJob.finishedItem,
                materialNo: (first?.materialNo || materialNo || '').trim(),
                itemDescription: first?.description || itemDescription || '',
                foamName: (first?.foamName || foamName || '').trim(),
                materialType: (first?.foamName || foamName || '').trim(),
                description: `${first?.foamName || foamName} ${stdThick || firstSheetThick}X${stdWidth || actualFoamWidth}X${stdLength || 200}M ${color}`.trim(),
                stdThick: parseFloat(stdThick) || parseFloat(firstSheetThick) || 0,
                stdWidth: parseFloat(stdWidth) || parseFloat(actualFoamWidth) || 0,
                stdLength: parseFloat(stdLength) || 200,
                color: first?.color || color || '',
                colorName: first?.color || color || '',
                lotNumber: effectiveLotNo,
                lotNo: effectiveLotNo,
                embossLot: (embossRoll.trim() && embossTotalRoll.trim())
                    ? `${CalculationService.formatToYYYYMMDD(embossLot.trim(), productionDate) || embossLot.trim()} (Roll ${embossRoll.trim()}/${embossTotalRoll.trim()})`
                    : CalculationService.formatEmbossLotForSave(embossLot.trim(), productionDate),
                embossRoll: embossRoll.trim(),
                embossTotalRoll: embossTotalRoll.trim(),
                actualFoamWidth: numActualWidth,
                firstSheetThick: numFirstSheetThick,
                firstSheetWidth: parseFloat(first?.width) || 0,
                firstSheetWidth1: parseFloat(first?.width) || 0,
                productedQty: parseInt(first?.qty, 10) || 0,
                productedQty1: parseInt(first?.qty, 10) || 0,
                firstSheetWidth2: second ? parseFloat(second.width) : undefined,
                productedQty2: second ? parseInt(second.qty, 10) : undefined,
                totalProductedQty: validJobs.reduce((sum, j) => sum + parseInt(j.qty, 10), 0),
                rollUsed: 1,
                firstSheetEntries: validJobs.map(j => ({
                    jobNo: (j.jobNo?.trim() || (isManualMode ? '-' : '')),
                    partNo: (j.partNo || '').trim(),
                    materialNo: (j.materialNo || materialNo || '').trim(),
                    width: parseFloat(j.width),
                    qty: parseInt(j.qty, 10)
                })),
                remainThick: stdThick || firstSheetThick,
                remainLength: stdLength || 200,
                remainWidth: calcResult.remainWidth,
                ng: parseFloat(ngQty) || 0,
                lossOverStd: calcResult.lossOverStd,
                lossProduct: calcResult.lossProduct,
                actualUsedQty: calcResult.actualUsedQty,
                yield: calcResult.yield,
                isYieldWarning: calcResult.isYieldWarning,
                operatorName,
                status: calcResult.isYieldWarning ? 'Warning' : 'Completed'
            };

            if (onUpdateJob) onUpdateJob(updatedJob);
            handleResetForm(true);
            setTimeout(() => {
                isSubmittingRef.current = false;
                setIsSubmitting(false);
            }, 500);
            return;
        }

        // กรณีสร้างรายการใหม่: บันทึก 1 ม้วน Emboss (อาจมี 1 Job หรือมากกว่า 1 Job ผ่าร่วมกันในม้วนนี้)
        const first = validJobs[0];
        const second = validJobs[1];
        const allJobNos = validJobs.map(j => (j.jobNo?.trim() || (isManualMode ? '-' : ''))).filter(Boolean).join(', ') || (isManualMode ? '-' : '');
        const allPartNos = validJobs.map(j => (j.partNo || '').trim()).filter(Boolean).join(', ');
        const cleanEmbossDate = CalculationService.formatToYYYYMMDD(embossLot.trim(), productionDate) || embossLot.trim();
        const formattedEmbossLot = (embossRoll.trim() && embossTotalRoll.trim())
            ? `${cleanEmbossDate} (Roll ${embossRoll.trim()}/${embossTotalRoll.trim()})`
            : CalculationService.formatEmbossLotForSave(embossLot.trim(), productionDate);

        const newRollJob = {
            id: `REC-${Date.now()}-1`,
            sequenceNo: nextSequenceNo,
            jobNo: allJobNos,
            rawJobNo: allJobNos,
            partNo: allPartNos,
            itemMst: allPartNos,
            finishedItem: allPartNos,
            materialNo: (first?.materialNo || materialNo || '').trim(),
            itemDescription: first?.description || itemDescription || '',
            foamName: (first?.foamName || foamName || '').trim(),
            materialType: (first?.foamName || foamName || '').trim(),
            description: `${first?.foamName || foamName} ${stdThick || firstSheetThick}X${stdWidth || actualFoamWidth}X${stdLength || 200}M ${first?.color || color}`.trim(),
            stdThick: parseFloat(stdThick) || parseFloat(firstSheetThick) || 0,
            stdWidth: parseFloat(stdWidth) || parseFloat(actualFoamWidth) || 0,
            stdLength: parseFloat(stdLength) || 200,
            color: first?.color || color || '',
            colorName: first?.color || color || '',
            lotNumber: effectiveLotNo,
            lotNo: effectiveLotNo,
            embossLot: formattedEmbossLot,
            embossRoll: embossRoll.trim(),
            embossTotalRoll: embossTotalRoll.trim(),
            productionDate: CalculationService.safeExtractDate(productionDate || new Date()),
            actualFoamWidth: numActualWidth,
            firstSheetThick: numFirstSheetThick,
            firstSheetWidth: parseFloat(first?.width) || 0,
            firstSheetWidth1: parseFloat(first?.width) || 0,
            productedQty: parseInt(first?.qty, 10) || 0,
            productedQty1: parseInt(first?.qty, 10) || 0,
            firstSheetWidth2: second ? parseFloat(second.width) : undefined,
            productedQty2: second ? parseInt(second.qty, 10) : undefined,
            totalProductedQty: validJobs.reduce((sum, j) => sum + parseInt(j.qty, 10), 0),
            rollUsed: 1, // 1 ม้วนโฟม Emboss เสมอ
            firstSheetEntries: validJobs.map(j => ({
                jobNo: (j.jobNo?.trim() || (isManualMode ? '-' : '')),
                partNo: (j.partNo || '').trim(),
                materialNo: (j.materialNo || materialNo || '').trim(),
                width: parseFloat(j.width),
                qty: parseInt(j.qty, 10)
            })),
            remainThick: stdThick || firstSheetThick,
            remainLength: stdLength || 200,
            remainWidth: calcResult.remainWidth,
            ng: parseFloat(ngQty) || 0,
            lossOverStd: calcResult.lossOverStd,
            lossProduct: calcResult.lossProduct,
            actualUsedQty: calcResult.actualUsedQty,
            yield: calcResult.yield,
            isYieldWarning: calcResult.isYieldWarning,
            operatorName,
            createdAt: new Date().toISOString(),
            status: calcResult.isYieldWarning ? 'Warning' : 'Completed'
        };

        onSaveJob(newRollJob);
        handleResetForm(true);
        setTimeout(() => {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }, 600);
    };

    return (
        <div className="animate-fadeIn w-full" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {/* ── แถบควบคุมด้านบน ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <button
                    type="button"
                    onClick={handleBack}
                    style={{
                        padding: '6px 14px',
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '6px',
                        color: '#334155',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}
                >
                    <RiArrowGoBackLine size={14} className="text-blue-600" />
                </button>

                {isReadOnly ? (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        background: '#eff6ff',
                        border: '1.5px solid #bfdbfe',
                        borderRadius: '6px',
                        color: '#1d4ed8',
                        fontSize: '13px',
                        fontWeight: 700
                    }}>
                        <span>ดูรายละเอียด Job</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{
                            display: 'inline-flex',
                            background: '#f1f5f9',
                            padding: '2px',
                            borderRadius: '6px',
                            border: '1px solid #cbd5e1'
                        }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsManualMode(false);
                                    setIsEditingSpecs(false);
                                    setFormErrors({});
                                    setJobsList(prev => prev.map(j => ({ ...j, jobNo: j.jobNo === '-' ? '' : j.jobNo })));
                                }}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: !isManualMode ? 700 : 500,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: !isManualMode ? '#1e40af' : 'transparent',
                                    color: !isManualMode ? '#ffffff' : '#64748b'
                                }}
                            >
                                สแกน Job
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsManualMode(true);
                                    setIsEditingSpecs(true);
                                    setJobsList(prev => prev.map(j => ({ ...j, jobNo: (j.jobNo && j.jobNo !== '') ? j.jobNo : '-' })));
                                }}
                                style={{
                                    padding: '4px 12px',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontWeight: isManualMode ? 700 : 500,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: isManualMode ? '#d97706' : 'transparent',
                                    color: isManualMode ? '#ffffff' : '#64748b'
                                }}
                            >
                                ไม่มี Job
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowRecentJobsModal(true)}
                            style={{
                                padding: '6px 14px',
                                background: '#1e40af',
                                border: '1px solid #1e40af',
                                borderRadius: '6px',
                                color: '#ffffff',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            รายการที่บันทึกแล้ว ({recentJobs.length})
                        </button>
                    </div>
                )}
            </div>

            {/* ───────────────────────────────────────────────────────────── */}
            {/* โครงสร้าง 2 คอลัมน์: ฝั่งซ้าย (1. ข้อมูลสั่งผลิต & วัตถุดิบ) vs ฝั่งขวา (2. การกรอกข้อมูลที่กำลังผลิต) */}
            {/* ───────────────────────────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.05fr) minmax(360px, 0.95fr)',
                gap: '10px',
                alignItems: 'start'
            }}>
                {/* ═════════════════════════════════════════════════════════════════ */}
                {/* ══ ฝั่งซ้าย: 1. ข้อมูลสั่งผลิต & วัตถุดิบ (Order & Raw Material) ══ */}
                {/* ═════════════════════════════════════════════════════════════════ */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    {/* ── ส่วนที่ 1A: ข้อมูลสั่งผลิต (Job Orders) ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {/* หัวข้อส่วนข้อมูลสั่งผลิต พร้อมปุ่ม + Job */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1.5px solid #f1f5f9',
                            paddingBottom: '6px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    background: '#1e40af',
                                    color: '#ffffff',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    fontWeight: 900
                                }}>
                                    1
                                </span>
                                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                                    ข้อมูลสั่งผลิต (Job Orders)
                                </span>
                                <span style={{
                                    fontSize: '11.5px',
                                    color: '#64748b',
                                    background: '#f1f5f9',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    fontWeight: 600
                                }}>
                                    {jobsList.length} รายการตัด
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={handleAddJobCard}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    background: '#2563eb',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(37,99,235,0.2)'
                                }}
                            >
                                <Plus size={13} />
                                <span>เพิ่ม Job</span>
                            </button>
                        </div>

                        {/* รายการ Job Cards แต่ละใบ (เฉพาะข้อมูลงานสั่งผลิต) */}
                        {jobsList.map((job, idx) => {
                            const isJob1 = idx === 0;
                            const cardTheme = isJob1 ? {
                                border: isManualMode ? '2px solid #f59e0b' : '2px solid #93c5fd',
                                bg: isManualMode ? '#fffdf7' : '#f8fbff',
                                badgeColor: isManualMode ? '#b45309' : '#1d4ed8',
                                badgeTitle: isManualMode ? 'Job 1 (โหมดไม่มี Job)' : 'Job 1 (งานหลัก)',
                                inputBorder: isManualMode ? '#d97706' : '#3b82f6',
                                btnBg: '#1d4ed8',
                                partBg: '#dbeafe',
                                partColor: '#1e3a8a'
                            } : {
                                border: isManualMode ? '2px solid #d97706' : '2px solid #c4b5fd',
                                bg: isManualMode ? '#fffdf7' : '#faf5ff',
                                badgeColor: isManualMode ? '#b45309' : '#7c3aed',
                                badgeTitle: isManualMode ? `Job ${idx + 1} (โหมดไม่มี Job)` : `Job ${idx + 1}`,
                                inputBorder: isManualMode ? '#d97706' : '#8b5cf6',
                                btnBg: '#7c3aed',
                                partBg: '#f3e8ff',
                                partColor: '#581c87'
                            };

                            return (
                                <div
                                    key={job.id || idx}
                                    style={{
                                        border: cardTheme.border,
                                        background: cardTheme.bg,
                                        borderRadius: '8px',
                                        padding: '8px 10px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px'
                                    }}
                                >
                                    {/* หัวการ์ด Job */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ fontSize: '14.5px', fontWeight: 800, color: cardTheme.badgeColor }}>
                                            {cardTheme.badgeTitle}
                                        </div>
                                        {idx >= 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveJobCard(idx)}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                                className="hover:underline transition-all"
                                            >
                                                <Trash2 size={13} />
                                                <span>ลบ Job {idx + 1}</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* ช่องกรอก / สแกน Job No. ➔ PART NO */}
                                    {isManualMode ? (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(200px, 1.8fr)',
                                            gap: '8px'
                                        }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#92400e', marginBottom: '3px' }}>
                                                    PART NO. <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    ref={el => partNoInputRefs.current[idx] = el}
                                                    type="text"
                                                    value={job.partNo || ''}
                                                    onChange={(e) => handleJobFieldChange(idx, 'partNo', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (!embossLot && embossInputRef.current) {
                                                                embossInputRef.current.focus();
                                                                embossInputRef.current.select?.();
                                                            } else {
                                                                widthInputRefs.current[idx]?.focus();
                                                                widthInputRefs.current[idx]?.select?.();
                                                            }
                                                        }
                                                    }}
                                                    placeholder="กรอก PART NO. *"
                                                    disabled={isReadOnly}
                                                    style={{
                                                        width: '100%',
                                                        height: '40px',
                                                        fontSize: '15px',
                                                        fontWeight: 800,
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        border: formErrors[`partNo_${idx}`] ? '2px solid #ef4444' : '2px solid #d97706',
                                                        background: '#ffffff',
                                                        color: '#92400e',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#78350f', marginBottom: '3px' }}>
                                                    รายละเอียดสินค้า (Description)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={job.description || ''}
                                                    onChange={(e) => handleJobFieldChange(idx, 'description', e.target.value)}
                                                    placeholder="รายละเอียด / ชื่อสินค้า (ถ้ามี)"
                                                    disabled={isReadOnly}
                                                    style={{
                                                        width: '100%',
                                                        height: '40px',
                                                        fontSize: '13px',
                                                        fontWeight: 600,
                                                        padding: '6px 10px',
                                                        borderRadius: '6px',
                                                        border: '1.5px solid #cbd5e1',
                                                        background: '#ffffff',
                                                        color: '#334155',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px',
                                            padding: '6px 10px',
                                            background: '#ffffff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px'
                                        }}>
                                            {/* แถวยิง Barcode Job No. */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <input
                                                    ref={el => jobInputRefs.current[idx] = el}
                                                    type="text"
                                                    value={job.jobNo}
                                                    onChange={(e) => handleJobFieldChange(idx, 'jobNo', e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (job.jobNo?.trim()) {
                                                                handleSearchJob(idx);
                                                            } else if (!embossLot && embossInputRef.current) {
                                                                embossInputRef.current?.focus();
                                                                embossInputRef.current?.select?.();
                                                            } else {
                                                                widthInputRefs.current[idx]?.focus();
                                                                widthInputRefs.current[idx]?.select?.();
                                                            }
                                                        }
                                                    }}
                                                    placeholder={`ยิง Barcode หรือพิมพ์ Job ${idx + 1}`}
                                                    disabled={isReadOnly}
                                                    style={{
                                                        flex: '1 1 200px',
                                                        height: '36px',
                                                        fontSize: '15px',
                                                        fontWeight: 700,
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: formErrors[`jobNo_${idx}`] ? '2px solid #ef4444' : `2px solid ${cardTheme.inputBorder}`,
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleSearchJob(idx)}
                                                    disabled={isReadOnly || job.isSearching}
                                                    style={{
                                                        height: '36px',
                                                        padding: '0 12px',
                                                        background: cardTheme.btnBg,
                                                        color: '#ffffff',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        fontSize: '12.5px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <span>{job.isSearching ? 'ค้นหา...' : 'ค้นหา'}</span>
                                                </button>
                                            </div>

                                            {/* แสดงข้อมูล PART NO & รายละเอียดสินค้า */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: '6px',
                                                background: '#f8fafc',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid #e2e8f0'
                                            }}>
                                                <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569' }}>PART NO:</span>
                                                {job.partNo ? (
                                                    <span style={{
                                                        fontSize: '14px',
                                                        fontWeight: 900,
                                                        color: cardTheme.partColor,
                                                        background: cardTheme.partBg,
                                                        padding: '2px 8px',
                                                        borderRadius: '5px',
                                                        letterSpacing: '0.5px'
                                                    }}>
                                                        {job.partNo}
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        (รอสแกน Job เพื่อดึง Part No)
                                                    </span>
                                                )}
                                                {job.description && (
                                                    <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                                                        {job.description}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── ส่วนที่ 1B: ข้อมูลวัตถุดิบ (Raw Material - ม้วนโฟม Emboss) ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1.5px solid #f1f5f9',
                            paddingBottom: '6px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    background: '#0284c7',
                                    color: '#ffffff',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    fontWeight: 900
                                }}>
                                    2
                                </span>
                                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                                    ข้อมูลวัตถุดิบ (ม้วนโฟม Emboss)
                                </span>
                            </div>
                            <span style={{
                                background: '#e0f2fe',
                                color: '#0369a1',
                                padding: '1px 6px',
                                borderRadius: '5px',
                                fontWeight: 800,
                                fontSize: '11px',
                                border: '1px solid #bae6fd'
                            }}>
                                บันทึก 1 ม้วน Emboss
                            </span>
                        </div>

                        {/* แถวที่ 1: Lot Emboss & Lot PE Roll */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
                            {/* ช่องกรอก Lot No. Emboss */}
                            <div style={{ flex: '1 1 180px', minWidth: '140px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e40af', marginBottom: '2px' }}>
                                    Lot Emboss <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    ref={embossInputRef}
                                    type="text"
                                    value={embossLot}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setEmbossLot(val);
                                        if (formErrors.embossLot) setFormErrors(prev => ({ ...prev, embossLot: undefined }));

                                        // หน่วงเวลาสั้นๆ (Debounce) ให้สแกนเนอร์พิมพ์ครบทุกตัวอักษรก่อนทำการแปลง
                                        if (val.includes('|') || val.includes('Roll') || val.includes('ม้วน') || /\d+[/]\d+/.test(val)) {
                                            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                                            scanTimerRef.current = setTimeout(() => {
                                                processScannedEmbossInput(val);
                                            }, 150);
                                        }
                                    }}
                                    onPaste={(e) => {
                                        const pasted = e.clipboardData?.getData('text') || '';
                                        if (pasted.includes('|') || pasted.includes('Roll') || pasted.includes('ม้วน') || /\d+[/]\d+/.test(pasted)) {
                                            e.preventDefault();
                                            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                                            processScannedEmbossInput(pasted);
                                        }
                                    }}
                                    onBlur={async (e) => {
                                        const val = e.target.value.trim();
                                        if (val) {
                                            if (val.includes('|') || val.includes('Roll') || val.includes('ม้วน') || /\d+[/]\d+/.test(val)) {
                                                processScannedEmbossInput(val);
                                            } else {
                                                const clean = CalculationService.formatToYYYYMMDD(val, productionDate) || val;
                                                if (clean !== val) {
                                                    setEmbossLot(clean);
                                                }
                                                const fullLot = (embossRoll && embossTotalRoll) ? `${clean} (Roll ${embossRoll}/${embossTotalRoll})` : clean;
                                                const dup = await verifyEmbossLotDuplicate(fullLot);
                                                if (dup) {
                                                    toast.error(`❌ Lot Emboss "${fullLot}" ซ้ำกับ Job ${dup.jobNo} (ห้ามใช้ซ้ำ)`, { autoClose: 5000 });
                                                }
                                            }
                                        }
                                    }}
                                    onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                                            const currentVal = embossLot.trim();
                                            if (currentVal.includes('|') || currentVal.includes('Roll') || currentVal.includes('ม้วน') || /\d+[/]\d+/.test(currentVal)) {
                                                await processScannedEmbossInput(currentVal);
                                            } else if (currentVal) {
                                                const clean = CalculationService.formatToYYYYMMDD(currentVal, productionDate) || currentVal;
                                                setEmbossLot(clean);
                                                if (!embossRoll || !embossTotalRoll) {
                                                    toast.error('❌ ไม่พบข้อมูลเลขม้วน (Roll) ใน Barcode/QR Code กรุณาสแกน QR Code ที่มีข้อมูลม้วนครบถ้วน', { autoClose: 5000 });
                                                }
                                                const fullLot = (embossRoll && embossTotalRoll) ? `${clean} (Roll ${embossRoll}/${embossTotalRoll})` : clean;
                                                const dup = await verifyEmbossLotDuplicate(fullLot);
                                                if (dup) {
                                                    toast.error(`❌ Lot Emboss "${fullLot}" ซ้ำกับ Job ${dup.jobNo} (ห้ามใช้ซ้ำ)`, { autoClose: 5000 });
                                                }
                                            }
                                            actualFoamWidthInputRef.current?.focus();
                                            actualFoamWidthInputRef.current?.select?.();
                                        }
                                    }}
                                    placeholder="สแกน Lot Emboss"
                                    disabled={isReadOnly}
                                    style={{
                                        width: '100%',
                                        height: '36px',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: formErrors.embossLot ? '2px solid #ef4444' : '2px solid #2563eb',
                                        background: '#eff6ff',
                                        color: '#1e3a8a',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                {formErrors.embossLot && (
                                    <div style={{ marginTop: '2px', fontSize: '10.5px', color: '#ef4444', fontWeight: 700 }}>
                                        {formErrors.embossLot}
                                    </div>
                                )}
                            </div>

                            {/* ช่องแสดงเลขม้วน Lot PE Roll: [ 1 / 9 ] ดีไซน์เรียบหรู คมชัด สไตล์โมเดิร์น */}
                            <div style={{ flexShrink: 0 }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e40af', marginBottom: '2px' }}>
                                    Lot PE Roll <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div
                                    title={embossRoll && embossTotalRoll ? `ม้วนที่ ${embossRoll} จากทั้งหมด ${embossTotalRoll} ม้วน` : 'เลขม้วนจากการสแกน Barcode/QR Code'}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        background: (embossRoll && embossTotalRoll) ? '#eff6ff' : '#f8fafc',
                                        padding: '0 12px',
                                        borderRadius: '6px',
                                        border: formErrors.embossRoll ? '2px solid #ef4444' : ((embossRoll && embossTotalRoll) ? '1.5px solid #93c5fd' : '1.5px solid #cbd5e1'),
                                        height: '36px',
                                        minWidth: '88px',
                                        boxSizing: 'border-box',
                                        userSelect: 'none',
                                        boxShadow: (embossRoll && embossTotalRoll) ? '0 1px 2px rgba(37,99,235,0.06)' : 'none'
                                    }}
                                >
                                    <span style={{
                                        fontSize: '15.5px',
                                        fontWeight: 900,
                                        color: embossRoll ? '#1d4ed8' : '#94a3b8',
                                        minWidth: '14px',
                                        textAlign: 'center'
                                    }}>
                                        {embossRoll || '-'}
                                    </span>
                                    <span style={{ fontSize: '14px', fontWeight: 700, color: (embossRoll && embossTotalRoll) ? '#60a5fa' : '#cbd5e1' }}>
                                        /
                                    </span>
                                    <span style={{
                                        fontSize: '15.5px',
                                        fontWeight: 900,
                                        color: embossTotalRoll ? '#1d4ed8' : '#94a3b8',
                                        minWidth: '14px',
                                        textAlign: 'center'
                                    }}>
                                        {embossTotalRoll || '-'}
                                    </span>
                                </div>
                                {formErrors.embossRoll && (
                                    <div style={{ marginTop: '2px', fontSize: '10.5px', color: '#ef4444', fontWeight: 700 }}>
                                        {formErrors.embossRoll}
                                    </div>
                                )}
                            </div>

                            {/* 3) ความกว้างโฟมจริง (mm.) */}
                            <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#0369a1', marginBottom: '2px' }}>
                                    ความกว้างโฟมจริง (mm.) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <input
                                    ref={actualFoamWidthInputRef}
                                    type="text"
                                    value={actualFoamWidth}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9.]/g, '');
                                        setActualFoamWidth(val);
                                        if (formErrors.actualFoamWidth) setFormErrors(prev => ({ ...prev, actualFoamWidth: undefined }));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (widthInputRefs.current[0]) {
                                                widthInputRefs.current[0]?.focus();
                                                widthInputRefs.current[0]?.select?.();
                                            }
                                        }
                                    }}
                                    placeholder="เช่น 1100"
                                    disabled={isReadOnly}
                                    style={{
                                        width: '100%',
                                        height: '36px',
                                        fontSize: '15.5px',
                                        fontWeight: 800,
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: formErrors.actualFoamWidth ? '2px solid #ef4444' : '2px solid #0284c7',
                                        background: '#f0f9ff',
                                        color: '#0369a1',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                {formErrors.actualFoamWidth && (
                                    <div style={{ marginTop: '2px', fontSize: '10.5px', color: '#ef4444', fontWeight: 700 }}>
                                        {formErrors.actualFoamWidth}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* แถวข้อมูลสเปกม้วนวัตถุดิบ & STD (ย่อ / ขยายได้) */}
                        {(isManualMode || isEditingSpecs) ? (
                            <div style={{
                                background: '#f8fafc',
                                border: isManualMode ? '1.5px solid #fde68a' : '1.5px solid #cbd5e1',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: isManualMode ? '#92400e' : '#334155' }}>
                                            สเปกม้วนวัตถุดิบ & STD {isManualMode ? '(กรอกเอง)' : ''}
                                        </span>
                                        {isManualMode && (
                                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#fef3c7', color: '#b45309' }}>
                                                ไม่มี Job
                                            </span>
                                        )}
                                    </div>
                                    {!isManualMode && (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingSpecs(false)}
                                            style={{ fontSize: '11.5px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                        >
                                            ย่อสเปก
                                        </button>
                                    )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                            รหัสม้วนวัตถุดิบ
                                        </label>
                                        <input
                                            type="text"
                                            value={materialNo}
                                            onChange={(e) => setMaterialNo(e.target.value)}
                                            placeholder="เช่น P-XXXXX"
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #cbd5e1',
                                                background: '#ffffff',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                            ชนิดโฟม (Foam Name)
                                        </label>
                                        <input
                                            type="text"
                                            value={foamName}
                                            onChange={(e) => setFoamName(e.target.value)}
                                            placeholder="เช่น TC-3HR"
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #cbd5e1',
                                                background: '#ffffff',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                            สีโฟม
                                        </label>
                                        <input
                                            type="text"
                                            value={color}
                                            onChange={(e) => setColor(e.target.value)}
                                            placeholder="เช่น GY"
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #cbd5e1',
                                                background: '#ffffff',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                            หนา STD
                                        </label>
                                        <input
                                            type="text"
                                            value={stdThick}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                setStdThick(val);
                                                if (!firstSheetThick) setFirstSheetThick(val);
                                            }}
                                            placeholder="มม."
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #cbd5e1',
                                                background: '#ffffff',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 800, color: '#0369a1', marginBottom: '3px' }}>
                                            กว้าง STD
                                        </label>
                                        <input
                                            type="text"
                                            value={stdWidth}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                setStdWidth(val);
                                            }}
                                            placeholder="มม."
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 800,
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #0284c7',
                                                background: '#f0f9ff',
                                                color: '#0369a1',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                                            ยาว STD
                                        </label>
                                        <input
                                            type="text"
                                            value={stdLength}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                setStdLength(val);
                                            }}
                                            placeholder="เมตร"
                                            disabled={isReadOnly}
                                            style={{
                                                width: '100%',
                                                height: '36px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: '1.5px solid #cbd5e1',
                                                background: '#ffffff',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                padding: '5px 10px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                fontSize: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                    <span>Item: <strong style={{ color: '#1e40af' }}>{materialNo || '-'}</strong></span>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <span>Foam Name: <strong style={{ color: '#047857' }}>{foamName || '-'}</strong></span>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <span>STD: <strong style={{ color: '#334155' }}>{stdThick ? `${stdThick}x${stdWidth}x${stdLength}M ${color}` : '-'}</strong></span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsEditingSpecs(true)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Pencil size={10} />
                                    <span>แก้ไขสเปก</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═════════════════════════════════════════════════════════════════ */}
                {/* ══ ฝั่งขวา: 2. การกรอกข้อมูลที่กำลังผลิต (Actual Production Entry) ══ */}
                {/* ═════════════════════════════════════════════════════════════════ */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    {/* ── ส่วนที่ 2A: การตรวจวัด & ยอดผลิตแต่ละ Job ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        {/* หัวข้อส่วนการกรอกข้อมูลที่กำลังผลิต */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: '1.5px solid #f1f5f9',
                            paddingBottom: '6px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    background: '#16a34a',
                                    color: '#ffffff',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '12px',
                                    fontWeight: 900
                                }}>
                                    3
                                </span>
                                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                                    การกรอกข้อมูลที่กำลังผลิต (ตรวจวัด & ยอดผลิต)
                                </span>
                            </div>
                        </div>

                        {/* รายการช่องกรอก First shot กว้าง & ม้วน Slit สำหรับแต่ละ Job */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {jobsList.map((job, idx) => {
                                const isJob1 = idx === 0;
                                const jobBorder = isJob1 ? '#93c5fd' : '#c4b5fd';
                                const jobBg = isJob1 ? '#f8fbff' : '#faf5ff';
                                const jobTagBg = isJob1 ? '#dbeafe' : '#f3e8ff';
                                const jobTagColor = isJob1 ? '#1e40af' : '#6b21a8';

                                return (
                                    <div
                                        key={job.id || idx}
                                        style={{
                                            border: `1.5px solid ${jobBorder}`,
                                            background: jobBg,
                                            borderRadius: '8px',
                                            padding: '6px 10px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '5px'
                                        }}
                                    >
                                        {/* แถบหัวข้อย่อยของงานตัด Job นั้น */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{
                                                    fontSize: '11.5px',
                                                    fontWeight: 900,
                                                    background: jobTagBg,
                                                    color: jobTagColor,
                                                    padding: '1px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    Job {idx + 1}
                                                </span>
                                                {job.partNo && (
                                                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155' }}>
                                                        {job.partNo}
                                                    </span>
                                                )}
                                                {job.jobNo && job.jobNo !== '-' && (
                                                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                                                        ({job.jobNo})
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 2 ช่องกรอกเคียงข้างกัน: กว้าง First shot (mm.) & ม้วน Slit ที่ผลิตได้ */}
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(2, 1fr)',
                                            gap: '8px'
                                        }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>
                                                    กว้าง First shot (mm.) <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    ref={el => widthInputRefs.current[idx] = el}
                                                    type="text"
                                                    value={job.width}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/[^0-9.]/g, '');
                                                        handleJobFieldChange(idx, 'width', val);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            qtyInputRefs.current[idx]?.focus();
                                                            qtyInputRefs.current[idx]?.select?.();
                                                        }
                                                    }}
                                                    placeholder="เช่น 69"
                                                    disabled={isReadOnly}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '16px',
                                                        fontWeight: 800,
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: formErrors[`width_${idx}`] ? '2px solid #ef4444' : `2px solid ${isJob1 ? '#3b82f6' : '#8b5cf6'}`,
                                                        background: '#ffffff',
                                                        color: '#0f172a',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                                {formErrors[`width_${idx}`] && (
                                                    <div style={{ marginTop: '2px', fontSize: '10.5px', color: '#ef4444', fontWeight: 700 }}>
                                                        {formErrors[`width_${idx}`]}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: '#1e293b', marginBottom: '2px' }}>
                                                    ม้วน Slit ที่ผลิตได้ <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <input
                                                    ref={el => qtyInputRefs.current[idx] = el}
                                                    type="text"
                                                    value={job.qty}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                                        handleJobFieldChange(idx, 'qty', val);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (idx + 1 < jobsList.length) {
                                                                widthInputRefs.current[idx + 1]?.focus();
                                                                widthInputRefs.current[idx + 1]?.select?.();
                                                            } else {
                                                                ngQtyInputRef.current?.focus();
                                                                ngQtyInputRef.current?.select?.();
                                                            }
                                                        }
                                                    }}
                                                    placeholder="เช่น 1"
                                                    disabled={isReadOnly}
                                                    style={{
                                                        width: '100%',
                                                        height: '36px',
                                                        fontSize: '16px',
                                                        fontWeight: 800,
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: formErrors[`qty_${idx}`] ? '2px solid #ef4444' : `2px solid ${isJob1 ? '#3b82f6' : '#8b5cf6'}`,
                                                        background: '#ffffff',
                                                        color: '#0f172a',
                                                        outline: 'none',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                                {formErrors[`qty_${idx}`] && (
                                                    <div style={{ marginTop: '2px', fontSize: '10.5px', color: '#ef4444', fontWeight: 700 }}>
                                                        {formErrors[`qty_${idx}`]}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* แถวช่องของเสีย NG (m.) */}
                        <div style={{
                            background: '#fffbeb',
                            border: '1.5px solid #fde68a',
                            borderRadius: '10px',
                            padding: '8px 12px'
                        }}>
                            <label style={{ display: 'block', fontSize: '14.5px', fontWeight: 800, color: '#b45309', marginBottom: '4px' }}>
                                ของเสีย NG (m.) <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                ref={ngQtyInputRef}
                                type="text"
                                value={ngQty}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9.]/g, '');
                                    setNgQty(val);
                                    if (formErrors.ngQty) setFormErrors(prev => ({ ...prev, ngQty: undefined }));
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        saveButtonRef.current?.focus();
                                    }
                                }}
                                placeholder="0"
                                disabled={isReadOnly}
                                style={{
                                    width: '100%',
                                    height: '40px',
                                    fontSize: '17px',
                                    fontWeight: 800,
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    border: '2px solid #d97706',
                                    background: '#ffffff',
                                    color: '#92400e',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    </div>

                    {/* ── ส่วนที่ 2B: สรุปผลตัวชี้วัด & แถบหน้าตัดม้วนสด (KPIs & Visual Strip) ── */}
                    <div style={{
                        background: '#ffffff',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', borderBottom: '1.5px solid #f1f5f9', paddingBottom: '4px' }}>
                            สรุปผลผลิต
                        </div>

                        {/* 📏 แถบหน้าตัดม้วน: แสดงผลภาพกราฟิกหน้าตัดม้วนโฟม (ย่อความสูงลงเหลือ 14px) */}
                        <div style={{
                            padding: '6px 10px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            {parseFloat(actualFoamWidth) > 0 && (
                                <div style={{
                                    height: '14px',
                                    borderRadius: '4px',
                                    background: '#e2e8f0',
                                    overflow: 'hidden',
                                    display: 'flex',
                                    border: '1px solid #cbd5e1'
                                }}>
                                    {jobsList.map((j, i) => {
                                        const cut = (parseFloat(j.width) || 0) * (parseInt(j.qty, 10) || 0);
                                        if (cut <= 0) return null;
                                        const pct = Math.min(100, (cut / parseFloat(actualFoamWidth)) * 100);
                                        const col = i === 0 ? '#3b82f6' : (i === 1 ? '#8b5cf6' : '#0d9488');
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    width: `${pct}%`,
                                                    background: col,
                                                    color: '#ffffff',
                                                    fontSize: '9.5px',
                                                    fontWeight: 700,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title={`Job ${i + 1}: ${cut} มม.`}
                                            >
                                                {pct >= 12 ? `J${i + 1}: ${cut}` : ''}
                                            </div>
                                        );
                                    })}
                                    {calcResult.remainWidth > 0 && (
                                        <div
                                            style={{
                                                width: `${Math.min(100, (calcResult.remainWidth / parseFloat(actualFoamWidth)) * 100)}%`,
                                                background: '#94a3b8',
                                                color: '#ffffff',
                                                fontSize: '9.5px',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title={`เหลือ ${calcResult.remainWidth} มม.`}
                                        >
                                            เหลือ {calcResult.remainWidth}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155', lineHeight: 1.3 }}>
                                แถบหน้าตัดโฟม:{' '}
                                {validEntries.map((j, i) => (
                                    <span key={i}>
                                        {i > 0 ? ' + ' : ''}
                                        [ Job {i + 1}: {(parseFloat(j.width) * parseInt(j.qty, 10))} มม. ]
                                    </span>
                                ))}
                                {validEntries.length > 0 ? ` = ${totalCutWidthMm} มม. ` : ' (รอระบุขนาดตัด) '}
                                <span style={{
                                    fontWeight: 800,
                                    color: (parseFloat(actualFoamWidth) > 0 && totalCutWidthMm === parseFloat(actualFoamWidth))
                                        ? '#15803d'
                                        : (parseFloat(actualFoamWidth) > 0 && totalCutWidthMm < parseFloat(actualFoamWidth))
                                            ? '#0284c7'
                                            : '#dc2626'
                                }}>
                                    {(parseFloat(actualFoamWidth) > 0 && totalCutWidthMm === parseFloat(actualFoamWidth))
                                        ? '(พอดีหน้ากว้างโฟมจริง)'
                                        : (parseFloat(actualFoamWidth) > 0 && totalCutWidthMm < parseFloat(actualFoamWidth) && totalCutWidthMm > 0)
                                            ? `(เหลือ ${parseFloat(actualFoamWidth) - totalCutWidthMm} มม.)`
                                            : (parseFloat(actualFoamWidth) > 0 && totalCutWidthMm > parseFloat(actualFoamWidth))
                                                ? `(เกินหน้ากว้าง ${totalCutWidthMm - parseFloat(actualFoamWidth)} มม.)`
                                                : ''}
                                </span>
                            </div>
                        </div>

                        {/* กล่องสรุปผลตัวชี้วัด 4 ช่อง เรียงแนวนอน 1 แถว 4 คอลัมน์ กระชับ สวยงาม ประหยัดพื้นที่ในแนวดิ่ง */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(4, 1fr)',
                            gap: '6px'
                        }}>
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', whiteSpace: 'nowrap' }}>หน้ากว้างเหลือ</span>
                                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px', marginTop: '2px' }}>
                                    <strong style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>{calcResult.remainWidth}</strong>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>mm.</span>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', whiteSpace: 'nowrap' }}>Loss เกิน STD</span>
                                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px', marginTop: '2px' }}>
                                    <strong style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>{calcResult.lossOverStd}</strong>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>mm.</span>
                                </div>
                            </div>

                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', whiteSpace: 'nowrap' }}>Loss ฝ่ายผลิต</span>
                                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px', marginTop: '2px' }}>
                                    <strong style={{ fontSize: '16.5px', fontWeight: 800, color: '#0f172a' }}>{calcResult.lossProduct}</strong>
                                    <span style={{ fontSize: '10px', color: '#64748b' }}>mm.</span>
                                </div>
                            </div>

                            <div style={{
                                background: (calcResult.yield >= 95 || (!calcResult.yield && validEntries.length === 0)) ? '#ecfdf5' : '#fffbeb',
                                border: (calcResult.yield >= 95 || (!calcResult.yield && validEntries.length === 0)) ? '1px solid #a7f3d0' : '1px solid #fde68a',
                                borderRadius: '8px',
                                padding: '6px 8px',
                                textAlign: 'center'
                            }}>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: (calcResult.yield >= 95 || (!calcResult.yield && validEntries.length === 0)) ? '#047857' : '#b45309', display: 'block', whiteSpace: 'nowrap' }}>
                                    % Yield
                                </span>
                                <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '2px', marginTop: '2px' }}>
                                    <strong style={{
                                        fontSize: '16.5px',
                                        fontWeight: 900,
                                        color: (calcResult.yield >= 95 || (!calcResult.yield && validEntries.length === 0)) ? '#15803d' : '#b45309'
                                    }}>
                                        {calcResult.yield ? `${calcResult.yield}%` : '-'}
                                    </strong>
                                </div>
                                <div style={{
                                    fontSize: '9.5px',
                                    fontWeight: 800,
                                    color: (calcResult.yield >= 95) ? '#15803d' : '#b45309',
                                    marginTop: '1px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {(calcResult.yield >= 95) ? 'ผ่านเกณฑ์' : (calcResult.yield ? 'ต่ำกว่าเป้า' : '')}
                                </div>
                            </div>
                        </div>

                        {/* ปุ่มบันทึกข้อมูล */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                            <button
                                ref={saveButtonRef}
                                type="button"
                                disabled={isSubmitting || isReadOnly}
                                onClick={handleSave}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                    }
                                }}
                                style={{
                                    height: '42px',
                                    width: '100%',
                                    background: isSubmitting ? '#94a3b8' : (editingJob ? '#c2410c' : '#16a34a'),
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '16px',
                                    fontWeight: 900,
                                    cursor: (isSubmitting || isReadOnly) ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: isSubmitting ? 'none' : '0 2px 8px rgba(22, 163, 74, 0.3)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <CheckCircle2 size={19} />
                                <span>{isSubmitting ? 'กำลังบันทึก...' : (editingJob ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล')}</span>
                            </button>

                            {editingJob && (
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    style={{
                                        height: '34px',
                                        width: '100%',
                                        background: '#ffffff',
                                        border: '1.5px solid #cbd5e1',
                                        borderRadius: '6px',
                                        color: '#64748b',
                                        fontSize: '12.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    ยกเลิกการแก้ไข
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Modal Dialog: รายการที่บันทึกแล้ว ── */}
            {showRecentJobsModal && (
                <div className="modal-backdrop animate-fadeIn" style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '1rem', zIndex: 9999
                }} onClick={() => setShowRecentJobsModal(false)}>
                    <div
                        style={{
                            background: 'white',
                            borderRadius: '16px',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)',
                            border: '1px solid #cbd5e1',
                            width: '98vw',
                            maxWidth: '1750px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{
                            padding: '14px 20px',
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
                                            {recentJobs.length} รายการ
                                        </span>
                                    </h3>
                                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                                        คลิกไอคอนดินสอ ✏️ เพื่อดึงข้อมูล Job กลับขึ้นไปแก้ไขที่ฟอร์ม
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

                                <button
                                    type="button"
                                    onClick={() => setShowRecentJobsModal(false)}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        border: '1px solid #e2e8f0', background: 'white',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: '#64748b', fontSize: '15px', fontWeight: 700
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
                            {recentJobs.length === 0 ? (
                                <div style={{ padding: '48px 20px', textAlign: 'center', color: '#94a3b8' }}>
                                    <FileSpreadsheet size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                                    <p style={{ fontSize: '14px', fontWeight: 600 }}>ยังไม่มีรายการที่บันทึกในรอบวันนี้</p>
                                </div>
                            ) : (
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
                                        <thead>
                                            <tr style={{ background: '#f1f5f9', color: '#1e293b', fontWeight: 700 }}>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '60px' }}>จัดการ</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '40px' }}>ลำดับ</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '90px' }}>เลขที่ Job</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '95px' }}>PART NO.</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '95px' }}>MATERIAL NO.</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '75px' }}>FOAM NAME</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '70px' }}>กว้างโฟมจริง</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '50px' }}>STD หนา</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '50px' }}>STD กว้าง</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '50px' }}>STD ยาว</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '85px' }}>LOT NO.</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '65px' }}>ม้วน LOT</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '60px' }}>First Shot กว้าง</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '50px' }}>จำนวนโฟม</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '60px' }}>ยอดผลิต (PCS)</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '45px' }}>NG (m)</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '60px' }}>เหลือกว้าง</th>
                                                <th style={{ padding: '6px 8px', border: '1px solid #cbd5e1', minWidth: '60px' }}>% Yield</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...recentJobs].sort((a, b) => a.sequenceNo - b.sequenceNo).map((job, idx) => (
                                                <tr key={job.id} style={{ borderBottom: '1px solid #e2e8f0', background: job.isYieldWarning ? '#fff1f2' : 'transparent' }}>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => { handleStartEdit(job); setShowRecentJobsModal(false); }}
                                                                style={{ padding: '4px', border: 'none', background: 'transparent', color: '#2563eb', cursor: 'pointer' }}
                                                                title="แก้ไข"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setSelectedStickerRoll(job); setShowStickerModal(true); }}
                                                                style={{ padding: '4px', border: 'none', background: 'transparent', color: '#ea580c', cursor: 'pointer' }}
                                                                title="พิมพ์สติกเกอร์"
                                                            >
                                                                <Printer size={14} />
                                                            </button>
                                                            {onDeleteJob && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setDeleteModalState({
                                                                            isOpen: true,
                                                                            jobId: job.id,
                                                                            jobNo: job.jobNo || '',
                                                                            sequenceNo: job.sequenceNo || (idx + 1),
                                                                            isClearAll: false,
                                                                        });
                                                                    }}
                                                                    style={{ padding: '4px', border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}
                                                                    title="ลบ"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{job.sequenceNo || (idx + 1)}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#1e40af' }}>{job.jobNo}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{job.partNo || job.itemMst || '-'}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.materialNo || '-'}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.foamName || '-'}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{job.actualFoamWidth}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.stdThick}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.stdWidth}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.stdLength}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>
                                                        {(() => {
                                                            const rawLot = job.embossLot || job.lotNumber || job.lotNo;
                                                            const details = CalculationService.extractEmbossDetails(rawLot);
                                                            return details?.lotDate || CalculationService.formatLotNoToAD(rawLot, job.date || job.createdAt) || '-';
                                                        })()}
                                                    </td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 800, color: '#1d4ed8' }}>
                                                        {(() => {
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
                                                        })()}
                                                    </td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700, color: '#1e40af' }}>
                                                        {job.firstSheetEntries && job.firstSheetEntries.length > 1
                                                            ? job.firstSheetEntries.map(e => e.width).join(', ')
                                                            : (job.firstSheetEntries?.[0]?.width ?? job.firstSheetWidth1 ?? job.firstSheetWidth ?? '-')}
                                                    </td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0' }}>{job.rollUsed || 1}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 800, color: '#15803d' }}>
                                                        {job.firstSheetEntries && job.firstSheetEntries.length > 1
                                                            ? `${job.firstSheetEntries.map(e => e.qty).join(', ')} (${(job.totalProductedQty || job.firstSheetEntries.reduce((s, e) => s + (parseInt(e.qty, 10) || 0), 0)).toLocaleString()})`
                                                            : (job.totalProductedQty ?? job.firstSheetEntries?.[0]?.qty ?? job.productedQty1 ?? job.productedQty ?? '-')}
                                                    </td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', color: '#dc2626', fontWeight: 700 }}>{job.ng || 0}</td>
                                                    <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 700 }}>{job.remainWidth}</td>
                                                    <td style={{
                                                        padding: '6px 8px', border: '1px solid #e2e8f0', fontWeight: 900,
                                                        color: job.isYieldWarning ? '#dc2626' : '#15803d'
                                                    }}>
                                                        {job.yield}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div style={{
                            padding: '10px 20px',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            background: '#f8fafc'
                        }}>
                            <button
                                type="button"
                                onClick={() => setShowRecentJobsModal(false)}
                                style={{
                                    padding: '6px 16px', fontSize: '13px', fontWeight: 600,
                                    borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', cursor: 'pointer'
                                }}
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal ยืนยันการลบ */}
            <ConfirmModal
                isOpen={deleteModalState.isOpen}
                onClose={() => setDeleteModalState({ isOpen: false, jobId: null, jobNo: '', sequenceNo: '', isClearAll: false })}
                onConfirm={() => {
                    if (deleteModalState.isClearAll) {
                        onClearAll?.();
                        setShowRecentJobsModal(false);
                        toast.info('ล้างรายการทั้งหมดเรียบร้อย');
                    } else if (deleteModalState.jobId) {
                        onDeleteJob?.(deleteModalState.jobId, deleteModalState.jobNo);
                    }
                    setDeleteModalState({ isOpen: false, jobId: null, jobNo: '', sequenceNo: '', isClearAll: false });
                }}
                title={deleteModalState.isClearAll ? "ยืนยันการล้างรายการทั้งหมด" : "ยืนยันการลบข้อมูล Job"}
                message={
                    deleteModalState.isClearAll
                        ? "คุณแน่ใจหรือไม่ว่าต้องการล้างรายการที่บันทึกไว้ทั้งหมดออกจากระบบ?"
                        : `คุณแน่ใจหรือไม่ว่าต้องการลบ Job #${deleteModalState.sequenceNo} (${deleteModalState.jobNo}) ออกจากรายงาน?`
                }
                subMessage="การกระทำนี้ไม่สามารถเรียกคืนข้อมูลได้"
                confirmText={deleteModalState.isClearAll ? "ล้างรายการทั้งหมด" : "ลบข้อมูล"}
                cancelText="ยกเลิก"
            />

            {/* Modal พิมพ์ฉลากสติกเกอร์ */}
            {showStickerModal && (
                <SlitStickerModal
                    isOpen={showStickerModal}
                    onClose={() => {
                        setShowStickerModal(false);
                        setSelectedStickerRoll(null);
                    }}
                    jobData={selectedStickerRoll || {
                        jobNo: jobsList[0]?.jobNo || '',
                        partNo: jobsList[0]?.partNo || '',
                        description: `${foamName || ''} ${stdThick || ''}X${stdWidth || ''}X${stdLength || ''}M ${color || ''}`.trim(),
                        productionDate: productionDate || lotNo || getTodayLotNo(),
                        lotNo: (embossLot && embossRoll && embossTotalRoll) ? `${embossLot} (Roll ${embossRoll}/${embossTotalRoll})` : (embossLot || lotNo || getTodayLotNo()),
                        stdRollLength: stdLength || '200',
                        totalMeters: stdLength || '200',
                        firstSheetEntries: jobsList.filter(e => Number(e.qty) > 0 || Number(e.width) > 0),
                        rolls: recentJobs || []
                    }}
                    initialRollNo={selectedStickerRoll ? (selectedStickerRoll.sequenceNo || selectedStickerRoll.runNo || null) : null}
                />
            )}
        </div>
    );
};

export const CreateSlit = (props) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const context = useSlit();

    const todayDateStr = CalculationService.getCurrentDateString();
    const allJobs = props.recentJobs || context.jobs || [];
    const todayJobs = allJobs.filter((job) => {
        const jDate = CalculationService.safeExtractDate(job);
        return jDate === todayDateStr;
    });

    const header = props.header || context.header;
    const productionDate = header?.date || todayDateStr;
    const operatorName = props.operatorName || header?.operatorName || 'Operator';
    const nextSequenceNo = props.nextSequenceNo || (todayJobs.length + 1);

    const convertJobToSaveRequest = (job) => {
        const targetJobKey = (job.rawJobNo || job.jobNo || '').trim() || '-';
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
            job: targetJobKey,
            partNo: job.partNo || '',
            materialNo: job.materialNo || '',
            description: job.description || '',
            stdThick: safeNum(job.stdThick),
            stdWidth: safeNum(job.stdWidth),
            stdLength: safeNum(job.stdLength),
            productDate: (job.createdAt && !job.createdAt.endsWith('00:00:00'))
                ? job.createdAt
                : (job.productionDate && !job.productionDate.includes('T')
                    ? (job.productionDate + 'T' + new Date().toTimeString().split(' ')[0])
                    : (job.productionDate || new Date().toISOString())),
            lotNumber: CalculationService.formatEmbossLotForSave(job.lotNumber || job.lotNo || ''),
            lotNo: CalculationService.formatEmbossLotForSave(job.lotNumber || job.lotNo || ''),
            employeeName: job.operatorName || operatorName || ''
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
                    job: targetJobKey,
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
            originalJob: job.originalJob || job.originalJobNo || (job.rawJobNo && job.rawJobNo !== targetJobKey ? job.rawJobNo : undefined)
        };
    };

    const saveToServer = async (job, isEdit = false) => {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const converted = convertJobToSaveRequest(job);
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
            const response = await axios.put(`${apiBase}/api/slit/update`, payload, {
                headers,
                timeout: 10000
            });
            return response.data;
        } else {
            const response = await axios.post(`${apiBase}/api/slit/save`, payload, {
                headers,
                timeout: 10000
            });
            return response.data;
        }
    };

    const saveBatchToServer = async (jobsArray) => {
        const apiBase = import.meta.env.VITE_API_URL || '';
        const requests = jobsArray.map(j => {
            const converted = convertJobToSaveRequest(j);
            return {
                ...converted,
                isEdit: false
            };
        });
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
        try {
            const response = await axios.post(`${apiBase}/api/slit/save-batch`, requests, {
                headers,
                timeout: 15000
            });
            return response.data;
        } catch (err) {
            if (err?.response?.status === 409) {
                throw err;
            }
            console.warn('[saveBatchToServer] save-batch error, falling back to individual saves', err);
            const savedJobResults = [];
            for (const j of jobsArray) {
                const singleRes = await saveToServer(j, false);
                savedJobResults.push(singleRes?.job || j.jobNo);
            }
            return { message: 'บันทึกเรียบร้อย', jobs: savedJobResults };
        }
    };

    const handleSaveJob = async (jobOrJobs) => {
        if (props.onSaveJob) {
            props.onSaveJob(jobOrJobs);
            return;
        }

        if (Array.isArray(jobOrJobs)) {
            try {
                const saveRes = await saveBatchToServer(jobOrJobs);
                const savedJobs = saveRes?.jobs || [];
                jobOrJobs.forEach((job, idx) => {
                    const serverJobNo = savedJobs[idx] || job.jobNo;
                    const finalizedJob = {
                        ...job,
                        jobNo: serverJobNo,
                        rawJobNo: serverJobNo
                    };
                    context.addJob(finalizedJob, true);
                    ActivityLogService.logActivity({
                        module: 'SLIT',
                        job: serverJobNo,
                        actionType: ACTION_TYPES.SAVE_JOB,
                        details: `บันทึก Job SLIT: Part ${job.partNo || '-'}, ยอดผลิต ${(job.totalProductedQty || job.productedQty || 0).toLocaleString()} PCS`
                    });
                });
                toast.success(`บันทึกข้อมูล (${savedJobs.join(', ')}) สำเร็จ!`);
            } catch (err) {
                console.error('[SQL Server Save Error]', err);
                const status = err?.response?.status;
                const msg = err?.response?.data?.message || err?.message || 'ไม่สามารถเชื่อมต่อ Server ได้';
                if (status === 409) {
                    toast.error(`❌ ${msg}`, { autoClose: 6000 });
                } else {
                    toast.error(`❌ เกิดข้อผิดพลาดในการบันทึก: ${msg}`);
                }
            }
            return;
        }

        const job = jobOrJobs;
        try {
            const saveRes = await saveToServer(job, false);
            const serverJobNo = saveRes?.job || job.jobNo;
            const finalizedJob = {
                ...job,
                jobNo: serverJobNo,
                rawJobNo: serverJobNo
            };
            context.addJob(finalizedJob, true);
            toast.success(`บันทึกข้อมูล (Job ${serverJobNo}) สำเร็จ!`);

            ActivityLogService.logActivity({
                module: 'SLIT',
                job: serverJobNo,
                actionType: ACTION_TYPES.SAVE_JOB,
                details: `บันทึก Job SLIT: Part ${job.partNo || '-'}, ยอดผลิต ${(job.totalProductedQty || job.productedQty || 0).toLocaleString()} PCS`
            });
        } catch (err) {
            console.error('[SQL Server Save Error]', err);
            const status = err?.response?.status;
            const resData = err?.response?.data;
            let msg = resData?.message || err?.message || 'ไม่สามารถเชื่อมต่อ Server ได้';
            if (resData?.errors) {
                const validationMsgs = Object.entries(resData.errors).map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`).join(' | ');
                msg += ` (${validationMsgs})`;
            }
            if (status === 409) {
                toast.error(`❌ ${msg}`, { autoClose: 6000 });
                return;
            }
            toast.warning(`เกิดข้อผิดพลาดในการบันทึก: ${msg}`);
        }
    };

    const handleUpdateJob = async (job) => {
        if (!isOfficer && isPastJob) {
            toast.warning('ไม่สามารถแก้ไข Job ย้อนหลังได้ เนื่องจากเกินกำหนดวัน (สิทธิ์เฉพาะ Foreman / Office)');
            return;
        }

        if (props.onUpdateJob) {
            props.onUpdateJob(job);
            return;
        }

        try {
            await saveToServer(job, true);
            context.updateJob(job, true);
            toast.success(`อัปเดตข้อมูล (Job ${job.jobNo}) สำเร็จ!`);

            ActivityLogService.logActivity({
                module: 'SLIT',
                job: job.jobNo,
                actionType: ACTION_TYPES.EDIT_JOB,
                details: `แก้ไขข้อมูล Job SLIT: Part ${job.partNo || '-'}, ยอดผลิต ${(job.totalProductedQty || job.productedQty || 0).toLocaleString()} PCS`
            });

            if (id) {
                navigate('/slit-history');
            }
        } catch (err) {
            console.error('[SQL Server Update Error]', err);
            const status = err?.response?.status;
            const resData = err?.response?.data;
            const msg = resData?.message || err?.message || 'ไม่สามารถเชื่อมต่อ Server ได้';
            const detailError = resData?.error ? ` (${resData.error})` : '';
            if (status === 409) {
                toast.error(`❌ ${msg}`, { autoClose: 6000 });
                return;
            }
            toast.warning(`อัปเดตไม่สำเร็จ: ${msg}${detailError}`);
        }
    };

    const handleDeleteJob = async (jobId, targetJobNo) => {
        if (props.onDeleteJob) {
            props.onDeleteJob(jobId, targetJobNo);
            return;
        }

        const jobObj = allJobs.find(j => String(j.id) === String(jobId) || j.jobNo === targetJobNo || j.rawJobNo === targetJobNo);
        const jNo = targetJobNo || jobObj?.jobNo || jobObj?.rawJobNo;
        const safeId = (typeof jobId === 'number') ? jobId : (jobObj?.id || (/^\d+$/.test(String(jobId)) ? parseInt(jobId, 10) : undefined));

        try {
            const apiBase = import.meta.env.VITE_API_URL || '';
            const token = localStorage.getItem('token');
            const headers = {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            };
            await axios.delete(`${apiBase}/api/slit`, {
                params: {
                    job: jNo || undefined,
                    id: safeId || undefined
                },
                headers,
                timeout: 10000
            });
        } catch (err) {
            console.error('[SQL Server Delete Error]', err);
        }

        await context.deleteJob(jobId, jNo);
        toast.info('ลบข้อมูลเรียบร้อย');

        if (jNo) {
            ActivityLogService.logActivity({
                module: 'SLIT',
                job: jNo,
                actionType: ACTION_TYPES.DELETE_JOB,
                details: `ลบ Job SLIT: ${jNo}`
            });
        }
    };

    const isOfficer = isOfficerUser();
    const targetJob = props.viewJob || location.state?.viewJob || (id ? allJobs.find(j => String(j.id) === String(id) || j.jobNo === id || j.rawJobNo === id) : null);
    const targetJobDate = targetJob ? CalculationService.safeExtractDate(targetJob) : '';
    const isPastJob = Boolean(targetJobDate && targetJobDate < todayDateStr);
    const shouldBeReadOnly = Boolean(props.isReadOnly || location.state?.readOnly || (!isOfficer && isPastJob));

    return (
        <ActiveJobPanel
            onSaveJob={handleSaveJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onClearAll={props.onClearAll || context.clearAllJobs}
            operatorName={operatorName}
            nextSequenceNo={nextSequenceNo}
            recentJobs={todayJobs}
            allJobs={allJobs}
            showToast={props.showToast || toast.info}
            initialJobId={id}
            productionDate={productionDate}
            isReadOnly={shouldBeReadOnly}
            viewJob={props.viewJob || location.state?.viewJob}
        />
    );
};

export default CreateSlit;
