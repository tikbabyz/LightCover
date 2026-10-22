import React from 'react';
import {
    Document,
    Page,
    Text as PdfText,
    View,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import { CalculationService, extractCleanProductName } from '../../../services/calculationService';
import { isOfficerUser, getDisplayName } from '../../../services/authHelper';
import { extractLostTimeAndGeneralNote } from '../../../context/IpoTubeContext';

const getMinutesDiff = (start, end) => {
    if (!start || !end) return 0;
    try {
        const [sH, sM] = String(start).split(':').map(Number);
        const [eH, eM] = String(end).split(':').map(Number);
        if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff < 0) diff += 24 * 60;
        return diff;
    } catch {
        return 0;
    }
};

const formatDurationHoursMinutes = (totalMins) => {
    if (!totalMins || totalMins <= 0) return '-';
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins % 60);
    if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
    if (h > 0) return `${h} ชม.`;
    return `${m} นาที`;
};

const formatDecimalHours = (totalMins) => {
    if (!totalMins || totalMins <= 0) return '-';
    const hrs = totalMins / 60;
    return parseFloat(hrs.toFixed(2)).toString();
};

// Helper component to fix react-pdf Thai Sara Am ('ำ' U+0E33) truncation bug
// react-pdf decomposes U+0E33 into U+0E4D + U+0E32 (2 glyphs), but retains length 1,
// causing the last character of words like 'ลำดับ' -> 'ลำดั' and 'จำนวน' -> 'จำนว' to be truncated.
const fixThaiText = (child) => {
    if (child === null || child === undefined) return child;
    if (typeof child === 'string') {
        return child.replace(/\u0E33/g, '\u0E4D\u0E32');
    }
    if (typeof child === 'number') {
        return child;
    }
    if (Array.isArray(child)) {
        return React.Children.map(child, fixThaiText);
    }
    if (React.isValidElement(child) && child.props && child.props.children) {
        return React.cloneElement(child, {
            children: fixThaiText(child.props.children),
        });
    }
    return child;
};

const Text = ({ children, ...props }) => (
    <PdfText {...props}>{fixThaiText(children)}</PdfText>
);

// Register Sarabun font
Font.register({
    family: 'Sarabun',
    fonts: [
        {
            src: '/fonts/Sarabun-Regular.ttf',
            fontWeight: 400,
        },
        {
            src: '/fonts/Sarabun-Bold.ttf',
            fontWeight: 700,
        },
    ],
});

const styles = StyleSheet.create({
    page: {
        fontFamily: 'Sarabun',
        paddingTop: 8,
        paddingHorizontal: 10,
        paddingBottom: 6,
        fontSize: 5.5,
        lineHeight: 1.15,
        backgroundColor: '#FFFFFF',
        flexDirection: 'column',
        height: '100%',
    },

    // 1. Header Grid (Standard from Slit)
    headerContainer: {
        marginBottom: 6,
        paddingHorizontal: 2,
    },
    headerSubRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    headerLeft: {
        width: '35%',
        flexDirection: 'column',
    },
    headerRight: {
        width: '35%',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
    },
    headerDateRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    deptText: {
        fontSize: 9.5,
        fontWeight: 700,
        color: '#000',
        lineHeight: 1.3,
    },
    machineText: {
        fontSize: 8,
        fontWeight: 700,
        color: '#000',
        lineHeight: 1.3,
        marginTop: 1,
    },
    title: {
        fontSize: 15,
        fontWeight: 700,
        textAlign: 'center',
        letterSpacing: 0.5,
        color: '#000',
        lineHeight: 1.3,
        marginBottom: 4,
    },
    dateLabel: {
        fontSize: 8,
        fontWeight: 700,
        color: '#000',
        lineHeight: 1.3,
    },
    dateValue: {
        fontSize: 7,
        color: '#000',
        lineHeight: 1.3,
        marginLeft: 4,
    },

    // Page Number (Top Right Corner)
    pageNumberTopRight: {
        position: 'absolute',
        top: 6,
        right: 10,
        fontSize: 7.5,
        fontWeight: 700,
        color: '#000',
        fontFamily: 'Sarabun',
    },

    // 2. Table Container (Container with full outer borders on all 4 sides for continuous left/right/top/bottom borders)
    tableContainer: {
        flexDirection: 'column',
        marginTop: 4,
        flex: 1,
        borderWidth: 0.8,
        borderColor: '#000',
    },

    // Table Header Row (Bottom border only; outer borders provided by tableContainer)
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 0.8,
        borderColor: '#000',
        alignItems: 'stretch',
        minHeight: 33,
    },
    thCellFull: {
        borderRightWidth: 0.6,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 2,
        paddingHorizontal: 0.2,
    },
    thGroupCol: {
        borderRightWidth: 0.6,
        borderColor: '#000',
        flexDirection: 'column',
    },
    thGroupTop: {
        borderBottomWidth: 0.6,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        height: 10,
        paddingHorizontal: 0.5,
    },
    thSubRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        flex: 1,
    },
    thSubCell: {
        borderRightWidth: 0.5,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 0.5,
        paddingHorizontal: 0.2,
    },
    thProdTier: {
        borderBottomWidth: 0.5,
        borderColor: '#000',
        height: 8.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    thTextMain: {
        fontSize: 5.0,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.15,
    },
    thTextSub: {
        fontSize: 3.8,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.05,
    },
    thTextSubBold: {
        fontSize: 4.5,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
    },

    // Table Data Row Styles (Bottom border only; outer borders provided by tableContainer)
    dataRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderColor: '#000',
        minHeight: 13.5,
        alignItems: 'stretch',
    },
    td: {
        borderRightWidth: 0.5,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 0.5,
        paddingHorizontal: 0.3,
        overflow: 'hidden',
    },
    tdText: {
        fontSize: 5.2,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.1,
    },
    tdBold: {
        fontSize: 5.2,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
    },

    // 3. Footer Section (Pinned to Bottom of Page with clean boundary borders)
    footerWrapper: {
        marginTop: 'auto',
        flexDirection: 'column',
        width: '100%',
        borderTopWidth: 0.8,
        borderColor: '#000',
    },
    kpiContainer: {
        borderBottomWidth: 0.8,
        borderColor: '#000',
        minHeight: 38,
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    kpiLeftCol: {
        width: '50%',
        borderRightWidth: 0.8,
        borderColor: '#000',
        paddingHorizontal: 6,
        paddingVertical: 3.5,
        flexDirection: 'column',
    },
    kpiRightCol: {
        width: '50%',
        paddingHorizontal: 6,
        paddingVertical: 3.5,
        flexDirection: 'column',
    },
    kpiHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 2,
    },
    kpiTitle: {
        fontSize: 7.2,
        fontWeight: 700,
        color: '#000',
        marginBottom: 3,
    },
    kpiContentRow: {
        flexDirection: 'column',
        gap: 2,
    },
    kpiLine: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
    },
    kpiTextBold: {
        fontSize: 6.8,
        fontWeight: 700,
        color: '#000',
        lineHeight: 1.25,
    },
    kpiText: {
        fontSize: 6.8,
        color: '#000',
        lineHeight: 1.25,
    },

    // 4. Summary Row (4 Columns Spanning 100% Width)
    summaryGridRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderColor: '#000',
        minHeight: 22,
        alignItems: 'stretch',
    },
    summaryCell: {
        width: '25%',
        borderRightWidth: 0.8,
        borderColor: '#000',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    summaryLabel: {
        fontSize: 6.8,
        fontWeight: 700,
        color: '#000',
        marginRight: 4,
    },
    summaryDottedWrapper: {
        flex: 1,
        borderBottomWidth: 0.8,
        borderBottomStyle: 'dotted',
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        height: 12,
        marginHorizontal: 2,
    },
    summaryValueText: {
        fontSize: 7.2,
        fontWeight: 700,
        color: '#000',
        textAlign: 'center',
    },
    summaryUnit: {
        fontSize: 6.5,
        color: '#000',
        marginLeft: 4,
    },

    // 5. Signatures Row (4 Columns Spanning 100% Width)
    signaturesGridRow: {
        flexDirection: 'row',
        borderColor: '#000',
        minHeight: 30,
        alignItems: 'stretch',
    },
    sigCell: {
        width: '25%',
        borderRightWidth: 0.8,
        borderColor: '#000',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 4,
    },
    sigTitle: {
        fontSize: 6.8,
        fontWeight: 700,
        color: '#000',
        marginRight: 4,
    },
    sigDottedWrapper: {
        flex: 1,
        borderBottomWidth: 0.8,
        borderBottomStyle: 'dotted',
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        height: 14,
    },
    sigNameText: {
        fontSize: 6.8,
        fontWeight: 700,
        color: '#000',
        textAlign: 'center',
    },

    // Footer Form Code
    formCodeContainer: {
        marginTop: 2,
        alignItems: 'flex-end',
    },
    formCodeText: {
        fontSize: 5.5,
        fontWeight: 700,
        color: '#000',
    },
});

// Dynamic Group Widths (Sum = 100%)
const getGroupWidths = (showDateCol) => showDateCol ? {
    item: '2.0%',
    date: '4.8%',
    job: '4.4%',
    partNo: '5.2%',
    prodName: '3.8%',
    rawMaterials: '17.4%',
    inspection: '16.2%',
    machineSettings: '10.8%',
    prodTime: '12.0%',
    product: '4.0%',
    defects: '19.4%',
} : {
    item: '2.2%',
    date: '0%',
    job: '4.8%',
    partNo: '5.5%',
    prodName: '4.0%',
    rawMaterials: '18.4%',
    inspection: '17.1%',
    machineSettings: '11.4%',
    prodTime: '12.6%',
    product: '4.0%',
    defects: '20.0%',
};

// Dynamic Data Cell Widths (Sum = 100%)
const getColWidths = (showDateCol) => showDateCol ? {
    item: '2.0%',
    date: '4.8%',
    job: '4.4%',
    partNo: '5.2%',
    prodName: '3.8%',
    // วัตถุดิบ (17.4%) -> 5 cols: tapTube 2.8%, lotNoTap 4.8%, embossSlit 2.8%, lotNoEmboss 4.4%, rollSlit 2.6%
    tapTube: '2.8%',
    lotNoTap: '4.8%',
    embossSlit: '2.8%',
    lotNoEmboss: '4.4%',
    rollSlit: '2.6%',
    // การตรวจสอบ (16.2%) -> 9 cols @ 1.8%
    id1: '1.8%',
    id2: '1.8%',
    idAvg: '1.8%',
    t1: '1.8%',
    t2: '1.8%',
    t3: '1.8%',
    t4: '1.8%',
    tAvg: '1.8%',
    judgement: '1.8%',
    // การตั้งค่าเครื่องจักร (10.8%) -> 6 cols @ 1.8%
    speed: '1.8%',
    temp1: '1.8%',
    temp2: '1.8%',
    temp3: '1.8%',
    temp4: '1.8%',
    tempPipe: '1.8%',
    // เวลาการผลิต (12.0%) -> 5 cols
    startTime: '2.2%',
    endTime: '2.2%',
    totalTime: '2.5%',
    lostHours: '2.5%',
    netWorkTime: '2.6%',
    // PRODUCT (1 col @ 4.0%)
    qty: '4.0%',
    // สาเหตุงานเสีย Prod.1 (10.75%) -> 5 cols @ 2.15%
    setting: '2.15%',
    jointIpo: '2.15%',
    splitSeam: '2.15%',
    dimNg: '2.15%',
    foamDetached: '2.15%',
    // สาเหตุงานเสีย Prod.2 (8.65%) -> 4 cols @ 2.16%
    jointMark: '2.16%',
    thickNg: '2.16%',
    filmBlemish: '2.16%',
    otherNg: '2.17%',
} : {
    item: '2.2%',
    date: '0%',
    job: '4.8%',
    partNo: '5.5%',
    prodName: '4.0%',
    // วัตถุดิบ (18.4%) -> 5 cols: tapTube 3.0%, lotNoTap 5.1%, embossSlit 3.0%, lotNoEmboss 4.6%, rollSlit 2.7%
    tapTube: '3.0%',
    lotNoTap: '5.1%',
    embossSlit: '3.0%',
    lotNoEmboss: '4.6%',
    rollSlit: '2.7%',
    id1: '1.9%',
    id2: '1.9%',
    idAvg: '1.9%',
    t1: '1.9%',
    t2: '1.9%',
    t3: '1.9%',
    t4: '1.9%',
    tAvg: '1.9%',
    judgement: '1.9%',
    speed: '1.9%',
    temp1: '1.9%',
    temp2: '1.9%',
    temp3: '1.9%',
    temp4: '1.9%',
    tempPipe: '1.9%',
    startTime: '2.3%',
    endTime: '2.3%',
    totalTime: '2.6%',
    lostHours: '2.6%',
    netWorkTime: '2.8%',
    qty: '4.0%',
    setting: '2.2%',
    jointIpo: '2.2%',
    splitSeam: '2.2%',
    dimNg: '2.2%',
    foamDetached: '2.2%',
    jointMark: '2.25%',
    thickNg: '2.25%',
    filmBlemish: '2.25%',
    otherNg: '2.25%',
};

const getSlitColWidths = getColWidths;

export const IpoTubeReportDocument = ({
    header = {},
    jobs = [],
    summary = {},
    title = 'รายงานการผลิต IPO TUBE',
    department = 'แผนก PIPE SET',
    machine = 'JOB FG',
    qfCode = 'QF-PF-076 ; 09-17-07-68',
    foremanName: passedForemanName,
}) => {
    // Format date standard from Slit (DD-MM-YYYY)
    const formatSingleDate = (dateVal) => {
        try {
            if (!dateVal) return '';
            if (dateVal instanceof Date) {
                const d = String(dateVal.getDate()).padStart(2, '0');
                const m = String(dateVal.getMonth() + 1).padStart(2, '0');
                const y = dateVal.getFullYear();
                return `${d}-${m}-${y}`;
            }
            const str = String(dateVal);
            const cleanStr = str.includes('T') ? str.split('T')[0] : str;
            const parts = cleanStr.split('-');
            if (parts.length === 3 && parts[0].length === 4) {
                return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
            }
            return cleanStr;
        } catch {
            return String(dateVal || '');
        }
    };

    const sortedJobs = Array.isArray(jobs) ? [...jobs] : [];

    const formatReportDate = (dateVal) => {
        try {
            // 1. ถ้าส่ง Date object เข้ามาโดยตรง (เช่น วันที่พิมพ์: formatReportDate(new Date()))
            if (dateVal instanceof Date) {
                return formatSingleDate(dateVal);
            }

            // 2. ถ้ามี startDate และ endDate ระบุใน header
            if (header?.startDate && header?.endDate) {
                if (header.startDate === header.endDate) {
                    return formatSingleDate(header.startDate);
                }
                return `${formatSingleDate(header.startDate)} ถึง ${formatSingleDate(header.endDate)}`;
            }

            // 3. ตรวจสอบจาก dateVal หรือ header.date
            const target = dateVal || header?.date;
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

            // 4. กรณีพิมพ์รายงานรวม/หลายวัน ที่ไม่ได้ระบุช่วงวันที่ชัดเจน ให้ดึงช่วงวันที่จริงจาก Jobs
            if (Array.isArray(sortedJobs) && sortedJobs.length > 0) {
                const dates = Array.from(new Set(
                    sortedJobs.map(j => CalculationService.safeExtractDate(j?.productionDate || j?.date || j?.createdAt || j?.lotNumber)).filter(Boolean)
                )).sort();

                if (dates.length === 1) {
                    return formatSingleDate(dates[0]);
                }
                if (dates.length > 1) {
                    return `${formatSingleDate(dates[0])} ถึง ${formatSingleDate(dates[dates.length - 1])}`;
                }
            }

            return formatSingleDate(CalculationService.getCurrentDateString());
        } catch {
            return formatSingleDate(CalculationService.getCurrentDateString());
        }
    };

    // Produce display rolls for the PDF table:
    // Columns that share the same data for the roll (No., Part No., Product Name, Machine Settings, Times, Product Qty, Defects)
    // have their horizontal dividing line removed (merged cells) across Tube 1 and Tube 2.
    // Spec sizes (TAP Tube, Emboss Slit) and Inspection measurements maintain their separate row with a dividing line per tube.
    // For raw materials (Lot No. TAP, Lot No. Emboss), if Tube 1 and Tube 2 share the same Lot No., they are also merged.
    const tableRolls = [];
    let runningAcc = 0;

    sortedJobs.forEach((job, idx) => {
        const rollNum = idx + 1;
        const qty = Number(job.productQty ?? job.goodQty ?? job.productedQty ?? job.outputQty ?? 0) || 0;
        runningAcc += qty;

        const modelSpecs = (CalculationService && typeof CalculationService.extractIpoTubeSpecs === 'function')
            ? CalculationService.extractIpoTubeSpecs(job.productName || job.partName || job.description, job.partNo)
            : { spec1: '', spec2: '', isTwin: false };

        const hasT2Data = Boolean(
            job.tube2 ||
            (job.tube2List && job.tube2List.length > 0) ||
            (job.tube2Spec && job.tube2Spec !== '-' && job.tube2Spec !== '')
        );

        const isTwin = job.isTwinTube !== undefined
            ? Boolean(job.isTwinTube)
            : Boolean(hasT2Data || modelSpecs.isTwin);

        const jobProdDate = (CalculationService && typeof CalculationService.safeExtractDate === 'function')
            ? CalculationService.safeExtractDate(job.productionDate || job.date || header?.date || job.createdAt || job.lotNumber)
            : (job.productionDate || job.date || header?.date || '');

        // ตรวจจับกรณีไม่มีไส้ (ไม่มีท่อ TAP): ในคอลัมน์ Tap Tube และ Lot No. Tap จะเป็น '-'
        // แต่ Emboss Slit จะดึงตัวเลขขนาดท่อ (เช่น 2 สำหรับท่อ 1, 3 สำหรับท่อ 2) มาแสดงเสมอ
        const hasValidTap = (v) => Boolean(v && v !== '-' && v !== 'ไม่มีไส้');

        let parsedSlit1 = job.lotNoSlit || job.lotSlit || job.lotNoEmboss || job.embossLot || job.lotEmboss || job.rawLotNo || job.lotNo || '-';
        const rawT2 = (isTwin && job.tube2) ? job.tube2 : (job.tube2 || {});
        let parsedSlit2 = rawT2.lotNoSlit || rawT2.lotSlit || rawT2.lotNoEmboss || job.tube2LotNoSlit || job.tube2LotSlit || job.tube2LotEmboss || '';

        // หากมีการบันทึก Slit Lot ทั้ง 2 ท่อรวมกันมาในฟิลด์เดียว (เช่น 2026-10-10 / 2026-10-12) ให้แยกออกเป็นแต่ละท่อ
        if (parsedSlit1 && typeof parsedSlit1 === 'string' && (parsedSlit1.includes(' / ') || parsedSlit1.includes('|'))) {
            const delim = parsedSlit1.includes(' / ') ? ' / ' : '|';
            const parts = parsedSlit1.split(delim);
            parsedSlit1 = parts[0]?.trim() || '-';
            if (!parsedSlit2) parsedSlit2 = parts[1]?.trim() || '';
        }

        const isDateOrLot = (v) => Boolean(v && (String(v).includes('-') || String(v).includes('/') || String(v).length > 5));
        const effectiveLotEmboss = parsedSlit1;

        const hasValidTapVal = (v) => Boolean(v && v !== '-' && v !== 'ไม่มีไส้');
        const isExplicitWithCore = job.hasCore === true || job.hasNoCore === false;
        const isExplicitNoCore = job.hasNoCore === true || job.hasCore === false || job.hasTapTube === false;
        const hasCoreSpec = hasValidTapVal(job.tapTube) || hasValidTapVal(job.tube1Spec);

        const hasNoCore = isExplicitWithCore
            ? false
            : Boolean(
                isExplicitNoCore ||
                !hasCoreSpec ||
                job.tapTube === '-' ||
                job.tapTube === 'ไม่มีไส้' ||
                job.tube1Spec === '-' ||
                job.tube1Spec === 'ไม่มีไส้'
            );

        const resolvedTapLot = hasNoCore
            ? '-'
            : ((job.lotNoTap && job.lotNoTap !== '-' && job.lotNoTap !== 'ไม่มีไส้')
                ? job.lotNoTap
                : (job.lotNumber || job.productionDate || job.date || '-'));

        // Emboss Slit: แสดงตัวเลขขนาดท่อเสมอ (เช่น 2 สำหรับท่อ 1, 3 สำหรับท่อ 2) ทั้งงานไม่มีไส้และมีไส้
        const cleanEmboss1 = (!isDateOrLot(job.embossSlit) && job.embossSlit && job.embossSlit !== '-' ? job.embossSlit : '')
            || (job.tube1Spec && job.tube1Spec !== '-' && job.tube1Spec !== 'ไม่มีไส้' ? job.tube1Spec : '')
            || modelSpecs.spec1
            || '2';

        // Tap Tube: แสดง '-' เด็ดขาดถ้าไม่มีไส้
        const cleanTapTube1 = hasNoCore
            ? '-'
            : ((job.tapTube && job.tapTube !== '-' && job.tapTube !== 'ไม่มีไส้' ? job.tapTube : '') ||
                (job.tube1Spec && job.tube1Spec !== '-' && job.tube1Spec !== 'ไม่มีไส้' ? job.tube1Spec : '') ||
                modelSpecs.spec1 ||
                '2');

        const extractRollAndCleanLot = (lotStr, rawRoll, rawTotal) => {
            let cleanLot = String(lotStr || '').replace(/\(.*?\)/g, '').trim();
            if (cleanLot === '' || cleanLot === 'undefined') cleanLot = '-';

            let rRoll = (rawRoll !== undefined && rawRoll !== null && String(rawRoll).trim() !== '') ? String(rawRoll).trim() : '';
            let rTotal = (rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '') ? String(rawTotal).trim() : '';

            if (!rRoll || !rTotal) {
                const details = (CalculationService && typeof CalculationService.extractEmbossDetails === 'function')
                    ? CalculationService.extractEmbossDetails(lotStr)
                    : null;
                if (details?.lotDate && (!cleanLot || cleanLot === '-')) cleanLot = details.lotDate;
                if (!rRoll && details?.rollNo) rRoll = details.rollNo;
                if (!rTotal && details?.totalRolls) rTotal = details.totalRolls;
            }

            if (!rRoll) {
                const m = String(lotStr || '').match(/(?:Roll\s*)?(\d+)\s*\/\s*(\d+)/i);
                if (m) {
                    rRoll = m[1];
                    rTotal = m[2];
                }
            }

            const rollDisplay = (rRoll && rTotal) ? `${rRoll}/${rTotal}` : (rRoll || '-');
            return { cleanLot, rollDisplay, rRoll, rTotal };
        };

        const t1SlitInfo = extractRollAndCleanLot(
            effectiveLotEmboss,
            job.rollSlit ?? job.roll_slit ?? job.slitRoll ?? job.slit_roll,
            job.totalRollSlit ?? job.total_roll_slit ?? job.slitTotalRoll ?? job.slit_total_roll
        );

        const tube1 = {
            tapTube: cleanTapTube1,
            lotNoTap: resolvedTapLot,
            embossSlit: cleanEmboss1,
            lotNoEmboss: t1SlitInfo.cleanLot || '-',
            rollSlit: t1SlitInfo.rollDisplay,
            id1: job.id1 ?? '',
            id2: job.id2 ?? '',
            idAvg: job.idAvg ?? '',
            t1: job.t1 ?? '',
            t2: job.t2 ?? '',
            t3: job.t3 ?? '',
            t4: job.t4 ?? '',
            tAvg: job.tAvg ?? '',
            judgement: job.judgement || (job.partNo ? 'OK' : ''),
        };

        let tube2 = null;
        if (isTwin && (job.tube2 || job.tube2Spec || job.tube2List || modelSpecs.spec2)) {
            const effectiveLotEmboss2 = parsedSlit2 || '-';
            const cleanEmboss2 = (!isDateOrLot(rawT2.embossSlit) && rawT2.embossSlit && rawT2.embossSlit !== '-' ? rawT2.embossSlit : '')
                || (!isDateOrLot(job.embossSlit2) && job.embossSlit2 && job.embossSlit2 !== '-' ? job.embossSlit2 : '')
                || (rawT2.tube2Spec && rawT2.tube2Spec !== '-' && rawT2.tube2Spec !== 'ไม่มีไส้' ? rawT2.tube2Spec : '')
                || (job.tube2Spec && job.tube2Spec !== '-' && job.tube2Spec !== 'ไม่มีไส้' ? job.tube2Spec : '')
                || modelSpecs.spec2
                || cleanEmboss1
                || '3';

            const resolvedTapLot2 = hasNoCore
                ? '-'
                : ((rawT2.lotNoTap && rawT2.lotNoTap !== '-' && rawT2.lotNoTap !== 'ไม่มีไส้')
                    ? rawT2.lotNoTap
                    : ((job.tube2LotTap && job.tube2LotTap !== '-' && job.tube2LotTap !== 'ไม่มีไส้')
                        ? job.tube2LotTap
                        : resolvedTapLot));

            const cleanTapTube2 = hasNoCore
                ? '-'
                : ((rawT2.tapTube && rawT2.tapTube !== '-' && rawT2.tapTube !== 'ไม่มีไส้' ? rawT2.tapTube : '')
                    || (job.tube2Spec && job.tube2Spec !== '-' && job.tube2Spec !== 'ไม่มีไส้' ? job.tube2Spec : '')
                    || modelSpecs.spec2
                    || '3');

            const t2SlitInfo = extractRollAndCleanLot(
                effectiveLotEmboss2,
                rawT2.rollSlit ?? rawT2.roll_slit ?? job.tube2RollSlit ?? job.tube2_roll_slit ?? t1SlitInfo.rRoll,
                rawT2.totalRollSlit ?? rawT2.total_roll_slit ?? job.tube2TotalRollSlit ?? job.tube2_total_roll_slit ?? t1SlitInfo.rTotal
            );

            tube2 = {
                tapTube: cleanTapTube2,
                lotNoTap: resolvedTapLot2,
                embossSlit: cleanEmboss2,
                lotNoEmboss: t2SlitInfo.cleanLot || '-',
                rollSlit: t2SlitInfo.rollDisplay,
                id1: rawT2.id1 ?? job.id1_2 ?? '',
                id2: rawT2.id2 ?? job.id2_2 ?? '',
                idAvg: rawT2.idAvg ?? job.idAvg2 ?? '',
                t1: rawT2.t1 ?? job.t1_2 ?? '',
                t2: rawT2.t2 ?? job.t2_2 ?? '',
                t3: rawT2.t3 ?? job.t3_2 ?? '',
                t4: rawT2.t4 ?? job.t4_2 ?? '',
                tAvg: rawT2.tAvg ?? job.tAvg2 ?? '',
                judgement: rawT2.judgement || job.judgement2 || (job.partNo ? 'OK' : ''),
            };
        }

        const sameLotTap = Boolean(hasNoCore || (tube2 && tube1.lotNoTap && tube1.lotNoTap !== '-' && tube1.lotNoTap === tube2.lotNoTap));
        const sameLotEmboss = Boolean(tube2 && tube1.lotNoEmboss && tube1.lotNoEmboss !== '-' && tube1.lotNoEmboss === tube2.lotNoEmboss);
        const sameRollSlit = Boolean(tube2 && tube1.rollSlit && tube1.rollSlit !== '-' && tube1.rollSlit === tube2.rollSlit);

        const calcTotalTime = (() => {
            let val = job.totalTime || '';
            if (val && !val.includes('ชม.') && !val.includes('นาที')) {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    const totM = Math.round(num * 60);
                    const h = Math.floor(totM / 60);
                    const m = totM % 60;
                    return h > 0 && m > 0 ? `${h} ชม. ${m} นาที` : (h > 0 ? `${h} ชม.` : `${m} นาที`);
                }
            }
            if (!val && job.startTime && job.endTime) {
                try {
                    const [sH, sM] = job.startTime.split(':').map(Number);
                    const [eH, eM] = job.endTime.split(':').map(Number);
                    if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
                        let diff = (eH * 60 + eM) - (sH * 60 + sM);
                        if (diff < 0) diff += 24 * 60;
                        const h = Math.floor(diff / 60);
                        const m = diff % 60;
                        return h > 0 && m > 0 ? `${h} ชม. ${m} นาที` : (h > 0 ? `${h} ชม.` : `${m} นาที`);
                    }
                } catch { }
            }
            return val;
        })();

        // Parse lost time & calculate net work time
        const rawNote = (job.downtimeNote || job.kpiNote || '').trim();
        const parsed = typeof extractLostTimeAndGeneralNote === 'function' ? extractLostTimeAndGeneralNote(rawNote) : {};
        const lostStart = job.lostTimeStart || parsed.lostTimeStart || '';
        const lostEnd = job.lostTimeEnd || parsed.lostTimeEnd || '';
        const lostReason = job.lostTimeReason || parsed.lostTimeReason || '';
        let lostMins = Number(job.lostTimeMinutes || parsed.lostTimeMinutes || 0);
        if (lostMins === 0 && lostStart && lostEnd) {
            lostMins = getMinutesDiff(lostStart, lostEnd);
        }
        if (lostMins === 0 && (job.downtimeMinutes || job.downtime)) {
            lostMins = Number(job.downtimeMinutes || job.downtime || 0);
        }

        const elapsedMins = getMinutesDiff(job.startTime, job.endTime);
        const netMins = Math.max(0, elapsedMins - lostMins);

        const lostHoursDisplay = lostMins > 0 ? formatDurationHoursMinutes(lostMins) : '-';
        const netWorkTimeDisplay = (elapsedMins > 0 || calcTotalTime)
            ? (lostMins > 0 ? formatDurationHoursMinutes(netMins) : calcTotalTime)
            : '-';

        tableRolls.push({
            id: `${job.id || rollNum}_roll_${idx}`,
            rollNum,
            productionDate: formatSingleDate(jobProdDate),
            jobNo: (job.jobNo || job.jobNumber || job.job || '-').trim(),
            partNo: job.partNo || '',
            productName: extractCleanProductName(job.productName || job.prodName || job.description || job.partName, job.partNo) || job.productName || job.partName || job.prodName || job.partNo || '',
            speed: job.speed ?? '',
            temp1: job.temp1 ?? '',
            temp2: job.temp2 ?? '',
            temp3: job.temp3 ?? '',
            temp4: job.temp4 ?? '',
            tempPipe: job.tempPipe ?? job.temp5 ?? '',
            startTime: job.startTime || '',
            endTime: job.endTime || '',
            totalTime: calcTotalTime,
            lostMinutes: lostMins,
            lostHoursDisplay,
            netWorkTimeDisplay,
            productQty: job.productQty || job.productedQty || job.goodQty || job.totalMeters || '',
            calcAccQty: runningAcc,
            defects: job.defects || {},
            isTwin: Boolean(tube2),
            tube1,
            tube2,
            sameLotTap,
            sameLotEmboss,
        });
    });

    // Separate Defect Calculations:
    // 1. Prod.1 = งานเสีย (SETTING, รอยต่อ IPO, ตะเข็บแตก, ขนาด NG, โฟมไม่ติด TUBE)
    const calcProd1Sum = (j) => {
        const d = j.defects || {};
        return (
            Number(d.setting ?? j.setting ?? j.defectSetting ?? 0) +
            Number(d.jointIpo ?? j.jointIpo ?? j.defectJointIpo ?? 0) +
            Number(d.splitSeam ?? j.splitSeam ?? j.defectSplitSeam ?? 0) +
            Number(d.dimNg ?? j.dimNg ?? j.defectDimNg ?? 0) +
            Number(d.foamDetached ?? j.foamDetached ?? j.defectFoamDetached ?? 0)
        ) || 0;
    };

    // 2. Prod.2 = LOSS (รอยต่อ รอยมาร์ค, ความหนา NG, EMBOSS FILM ลอยด่าง, อื่นๆ)
    const calcProd2Sum = (j) => {
        const d = j.defects || {};
        return (
            Number(d.jointMark ?? j.jointMark ?? j.defectJointMark ?? 0) +
            Number(d.thickNg ?? j.thickNg ?? j.defectThickNg ?? 0) +
            Number(d.filmBlemish ?? j.filmBlemish ?? j.defectFilmBlemish ?? 0) +
            Number(d.otherNg ?? j.otherNg ?? j.defectOtherNg ?? 0)
        ) || 0;
    };

    // 3. เฉพาะ ตะเข็บแตก (Split Seam) สำหรับ Footer "รวมงานเสีย"
    const calcSplitSeamSum = (j) => {
        const d = j.defects || {};
        return Number(d.splitSeam ?? j.splitSeam ?? j.defectSplitSeam ?? 0) || 0;
    };

    // รวมงานที่ผลิตทั้งหมด (จากยอดรวมของทุกม้วนในคอลัมน์ PRODUCT จำนวน M/Roll เช่น 4000 + 4100 = 8100)
    const totalProducedMeters = sortedJobs.reduce((acc, j) => acc + (Number(j.productQty ?? j.goodQty ?? j.productedQty ?? j.totalMeters ?? 0) || 0), 0);

    const totalProd1Defects = sortedJobs.reduce((acc, j) => acc + calcProd1Sum(j), 0);
    const totalProd2Loss = sortedJobs.reduce((acc, j) => acc + calcProd2Sum(j), 0);
    const totalAllDefects = totalProd1Defects + totalProd2Loss;

    // Footer "รวมงานเสีย": เอาแค่ ตะเข็บแตก ช่องเดียว
    const totalSplitSeamDefects = sortedJobs.reduce((acc, j) => acc + calcSplitSeamSum(j), 0);

    // Footer "LOSS": เอา prod.1 + prod.2 มารวมกัน ไม่รวม ตะเข็บแตก
    const totalCombinedLoss = Math.max(0, totalAllDefects - totalSplitSeamDefects);

    // Footer "รวมผลิตงานดี": งานทั้งหมด ลบ รวมงานเสีย และ loss (เช่น 8100 - 3 - 32 = 8065)
    const totalGoodPcs = Math.max(0, totalProducedMeters - totalSplitSeamDefects - totalCombinedLoss);

    // Dynamic Job Number
    const uniqueJobNos = [...new Set(
        (sortedJobs || [])
            .map(j => (j.jobNo || j.jobNumber || j.job || '').trim())
            .filter(Boolean)
    )];

    const isMultiJob = uniqueJobNos.length > 1 ||
        Boolean(typeof header?.date === 'string' && (header.date.includes(' ถึง ') || header.date.includes(' - '))) ||
        Boolean(header?.startDate && header?.endDate) ||
        Boolean(header?.isMonthly) ||
        Boolean(header?.isDateRange) ||
        Boolean(header?.isAllReport);

    const showDateCol = Boolean(header?.isMonthly) ||
        Boolean(header?.isDateRange) ||
        Boolean(header?.isAllReport) ||
        Boolean(header?.startDate && header?.endDate && header.startDate !== header.endDate) ||
        Boolean(typeof header?.date === 'string' && (header.date.includes(' ถึง ') || header.date.includes(' - '))) ||
        (Array.isArray(sortedJobs) && new Set(sortedJobs.map(j => CalculationService.safeExtractDate(j?.productionDate || j?.date || j?.createdAt || j?.lotNumber)).filter(Boolean)).size > 1);

    const GROUP_WIDTHS = getGroupWidths(showDateCol);
    const COL_WIDTHS = getColWidths(showDateCol);

    const getRollPrefix = (rollNum, jobNo) => {
        const cleanJob = (jobNo || '').trim();
        if (isMultiJob && cleanJob && cleanJob !== '-') {
            return `${rollNum} ${cleanJob} : `;
        }
        return `รอบที่ ${rollNum}: `;
    };

    // KPI / Downtime Notes: แบ่ง 50% ฝั่งซ้าย (KPI / หมายเหตุเริ่มงานช้า) vs 50% ฝั่งขวา (เวลาเสียระหว่างผลิต)
    const generalNotesList = [];
    const lostTimeEntries = [];
    let totalLostMinutes = 0;
    let totalWorkMinutes = 0;
    const cleanKpiLine = (str) => (str || '')
        .replace(/^(?:รอบที่|เธฃเธญเธšเธ—เธตเนˆ)\s*\d+:\s*/i, '')
        .replace(/^\d+\s+[A-Za-z0-9_-]+\s*:\s*/, '')
        .trim();

    // 1. ดึงจากส่วนหัว Header
    [header.kpiNote1, header.kpiNote2, header.remark, header.downtimeNote].forEach((note) => {
        if (!note) return;
        String(note).split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
            const parsed = typeof extractLostTimeAndGeneralNote === 'function' ? extractLostTimeAndGeneralNote(line) : {};
            if (parsed.hasLostTime) {
                let lText = '';
                if (parsed.lostTimeStart && parsed.lostTimeEnd) lText += `${parsed.lostTimeStart} - ${parsed.lostTimeEnd} `;
                if (parsed.lostTimeReason) lText += `${parsed.lostTimeReason} `;
                if (parsed.lostTimeMinutes > 0) lText += `(${formatDurationHoursMinutes(parsed.lostTimeMinutes)})`;
                if (lText.trim() && !lostTimeEntries.includes(lText.trim())) {
                    lostTimeEntries.push(lText.trim());
                    totalLostMinutes += Number(parsed.lostTimeMinutes || 0);
                }
            }
            const g = parsed.generalNote || line;
            const clean = cleanKpiLine(g);
            if (clean && !parsed.hasLostTime && !generalNotesList.includes(clean)) {
                generalNotesList.push(clean);
            }
        });
    });

    // 2. ดึงจากแต่ละ Job / Roll
    sortedJobs.forEach((j, idx) => {
        const rollNum = idx + 1;

        // คำนวณเวลาทำงานของแต่ละรอบ
        let rollWorkMins = 0;
        if (j.startTime && j.endTime) {
            rollWorkMins = getMinutesDiff(j.startTime, j.endTime);
        } else if (j.totalTime) {
            const rawVal = String(j.totalTime);
            if (rawVal.includes('ชม.') || rawVal.includes('นาที')) {
                let h = 0, m = 0;
                const hMatch = rawVal.match(/(\d+)\s*ชม/);
                const mMatch = rawVal.match(/(\d+)\s*นาที/);
                if (hMatch) h = parseInt(hMatch[1], 10);
                if (mMatch) m = parseInt(mMatch[1], 10);
                rollWorkMins = h * 60 + m;
            } else {
                const num = parseFloat(rawVal);
                if (!isNaN(num)) rollWorkMins = Math.round(num * 60);
            }
        }
        const note = (j.downtimeNote || j.kpiNote || '').trim();
        const parsed = typeof extractLostTimeAndGeneralNote === 'function' ? extractLostTimeAndGeneralNote(note) : {};

        const lostStart = j.lostTimeStart || parsed.lostTimeStart || '';
        const lostEnd = j.lostTimeEnd || parsed.lostTimeEnd || '';
        const lostReason = j.lostTimeReason || parsed.lostTimeReason || '';
        let lostMins = Number(j.lostTimeMinutes || parsed.lostTimeMinutes || 0);
        if (lostMins === 0 && lostStart && lostEnd) {
            lostMins = getMinutesDiff(lostStart, lostEnd);
        }
        if (lostMins === 0 && (j.downtimeMinutes || j.downtime)) {
            lostMins = Number(j.downtimeMinutes || j.downtime || 0);
        }

        // คำนวณเวลาทำงานสุทธิของแต่ละรอบ (หักเวลาที่เสียออก ตามแบบที่ 2)
        const netWorkMins = Math.max(0, rollWorkMins - lostMins);
        totalWorkMinutes += netWorkMins;

        if (lostMins > 0 || (lostStart && lostEnd) || lostReason) {
            totalLostMinutes += lostMins;
            let line = getRollPrefix(rollNum, j.jobNo);
            if (lostStart && lostEnd) {
                line += `${lostStart} - ${lostEnd} `;
            }
            if (lostReason) {
                line += `${lostReason} `;
            }
            if (lostMins > 0) {
                line += `(${formatDurationHoursMinutes(lostMins)})`;
            }
            const fullLine = line.trim();
            if (!lostTimeEntries.includes(fullLine)) {
                lostTimeEntries.push(fullLine);
            }
        }

        const genNote = (j.generalNote || parsed.generalNote || '').trim();
        if (genNote) {
            const clean = cleanKpiLine(genNote);
            if (clean) {
                const formatted = `${getRollPrefix(rollNum, j.jobNo)}${clean}`;
                if (!generalNotesList.includes(formatted)) {
                    generalNotesList.push(formatted);
                }
            }
        }
    });

    // Operator Name (ดึงชื่อผู้ปฏิบัติงานทั้งหมดที่บันทึกใน Job นี้ โดยแยกตามจุลภาคและตัดค่าซ้ำ)
    const allOperators = [...new Set(
        (jobs || [])
            .flatMap(j => (j.operatorName || j.employeeName || '').split(','))
            .map(s => s.trim())
            .filter(Boolean)
    )];
    const operatorName = allOperators.length > 0 ? allOperators.join(', ') : (header.operatorName || '');

    // Foreman Name: ถ้าผู้ใช้งานที่กำลังดู/พิมพ์ Report มี Role เป็น Officer/Foreman ให้ใส่ชื่อของผู้ใช้ตรงช่อง Foreman
    const isOfficer = isOfficerUser();
    const resolvedForemanName = passedForemanName || header.foremanName || header.foreman || (isOfficer ? getDisplayName() : '');

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                {/* Top Right Page Number */}
                <PdfText
                    style={styles.pageNumberTopRight}
                    render={({ pageNumber, totalPages }) => `หน้าที่ ${pageNumber} / ${totalPages}`}
                    fixed
                />

                {/* 1. Header Grid (Standard from Slit) */}
                <View style={styles.headerContainer} fixed>
                    <Text style={styles.title}>{title}</Text>
                    <View style={styles.headerSubRow}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.deptText}>{department}</Text>
                        </View>
                        <View style={styles.headerRight}>
                            <View style={[styles.headerDateRow, { marginBottom: 1 }]}>
                                <Text style={styles.dateLabel}>วันที่พิมพ์:</Text>
                                <Text style={styles.dateValue}>{formatReportDate(new Date())}</Text>
                            </View>
                            <View style={styles.headerDateRow}>
                                <Text style={styles.dateLabel}>วันที่ผลิต:</Text>
                                <Text style={styles.dateValue}>{formatReportDate(header.date)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 2. Main Table */}
                <View style={styles.tableContainer}>
                    {/* Synchronized Header Row with Nested Column Groups */}
                    <View style={styles.tableHeaderRow} fixed>
                        {/* 1. ลำดับ */}
                        <View style={[styles.thCellFull, { width: GROUP_WIDTHS.item }]}>
                            <Text style={styles.thTextMain}>ลำดับ</Text>
                        </View>

                        {/* วันที่ผลิต (แสดงเมื่อพิมพ์รายงานรวม/หลายวัน) */}
                        {showDateCol && (
                            <View style={[styles.thCellFull, { width: GROUP_WIDTHS.date }]}>
                                <Text style={styles.thTextMain}>วันที่ผลิต{"\n"}Date</Text>
                            </View>
                        )}

                        {/* 2. JOB */}
                        <View style={[styles.thCellFull, { width: GROUP_WIDTHS.job }]}>
                            <Text style={styles.thTextMain}>JOB</Text>
                        </View>

                        {/* 3. รหัสควบคุม / PART NO. */}
                        <View style={[styles.thCellFull, { width: GROUP_WIDTHS.partNo }]}>
                            <Text style={styles.thTextMain}>รหัสควบคุม{"\n"}PART NO.</Text>
                        </View>

                        {/* 4. ชื่อสินค้าที่ผลิต */}
                        <View style={[styles.thCellFull, { width: GROUP_WIDTHS.prodName }]}>
                            <Text style={styles.thTextMain}>ชื่อสินค้า{"\n"}ที่ผลิต</Text>
                        </View>

                        {/* 5. วัตถุดิบที่ใช้ */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.rawMaterials }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>วัตถุดิบที่ใช้</Text>
                            </View>
                            <View style={styles.thSubRow}>
                                <View style={[styles.thSubCell, { width: showDateCol ? '16.09%' : '16.30%' }]}>
                                    <Text style={styles.thTextSub}>Tap{"\n"}Tube</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: showDateCol ? '27.59%' : '27.72%' }]}>
                                    <Text style={styles.thTextSub}>Lot No.{"\n"}Tap</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: showDateCol ? '16.09%' : '16.30%' }]}>
                                    <Text style={styles.thTextSub}>Emboss{"\n"}Slit</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: showDateCol ? '25.29%' : '25.00%' }]}>
                                    <Text style={styles.thTextSub}>Lot No.{"\n"}Slit</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: showDateCol ? '14.94%' : '14.68%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thTextSub}>ม้วน Lot{"\n"}(Roll)</Text>
                                </View>
                            </View>
                        </View>

                        {/* 6. การตรวจสอบ (9 cols @ 11.11%) */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.inspection }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>การตรวจสอบ</Text>
                            </View>
                            <View style={styles.thSubRow}>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>ID1{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>ID2{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>AVG.{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>T1{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>T2{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>T3{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>T4{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.11%' }]}>
                                    <Text style={styles.thTextSub}>AVG.{"\n"}(mm.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '11.12%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thTextSub}>Judge-{"\n"}ment</Text>
                                </View>
                            </View>
                        </View>

                        {/* 7. การตั้งค่าเครื่องจักร (6 cols @ 16.66%) */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.machineSettings }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>การตั้งค่าเครื่องจักร</Text>
                            </View>
                            <View style={styles.thSubRow}>
                                <View style={[styles.thSubCell, { width: '16.66%' }]}>
                                    <Text style={styles.thTextSub}>Speed{"\n"}(m/min)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '16.66%' }]}>
                                    <Text style={styles.thTextSub}>Temp.1{"\n"}(°C)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '16.66%' }]}>
                                    <Text style={styles.thTextSub}>Temp.2{"\n"}(°C)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '16.66%' }]}>
                                    <Text style={styles.thTextSub}>Temp.3{"\n"}(°C)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '16.66%' }]}>
                                    <Text style={styles.thTextSub}>Temp.4{"\n"}(°C)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '16.70%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thTextSub}>Temp.{"\n"}ท่อคู่ (°C)</Text>
                                </View>
                            </View>
                        </View>

                        {/* 8. เวลาการผลิต (5 sub-cols) */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.prodTime }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>เวลาการผลิต</Text>
                            </View>
                            <View style={styles.thSubRow}>
                                <View style={[styles.thSubCell, { width: '18.25%' }]}>
                                    <Text style={styles.thTextSub}>เวลาเริ่ม{"\n"}Start</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '18.25%' }]}>
                                    <Text style={styles.thTextSub}>เวลาสิ้นสุด{"\n"}Finish</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '20.64%' }]}>
                                    <Text style={styles.thTextSub}>ใช้เวลา{"\n"}(ช.ม.)</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '20.64%' }]}>
                                    <Text style={styles.thTextSub}>ชั่วโมง{"\n"}ที่เสีย</Text>
                                </View>
                                <View style={[styles.thSubCell, { width: '22.22%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thTextSub}>เวลาทำงาน{"\n"}ทั้งหมด</Text>
                                </View>
                            </View>
                        </View>

                        {/* 9. PRODUCT (1 single column) */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.product }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>PRODUCT</Text>
                            </View>
                            <View style={[styles.thSubRow, { justifyContent: 'center', alignItems: 'center' }]}>
                                <Text style={styles.thTextSub}>จำนวน{"\n"}M/Roll</Text>
                            </View>
                        </View>

                        {/* 10. สาเหตุงานเสีย (Prod.1: 55% & Prod.2: 45%) */}
                        <View style={[styles.thGroupCol, { width: GROUP_WIDTHS.defects, borderRightWidth: 0 }]}>
                            <View style={styles.thGroupTop}>
                                <Text style={styles.thTextMain}>สาเหตุงานเสีย</Text>
                            </View>
                            <View style={styles.thSubRow}>
                                {/* Prod.1 (5 cols @ 20% of 55% = 2.2% each) */}
                                <View style={{ width: '55%', borderRightWidth: 0.6, borderColor: '#000', flexDirection: 'column' }}>
                                    <View style={styles.thProdTier}>
                                        <Text style={styles.thTextSubBold}>Prod.1</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'stretch', flex: 1 }}>
                                        <View style={[styles.thSubCell, { width: '20%' }]}>
                                            <Text style={styles.thTextSub}>SETTING{"\n"}ตั้งเครื่อง</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '20%' }]}>
                                            <Text style={styles.thTextSub}>รอยต่อ{"\n"}IPO</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '20%' }]}>
                                            <Text style={styles.thTextSub}>ตะเข็บ{"\n"}แตก</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '20%' }]}>
                                            <Text style={styles.thTextSub}>ขนาด{"\n"}NG</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '20%', borderRightWidth: 0 }]}>
                                            <Text style={styles.thTextSub}>โฟมไม่ติด{"\n"}TUBE</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Prod.2 (4 cols @ 25% of 45% = 2.25% each) */}
                                <View style={{ width: '45%', flexDirection: 'column' }}>
                                    <View style={styles.thProdTier}>
                                        <Text style={styles.thTextSubBold}>Prod.2</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'stretch', flex: 1 }}>
                                        <View style={[styles.thSubCell, { width: '25%' }]}>
                                            <Text style={styles.thTextSub}>รอยต่อ{"\n"}รอยมาร์ค</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '25%' }]}>
                                            <Text style={styles.thTextSub}>ความหนา{"\n"}NG</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '25%' }]}>
                                            <Text style={styles.thTextSub}>EMBOSS FILM{"\n"}ลอยด่าง</Text>
                                        </View>
                                        <View style={[styles.thSubCell, { width: '25%', borderRightWidth: 0 }]}>
                                            <Text style={styles.thTextSub}>อื่นๆ</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </View>

                    {/* Table Data Rows - จัดกลุ่มระดับ Roll และ Merge เส้นคั่นแนวนอนสำหรับข้อมูลตัวเดียวกัน */}
                    {tableRolls.length > 0 ? (
                        tableRolls.map((roll, idx) => {
                            const isLastRoll = idx === tableRolls.length - 1;
                            const isTwin = Boolean(roll.isTwin && roll.tube2);
                            const unmergedBorder1 = isTwin ? { borderBottomWidth: 0.5 } : {};

                            return (
                                <View key={roll.id || `roll-${idx}`} wrap={false}>
                                    {/* แถวที่ 1 (Tube 1) */}
                                    <View
                                        style={[
                                            styles.dataRow,
                                            isTwin ? { borderBottomWidth: 0 } : { borderBottomWidth: isLastRoll ? 0.8 : 0.5 },
                                        ]}
                                    >
                                        {/* 1. ลำดับ (Merged) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.item }]}>
                                            <Text style={styles.tdText}>{roll.rollNum}</Text>
                                        </View>

                                        {/* วันที่ผลิต (Merged) */}
                                        {showDateCol && (
                                            <View style={[styles.td, { width: COL_WIDTHS.date }]}>
                                                <Text style={[styles.tdText, { fontSize: 4.8 }]}>{roll.productionDate || '-'}</Text>
                                            </View>
                                        )}

                                        {/* 2. JOB (Merged) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.job }]}>
                                            <Text style={styles.tdBold}>{roll.jobNo}</Text>
                                        </View>

                                        {/* 3. รหัสควบคุม / PART NO. (Merged) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.partNo }]}>
                                            <Text style={styles.tdBold}>{roll.partNo}</Text>
                                        </View>

                                        {/* 4. ชื่อสินค้าที่ผลิต (Merged) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.prodName }]}>
                                            <Text style={[styles.tdBold, { fontSize: 5.0 }]}>{roll.productName || '-'}</Text>
                                        </View>

                                        {/* 5. TAP Tube (แยกแถวตามท่อ มีเส้นคั่น) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.tapTube }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.tapTube}</Text>
                                        </View>

                                        {/* 6. Lot No. TAP (แยกแถวตามท่อ มีเส้นคั่น) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.lotNoTap }, unmergedBorder1]}>
                                            <Text style={[styles.tdText, { fontSize: 4.8 }]}>{roll.tube1.lotNoTap}</Text>
                                        </View>

                                        {/* 7. Emboss Slit (แยกแถวตามท่อ มีเส้นคั่น) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.embossSlit }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.embossSlit}</Text>
                                        </View>

                                        {/* 8. Lot No. Emboss (แยกแถวตามท่อ มีเส้นคั่น) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.lotNoEmboss }, unmergedBorder1]}>
                                            <Text style={[styles.tdText, { fontSize: 4.8 }]}>{roll.tube1.lotNoEmboss}</Text>
                                        </View>

                                        {/* 8.1 ม้วน Lot (Roll) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.rollSlit }, unmergedBorder1]}>
                                            <Text style={[styles.tdBold, { fontSize: 4.8 }]}>{roll.tube1.rollSlit}</Text>
                                        </View>

                                        {/* 9. การตรวจสอบ (9 คอลัมน์ -> แยกแถวตามท่อ มีเส้นคั่น) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.id1 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.id1}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.id2 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.id2}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.idAvg }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.idAvg}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.t1 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.t1}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.t2 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.t2}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.t3 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.t3}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.t4 }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.t4}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.tAvg }, unmergedBorder1]}>
                                            <Text style={styles.tdText}>{roll.tube1.tAvg}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.judgement }, unmergedBorder1]}>
                                            <Text style={[styles.tdBold, roll.tube1.judgement === 'NG' && { color: '#DC2626' }]}>
                                                {roll.tube1.judgement || (roll.partNo ? 'OK' : '')}
                                            </Text>
                                        </View>

                                        {/* 10. การตั้งค่าเครื่องจักร (Merged - ข้อมูลตัวเดียวกัน) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.speed }]}>
                                            <Text style={styles.tdText}>{roll.speed}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.temp1 }]}>
                                            <Text style={styles.tdText}>{roll.temp1}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.temp2 }]}>
                                            <Text style={styles.tdText}>{roll.temp2}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.temp3 }]}>
                                            <Text style={styles.tdText}>{roll.temp3}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.temp4 }]}>
                                            <Text style={styles.tdText}>{roll.temp4}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.tempPipe }]}>
                                            <Text style={styles.tdText}>{roll.tempPipe}</Text>
                                        </View>

                                        {/* 11. เวลาการผลิต (Merged - ข้อมูลตัวเดียวกัน) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.startTime }]}>
                                            <Text style={styles.tdText}>{roll.startTime}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.endTime }]}>
                                            <Text style={styles.tdText}>{roll.endTime}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.totalTime }]}>
                                            <Text style={styles.tdText}>{roll.totalTime}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.lostHours }]}>
                                            <Text style={styles.tdText}>
                                                {roll.lostHoursDisplay}
                                            </Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.netWorkTime }]}>
                                            <Text style={styles.tdText}>{roll.netWorkTimeDisplay}</Text>
                                        </View>

                                        {/* 12. PRODUCT M/Roll (Merged - ข้อมูลตัวเดียวกัน) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.qty }]}>
                                            <Text style={styles.tdBold}>{roll.productQty}</Text>
                                        </View>

                                        {/* 13. สาเหตุงานเสีย Prod.1 (Merged - ข้อมูลตัวเดียวกัน) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.setting }]}>
                                            <Text style={styles.tdText}>{roll.defects?.setting || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.jointIpo }]}>
                                            <Text style={styles.tdText}>{roll.defects?.jointIpo || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.splitSeam }]}>
                                            <Text style={styles.tdText}>{roll.defects?.splitSeam || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.dimNg }]}>
                                            <Text style={styles.tdText}>{roll.defects?.dimNg || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.foamDetached }]}>
                                            <Text style={styles.tdText}>{roll.defects?.foamDetached || ''}</Text>
                                        </View>

                                        {/* 13. สาเหตุงานเสีย Prod.2 (Merged - ข้อมูลตัวเดียวกัน) */}
                                        <View style={[styles.td, { width: COL_WIDTHS.jointMark }]}>
                                            <Text style={styles.tdText}>{roll.defects?.jointMark || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.thickNg }]}>
                                            <Text style={styles.tdText}>{roll.defects?.thickNg || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.filmBlemish }]}>
                                            <Text style={styles.tdText}>{roll.defects?.filmBlemish || ''}</Text>
                                        </View>
                                        <View style={[styles.td, { width: COL_WIDTHS.otherNg, borderRightWidth: 0 }]}>
                                            <Text style={styles.tdText}>{roll.defects?.otherNg || ''}</Text>
                                        </View>
                                    </View>

                                    {/* แถวที่ 2 (Tube 2 - แสดงเฉพาะเมื่อเป็นท่อคู่ isTwin) */}
                                    {isTwin && (
                                        <View
                                            style={[
                                                styles.dataRow,
                                                { borderBottomWidth: isLastRoll ? 0.8 : 0.5 },
                                            ]}
                                        >
                                            {/* 1. ลำดับ (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.item }]} />

                                            {/* วันที่ผลิต (Merged -> Blank) */}
                                            {showDateCol && (
                                                <View style={[styles.td, { width: COL_WIDTHS.date }]} />
                                            )}

                                            {/* 2. JOB (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.job }]} />

                                            {/* 3. รหัสควบคุม (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.partNo }]} />

                                            {/* 4. ชื่อสินค้า (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.prodName }]} />

                                            {/* 5. TAP Tube (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.tapTube }]}>
                                                <Text style={styles.tdText}>{roll.tube2.tapTube}</Text>
                                            </View>

                                            {/* 6. Lot No. TAP (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.lotNoTap }]}>
                                                <Text style={[styles.tdText, { fontSize: 4.8 }]}>
                                                    {roll.tube2.lotNoTap || '-'}
                                                </Text>
                                            </View>

                                            {/* 7. Emboss Slit (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.embossSlit }]}>
                                                <Text style={styles.tdText}>{roll.tube2.embossSlit}</Text>
                                            </View>

                                            {/* 8. Lot No. Slit (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.lotNoEmboss }]}>
                                                <Text style={[styles.tdText, { fontSize: 4.8 }]}>
                                                    {roll.tube2.lotNoEmboss || '-'}
                                                </Text>
                                            </View>

                                            {/* 8.1 ม้วน Lot (Roll) (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.rollSlit }]}>
                                                <Text style={[styles.tdBold, { fontSize: 4.8 }]}>
                                                    {roll.tube2.rollSlit || '-'}
                                                </Text>
                                            </View>

                                            {/* 9. การตรวจสอบ 9 คอลัมน์ (Tube 2 data) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.id1 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.id1}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.id2 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.id2}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.idAvg }]}>
                                                <Text style={styles.tdText}>{roll.tube2.idAvg}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.t1 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.t1}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.t2 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.t2}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.t3 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.t3}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.t4 }]}>
                                                <Text style={styles.tdText}>{roll.tube2.t4}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.tAvg }]}>
                                                <Text style={styles.tdText}>{roll.tube2.tAvg}</Text>
                                            </View>
                                            <View style={[styles.td, { width: COL_WIDTHS.judgement }]}>
                                                <Text style={[styles.tdBold, roll.tube2.judgement === 'NG' && { color: '#DC2626' }]}>
                                                    {roll.tube2.judgement || (roll.partNo ? 'OK' : '')}
                                                </Text>
                                            </View>

                                            {/* 10. การตั้งค่าเครื่องจักร (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.speed }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.temp1 }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.temp2 }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.temp3 }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.temp4 }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.tempPipe }]} />

                                            {/* 11. เวลาการผลิต (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.startTime }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.endTime }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.totalTime }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.lostHours }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.netWorkTime }]} />

                                            {/* 12. PRODUCT M/Roll (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.qty }]} />

                                            {/* 13. สาเหตุงานเสีย Prod.1 (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.setting }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.jointIpo }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.splitSeam }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.dimNg }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.foamDetached }]} />

                                            {/* 13. สาเหตุงานเสีย Prod.2 (Merged -> Blank) */}
                                            <View style={[styles.td, { width: COL_WIDTHS.jointMark }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.thickNg }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.filmBlemish }]} />
                                            <View style={[styles.td, { width: COL_WIDTHS.otherNg, borderRightWidth: 0 }]} />
                                        </View>
                                    )}
                                </View>
                            );
                        })
                    ) : (
                        <View style={[styles.dataRow, { minHeight: 28, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 0 }]}>
                            <Text style={[styles.tdText, { width: '100%', textAlign: 'center', color: '#64748b' }]}>
                                ไม่มีข้อมูลการผลิต
                            </Text>
                        </View>
                    )}

                    {/* 3. Footer Section (Inside tableContainer, pinned to bottom by marginTop: 'auto') */}
                    <View style={styles.footerWrapper} wrap={false}>
                        {/* KPI / Downtime Log Box (Split 50% / 50%) */}
                        <View style={styles.kpiContainer}>
                            {/* ฝั่งซ้าย (50%): สรุปสาเหตุ และจำนวนงานเสีย (KPI) / หมายเหตุเริ่มงานช้า */}
                            <View style={styles.kpiLeftCol}>
                                <Text style={styles.kpiTitle}>สรุปสาเหตุ และจำนวนงานเสีย (KPI) / หมายเหตุเริ่มงานช้า</Text>
                                <View style={styles.kpiContentRow}>
                                    {generalNotesList.length > 0 ? (
                                        generalNotesList.map((dtItem, dtIdx) => (
                                            <View key={dtIdx} style={styles.kpiLine}>
                                                <Text style={styles.kpiText}>• {dtItem}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <View style={styles.kpiLine}>
                                            <Text style={[styles.kpiText, { color: '#64748b' }]}>- ไม่มีหมายเหตุ -</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* ฝั่งขวา (50%): เวลาเสียระหว่างการผลิต (LOST TIME) */}
                            <View style={styles.kpiRightCol}>
                                <View style={styles.kpiHeaderRow}>
                                    <Text style={styles.kpiTitle}>เวลาเสียระหว่างการผลิต (LOST TIME)</Text>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={[styles.kpiTextBold, { color: '#dc2626' }]}>
                                            รวมเวลาที่เสีย: {totalLostMinutes > 0 ? formatDurationHoursMinutes(totalLostMinutes) : '-'}
                                        </Text>
                                        <Text style={[styles.kpiTextBold, { color: '#1e3a8a', marginTop: 1 }]}>
                                            รวมเวลาทำงานจริงทั้งหมด: {totalWorkMinutes > 0 ? formatDurationHoursMinutes(totalWorkMinutes) : '-'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.kpiContentRow}>
                                    {lostTimeEntries.length > 0 ? (
                                        lostTimeEntries.map((ltItem, ltIdx) => (
                                            <View key={ltIdx} style={styles.kpiLine}>
                                                <Text style={styles.kpiText}>• {ltItem}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <View style={styles.kpiLine}>
                                            <Text style={[styles.kpiText, { color: '#64748b' }]}>- ไม่มีเวลาเสียระหว่างผลิต -</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Footer Summary (4 Columns Spanning 100% Width) */}
                        <View style={styles.summaryGridRow}>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryLabel}>รวมผลิตงานดี</Text>
                                <View style={styles.summaryDottedWrapper}>
                                    <Text style={styles.summaryValueText}>{totalGoodPcs > 0 ? totalGoodPcs : (totalProducedMeters > 0 && totalGoodPcs === 0 ? '0' : '')}</Text>
                                </View>
                                <Text style={styles.summaryUnit}>เมตร</Text>
                            </View>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryLabel}>รวมงานเสีย</Text>
                                <View style={styles.summaryDottedWrapper}>
                                    <Text style={styles.summaryValueText}>{totalSplitSeamDefects > 0 ? totalSplitSeamDefects : ''}</Text>
                                </View>
                                <Text style={styles.summaryUnit}>เมตร</Text>
                            </View>
                            <View style={styles.summaryCell}>
                                <Text style={styles.summaryLabel}>LOSS</Text>
                                <View style={styles.summaryDottedWrapper}>
                                    <Text style={styles.summaryValueText}>{totalCombinedLoss > 0 ? totalCombinedLoss : ''}</Text>
                                </View>
                                <Text style={styles.summaryUnit}>เมตร</Text>
                            </View>
                            <View style={[styles.summaryCell, { borderRightWidth: 0 }]}>
                                <Text style={styles.summaryLabel}>รวมงานที่ผลิตทั้งหมด</Text>
                                <View style={styles.summaryDottedWrapper}>
                                    <Text style={styles.summaryValueText}>{totalProducedMeters > 0 ? totalProducedMeters : ''}</Text>
                                </View>
                                <Text style={styles.summaryUnit}>เมตร</Text>
                            </View>
                        </View>

                        {/* Signatures (4 Columns Spanning 100% Width) */}
                        <View style={styles.signaturesGridRow}>
                            <View style={styles.sigCell}>
                                <Text style={styles.sigTitle}>Operator</Text>
                                <View style={styles.sigDottedWrapper}>
                                    <Text style={styles.sigNameText}>{operatorName || ''}</Text>
                                </View>
                            </View>
                            <View style={styles.sigCell}>
                                <Text style={styles.sigTitle}>Foreman</Text>
                                <View style={styles.sigDottedWrapper}>
                                    <Text style={styles.sigNameText}>{resolvedForemanName || ''}</Text>
                                </View>
                            </View>
                            <View style={styles.sigCell}>
                                <Text style={styles.sigTitle}>Supervisor</Text>
                                <View style={styles.sigDottedWrapper}>
                                    <Text style={styles.sigNameText}></Text>
                                </View>
                            </View>
                            <View style={[styles.sigCell, { borderRightWidth: 0 }]}>
                                <Text style={styles.sigTitle}>Manager / Ass't manager</Text>
                                <View style={styles.sigDottedWrapper}>
                                    <Text style={styles.sigNameText}></Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* 4. ISO Form Code */}
                <View style={styles.formCodeContainer} fixed>
                    <Text style={styles.formCodeText}>{qfCode}</Text>
                </View>
            </Page>
        </Document>
    );
};

export default IpoTubeReportDocument;
