import React from 'react';
import {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    Font,
} from '@react-pdf/renderer';
import { CalculationService } from '../../../services/calculationService';
import { isOfficerUser, getDisplayName } from '../../../services/authHelper';

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
        paddingTop: 10,
        paddingHorizontal: 12,
        paddingBottom: 10,
        fontSize: 5.6,
        lineHeight: 1.2,
        backgroundColor: '#FFFFFF',
        flexDirection: 'column',
        height: '100%',
    },

    // 1. Header Grid
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
        width: '32%',
        flexDirection: 'column',
    },
    headerRight: {
        width: '45%',
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

    // 2. Table Container
    tableContainer: {
        borderWidth: 1,
        borderColor: '#000',
        flexDirection: 'column',
        marginTop: 4,
        flex: 1,
    },

    // Two-tier Header Container
    tableHeaderRow: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderColor: '#000',
        minHeight: 28,
        alignItems: 'stretch',
    },
    th: {
        borderRightWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 1,
        paddingHorizontal: 0.5,
    },
    thSubCol: {
        borderRightWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 1,
        paddingHorizontal: 0.5,
    },
    thText: {
        fontSize: 6.8,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.15,
    },
    thSubText: {
        fontSize: 5.8,
        fontWeight: 700,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.15,
    },
    subEn: {
        fontSize: 5.0,
        fontWeight: 400,
        color: '#000',
    },

    // Data Rows
    dataRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderColor: '#000',
        minHeight: 22,
        alignItems: 'stretch',
    },
    td: {
        borderRightWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 1,
        paddingHorizontal: 0.5,
    },
    tdText: {
        fontSize: 6.8,
        textAlign: 'center',
        color: '#000',
        lineHeight: 1.15,
    },
    tdRight: {
        fontSize: 7.2,
        textAlign: 'right',
        color: '#000',
        width: '100%',
        paddingRight: 2,
        lineHeight: 1.15,
    },

    // Total Summary Row in Table (แถวรวมในตาราง)
    totalRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.8,
        borderColor: '#000',
        minHeight: 18,
        height: 18,
        alignItems: 'stretch',
        backgroundColor: '#FFFFFF',
    },

    // Footer Summary Row (แถบสรุปตรง footer: กว้าง STD, จำนวนที่ใช้จริง, % Yield ตามภาพ Excel)
    footerSummaryRow: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 0.8,
        borderBottomWidth: 0.8,
        borderColor: '#000',
        minHeight: 18,
        height: 18,
        alignItems: 'stretch',
        marginTop: 'auto',
    },
    footerSummaryCell: {
        borderRightWidth: 0.8,
        borderColor: '#000',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    footerSummaryLabel: {
        fontSize: 6.8,
        fontWeight: 700,
        color: '#000',
        marginRight: 4,
    },
    footerSummaryValue: {
        fontSize: 7.0,
        fontWeight: 700,
        color: '#000',
    },

    // 3. Footer Signature Row (ตารางส่วนท้ายตามแบบ Excel)
    signatureTableRow: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        borderTopWidth: 0,
        borderColor: '#000',
        minHeight: 20,
        height: 20,
        alignItems: 'stretch',
        marginTop: 0,
    },
    sigTd: {
        borderRightWidth: 0.8,
        borderColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 2,
    },
    sigCellText: {
        fontSize: 6.8,
        color: '#000',
        textAlign: 'center',
        lineHeight: 1.15,
    },
    qfCode: {
        fontSize: 6.2,
        color: '#000',
    },
});

// Dynamic Slit Column Widths (Sum = 100%)
const getSlitColWidths = (showDateCol) => showDateCol ? {
    item: '2.0%',
    date: '4.8%',
    job: '5.4%',
    partNo: '5.6%',
    materialNo: '5.3%',
    foamName: '3.8%',
    actualWidth: '4.2%',
    sizeGroup: '8.6%',
    thickStd: '2.4%',
    widthStd: '3.1%',
    lenStd: '3.1%',
    color: '3.8%',
    lotMat: '4.2%',
    rollLot: '2.8%',
    firstShotGroup: '8.7%',
    firstShotThick: '3.2%',
    firstShotWidth: '5.5%',
    producedQty: '5.4%',
    rollUsed: '3.7%',
    remainGroup: '10.8%',
    remainThick: '3.2%',
    remainWidth: '3.8%',
    remainLen: '3.8%',
    ng: '2.5%',
    lossOverStd: '4.7%',
    lossProduct: '4.7%',
    actualUsed: '4.9%',
    yield: '4.6%',
    totalSummaryLeft: '33.5%',
    totalSummaryMid: '22.6%',
} : {
    item: '2.2%',
    date: '0%',
    job: '5.8%',
    partNo: '6.0%',
    materialNo: '5.7%',
    foamName: '4.1%',
    actualWidth: '4.6%',
    sizeGroup: '9.2%',
    thickStd: '2.6%',
    widthStd: '3.3%',
    lenStd: '3.3%',
    color: '4.0%',
    lotMat: '4.6%',
    rollLot: '3.0%',
    firstShotGroup: '9.0%',
    firstShotThick: '3.3%',
    firstShotWidth: '5.7%',
    producedQty: '5.6%',
    rollUsed: '4.0%',
    remainGroup: '10.8%',
    remainThick: '3.2%',
    remainWidth: '3.8%',
    remainLen: '3.8%',
    ng: '2.5%',
    lossOverStd: '4.7%',
    lossProduct: '4.7%',
    actualUsed: '4.9%',
    yield: '4.6%',
    totalSummaryLeft: '31.0%',
    totalSummaryMid: '23.9%',
};

export const SlitReportDocument = ({
    header = {},
    jobs = [],
    summary = {},
    title = 'รายงานการ SLIT',
    department = 'แผนก PIPE LINE',
    machine = 'จุดตรวจเช็ค เครื่อง SLIT',
    foremanName: passedForemanName,
}) => {
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

    const formatReportDate = (dateVal) => {
        try {
            const target = dateVal || header?.date || (header?.startDate && header?.endDate ? (header.startDate === header.endDate ? header.startDate : `${header.startDate} - ${header.endDate}`) : '') || CalculationService.getCurrentDateString();
            if (typeof target === 'string') {
                if (target.includes(' - ')) {
                    const [p1, p2] = target.split(' - ').map(s => s.trim());
                    return `${formatSingleDate(p1)} - ${formatSingleDate(p2)}`;
                }
                if (target.includes(' ถึง ')) {
                    const [p1, p2] = target.split(' ถึง ').map(s => s.trim());
                    return `${formatSingleDate(p1)} - ${formatSingleDate(p2)}`;
                }
            }
            return formatSingleDate(target) || formatSingleDate(CalculationService.getCurrentDateString());
        } catch {
            return formatSingleDate(CalculationService.getCurrentDateString());
        }
    };

    const formatLotNo = (lotStr, job) => {
        try {
            const rawTarget = (lotStr !== undefined && lotStr !== null && String(lotStr).trim() !== '')
                ? lotStr
                : (job?.embossLot || job?.lotNumber || job?.lotNo);
            const details = CalculationService.extractEmbossDetails(rawTarget);
            if (details?.lotDate) {
                return details.lotDate;
            }
            const cleanDate = String(rawTarget || '').replace(/\(.*?\)/g, '').trim();
            return CalculationService.formatToYYYYMMDD(
                cleanDate,
                job?.productionDate || job?.date || job?.createdAt || header?.date
            ) || cleanDate || '-';
        } catch {
            return String(lotStr || job?.embossLot || job?.lotNumber || job?.lotNo || '-').replace(/\(.*?\)/g, '').trim();
        }
    };

    const formatRollLot = (job) => {
        try {
            if (!job) return '-';
            const roll = (job.embossRoll !== undefined && job.embossRoll !== null && String(job.embossRoll).trim() !== '')
                ? String(job.embossRoll).trim()
                : ((job.EmbossRoll !== undefined && job.EmbossRoll !== null && String(job.EmbossRoll).trim() !== '') ? String(job.EmbossRoll).trim() : '');
            const total = (job.embossTotalRoll !== undefined && job.embossTotalRoll !== null && String(job.embossTotalRoll).trim() !== '')
                ? String(job.embossTotalRoll).trim()
                : ((job.EmbossTotalRoll !== undefined && job.EmbossTotalRoll !== null && String(job.EmbossTotalRoll).trim() !== '') ? String(job.EmbossTotalRoll).trim() : '');

            if (roll && total) {
                return `${roll}/${total}`;
            }
            if (roll) {
                return roll;
            }

            // Fallback สกัดจากข้อความใน embossLot หรือ lotNumber เดิม
            const rawLot = job.embossLot || job.lotNumber || job.lotNo || '';
            if (rawLot) {
                const details = CalculationService.extractEmbossDetails(rawLot);
                if (details?.rollNo && details?.totalRolls) {
                    return `${details.rollNo}/${details.totalRolls}`;
                }
                if (details?.rollNo) {
                    return details.rollNo;
                }
            }

            return '-';
        } catch {
            return '-';
        }
    };

    const sortedJobs = Array.isArray(jobs)
        ? [...jobs].sort((a, b) => {
            const seqA = a.sequenceNo ?? 0;
            const seqB = b.sequenceNo ?? 0;
            if (seqA !== seqB && seqA > 0 && seqB > 0) return seqA - seqB;
            const timeA = new Date(a.createdAt || 0).getTime() || 0;
            const timeB = new Date(b.createdAt || 0).getTime() || 0;
            return timeA - timeB;
        })
        : [];

    // ── คำนวณยอดรวมสำหรับแถว Total และ Footer (อ้างอิงสูตรมาตรฐานแผนก SLIT) ──
    const totalStdWidth = sortedJobs.reduce((sum, j) => sum + (parseFloat(j.stdWidth) || 0), 0);
    const totalActualUsed = sortedJobs.reduce((sum, j) => sum + (parseFloat(j.actualUsedQty) || 0), 0);
    const totalProductedQty = sortedJobs.reduce((sum, j) => {
        const q = Number(
            j.totalProductedQty ||
            (j.firstSheetEntries && j.firstSheetEntries.length > 0
                ? j.firstSheetEntries.reduce((s, e) => s + (Number(e.qty) || 0), 0)
                : ((Number(j.productedQty) || 0) + (Number(j.productedQty2) || 0)))
        ) || 0;
        return sum + q;
    }, 0);
    const totalRollUsed = sortedJobs.reduce((sum, j) => sum + (Number(j.rollUsed) || 1), 0);
    const totalNg = sortedJobs.reduce((sum, j) => sum + (Number(j.ng) || 0), 0);
    const totalLossOverStd = sortedJobs.reduce((sum, j) => sum + (parseFloat(j.lossOverStd) || 0), 0);
    const totalLossProduct = sortedJobs.reduce((sum, j) => sum + (parseFloat(j.lossProduct) || 0), 0);

    // คำนวณ % Yield รวม: (รวมที่ใช้จริง / รวมกว้าง STD) * 100 ตามสูตรจริงในตาราง Excel
    const overallYield = totalStdWidth > 0
        ? Number(((totalActualUsed / totalStdWidth) * 100).toFixed(2))
        : (summary?.averageYieldPercent || (sortedJobs.length > 0
            ? Number((sortedJobs.reduce((sum, j) => sum + (Number(j.yield) || 0), 0) / sortedJobs.length).toFixed(2))
            : 0));

    const operatorsFromJobs = (jobs || []).flatMap((j) => {
        const op = (j.operatorName || j.employeeName || '').trim();
        if (!op) return [];
        return op.split(/[,/]/).map((n) => n.trim()).filter(Boolean);
    });

    const headerOps = (header?.operatorName || '')
        .split(/[,/]/)
        .map((n) => n.trim())
        .filter(Boolean);

    const allOps = Array.from(new Set([...operatorsFromJobs, ...headerOps])).filter(
        (name) => name && name !== '-' && name.toLowerCase() !== 'operator'
    );

    const displayOperators = allOps.length > 0 ? allOps : (header?.operatorName ? [header.operatorName] : []);

    // Foreman Name: ถ้าผู้ใช้งานที่กำลังดู/พิมพ์ Report มี Role เป็น Officer/Foreman ให้ใส่ชื่อของผู้ใช้ตรงช่อง Foreman
    const isOfficer = isOfficerUser();
    const resolvedForemanName = passedForemanName || header?.foremanName || header?.foreman || (isOfficer ? getDisplayName() : '');

    const showDateCol = Boolean(header?.isMonthly) ||
        Boolean(header?.isDateRange) ||
        Boolean(header?.isAllReport) ||
        Boolean(header?.startDate && header?.endDate && header.startDate !== header.endDate) ||
        Boolean(typeof header?.date === 'string' && (header.date.includes(' ถึง ') || header.date.includes(' - '))) ||
        (Array.isArray(sortedJobs) && new Set(sortedJobs.map(j => CalculationService.safeExtractDate(j?.productionDate || j?.date || j?.createdAt || j?.lotNumber)).filter(Boolean)).size > 1);

    const COL_WIDTHS = getSlitColWidths(showDateCol);

    const cleanDisplayJobNo = (j) => {
        if (!j) return '-';
        const s = String(j).trim();
        if (!s || s === '-' || s.toUpperCase().startsWith('MANUAL') || s.toUpperCase().startsWith('NO-JOB')) {
            return '-';
        }
        return s;
    };

    const getPartAndMaterialNo = (job) => {
        const isT = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('T');
        const isP = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('P');

        // 1. ดึง Item จาก item_mst (รหัสชิ้นงานสำเร็จรูป เช่น TXXXXXXXXXXXXXXX)
        // ข้อกำหนดสำคัญ: หมายเลขชิ้นส่วน Part No. ต้องเป็นรหัสชิ้นงานสำเร็จรูป (เช่น ขึ้นต้นด้วย T) ห้ามขึ้นต้นด้วย P เด็ดขาด
        let partNoVal = (
            (isT(job.partNo) ? job.partNo.trim() : '') ||
            (isT(job.itemMst) ? job.itemMst.trim() : '') ||
            (isT(job.ItemMst) ? job.ItemMst.trim() : '') ||
            (isT(job.finishedItem) ? job.finishedItem.trim() : '') ||
            (isT(job.FinishedItem) ? job.FinishedItem.trim() : '') ||
            (isT(job.productPartNo) ? job.productPartNo.trim() : '') ||
            (isT(job.raw?.itemMst) ? job.raw.itemMst.trim() : '') ||
            (isT(job.raw?.ItemMst) ? job.raw.ItemMst.trim() : '') ||
            (isT(job.raw?.finishedItem) ? job.raw.finishedItem.trim() : '') ||
            (isT(job.raw?.FinishedItem) ? job.raw.FinishedItem.trim() : '') ||
            (isT(job.raw?.item) ? job.raw.item.trim() : '') ||
            (isT(job.item) ? job.item.trim() : '') ||
            (!isP(job.itemMst) && job.itemMst && job.itemMst.trim() !== '-' ? job.itemMst.trim() : '') ||
            (!isP(job.finishedItem) && job.finishedItem && job.finishedItem.trim() !== '-' ? job.finishedItem.trim() : '') ||
            (!isP(job.productPartNo) && job.productPartNo ? job.productPartNo.trim() : '') ||
            (!isP(job.partNo) && job.partNo && job.partNo.trim() !== '-' ? job.partNo.trim() : '') ||
            (!isP(job.item) && job.item && job.item.trim() !== '-' ? job.item.trim() : '') ||
            ''
        );

        // 2. ดึงหมายเลขวัตถุดิบ (รหัสม้วนโฟมวัตถุดิบ เช่น Pxxxxxx หรือค่าที่ผู้ใช้พิมพ์ในโหมด Manual)
        let materialNoVal = (
            (job.materialNo && job.materialNo !== '-' ? job.materialNo.trim() : '') ||
            (job.MaterialNo && job.MaterialNo !== '-' ? job.MaterialNo.trim() : '') ||
            (job.materialItem && job.materialItem !== '-' ? job.materialItem.trim() : '') ||
            (job.MaterialItem && job.MaterialItem !== '-' ? job.MaterialItem.trim() : '') ||
            (isP(job.materialNo) ? job.materialNo.trim() : '') ||
            (isP(job.MaterialNo) ? job.MaterialNo.trim() : '') ||
            (isP(job.materialItem) ? job.materialItem.trim() : '') ||
            (isP(job.MaterialItem) ? job.MaterialItem.trim() : '') ||
            (isP(job.raw?.materialItem) ? job.raw.materialItem.trim() : '') ||
            (isP(job.raw?.MaterialItem) ? job.raw.MaterialItem.trim() : '') ||
            (isP(job.partNo) ? job.partNo.trim() : '') ||
            (isP(job.itemMst) ? job.itemMst.trim() : '') ||
            (isP(job.item) ? job.item.trim() : '') ||
            (isP(job.raw?.item) ? job.raw.item.trim() : '') ||
            ''
        );

        // ตรวจสอบขั้นเด็ดขาด: หาก partNoVal ยังคงขึ้นต้นด้วย P ให้ย้ายไป materialNoVal ทันที และเคลียร์ partNoVal เป็นว่าง
        if (isP(partNoVal)) {
            if (!materialNoVal || materialNoVal === '-') {
                materialNoVal = partNoVal;
            }
            partNoVal = '';
        }

        return {
            partNoVal: partNoVal || '-',
            materialNoVal: materialNoVal || '-'
        };
    };

    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                {/* 1. Header Grid */}
                <View style={styles.headerContainer}>
                    <Text style={styles.title}>{title}</Text>
                    <View style={styles.headerSubRow}>
                        <View style={styles.headerLeft}>
                            <Text style={styles.deptText}>{department}</Text>
                            <Text style={styles.machineText}>{machine}</Text>
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

                {/* 2. Table Container */}
                <View style={styles.tableContainer}>
                    <View style={styles.tableHeaderRow} fixed>
                        <View style={[styles.th, { width: COL_WIDTHS.item }]}>
                            <Text style={styles.thText}>ลำดับ{"\n"}<Text style={styles.subEn}>Item</Text></Text>
                        </View>
                        {showDateCol && (
                            <View style={[styles.th, { width: COL_WIDTHS.date }]}>
                                <Text style={styles.thText}>วันที่ผลิต{"\n"}<Text style={styles.subEn}>Date</Text></Text>
                            </View>
                        )}
                        <View style={[styles.th, { width: COL_WIDTHS.job }]}>
                            <Text style={styles.thText}>เลขที่ Job{"\n"}<Text style={styles.subEn}>Job No.</Text></Text>
                        </View>
                        <View style={[styles.th, { width: COL_WIDTHS.partNo }]}>
                            <Text style={[styles.thText, { fontSize: 6.2 }]}>หมายเลขชิ้นส่วน{"\n"}<Text style={styles.subEn}>Part No.</Text></Text>
                        </View>
                        <View style={[styles.th, { width: COL_WIDTHS.materialNo }]}>
                            <Text style={[styles.thText, { fontSize: 6.2 }]}>หมายเลขวัตถุดิบ{"\n"}<Text style={styles.subEn}>Material No.</Text></Text>
                        </View>
                        <View style={[styles.th, { width: COL_WIDTHS.foamName }]}>
                            <Text style={styles.thText}>ชื่อโฟม{"\n"}<Text style={styles.subEn}>Foam Name</Text></Text>
                        </View>
                        <View style={[styles.th, { width: COL_WIDTHS.actualWidth }]}>
                            <Text style={styles.thText}>ความกว้าง{"\n"}โฟมจริง{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                        </View>

                        {/* ขนาดโฟม */}
                        <View style={{ width: COL_WIDTHS.sizeGroup, borderRightWidth: 0.8, borderColor: '#000', flexDirection: 'column' }}>
                            <View style={{ borderBottomWidth: 0.8, borderColor: '#000', paddingVertical: 2, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={styles.thText}>ขนาดโฟม</Text>
                            </View>
                            <View style={{ flexDirection: 'row', flex: 1, alignItems: 'stretch' }}>
                                <View style={[styles.thSubCol, { width: showDateCol ? '27.91%' : '28.26%' }]}>
                                    <Text style={styles.thSubText}>หนา{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                                <View style={[styles.thSubCol, { width: showDateCol ? '36.04%' : '35.87%' }]}>
                                    <Text style={styles.thSubText}>กว้าง{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                                <View style={[styles.thSubCol, { width: showDateCol ? '36.05%' : '35.87%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thSubText}>ยาว{"\n"}<Text style={styles.subEn}>(m.)</Text></Text>
                                </View>
                            </View>
                        </View>

                        {/* สี */}
                        <View style={[styles.th, { width: COL_WIDTHS.color }]}>
                            <Text style={styles.thText}>สี{"\n"}<Text style={styles.subEn}>Color</Text></Text>
                        </View>
                        {/* LOT NO. */}
                        <View style={[styles.th, { width: COL_WIDTHS.lotMat }]}>
                            <Text style={styles.thText}>Lot number{"\n"}Mat'l</Text>
                        </View>
                        {/* ม้วน LOT */}
                        <View style={[styles.th, { width: COL_WIDTHS.rollLot }]}>
                            <Text style={styles.thText}>ม้วน Lot{"\n"}<Text style={styles.subEn}>(Roll)</Text></Text>
                        </View>

                        {/* First shot */}
                        <View style={{ width: COL_WIDTHS.firstShotGroup, borderRightWidth: 0.8, borderColor: '#000', flexDirection: 'column' }}>
                            <View style={{ borderBottomWidth: 0.8, borderColor: '#000', paddingVertical: 2, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={styles.thText}>First shot</Text>
                            </View>
                            <View style={{ flexDirection: 'row', flex: 1, alignItems: 'stretch' }}>
                                <View style={[styles.thSubCol, { width: showDateCol ? '36.78%' : '36.95%' }]}>
                                    <Text style={styles.thSubText}>หนา{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                                <View style={[styles.thSubCol, { width: showDateCol ? '63.22%' : '63.05%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thSubText}>กว้าง{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                            </View>
                        </View>

                        {/* จำนวนที่ผลิตได้ (PCS.) */}
                        <View style={[styles.th, { width: COL_WIDTHS.producedQty }]}>
                            <Text style={styles.thText}>ผลิตได้{"\n"}<Text style={styles.subEn}>(ม้วน Slit)</Text></Text>
                        </View>
                        {/* จำนวนโฟมที่ใช้ (ROLL) */}
                        <View style={[styles.th, { width: COL_WIDTHS.rollUsed }]}>
                            <Text style={styles.thText}>จำนวนโฟม{"\n"}<Text style={styles.subEn}>(ROLL)</Text></Text>
                        </View>

                        {/* ชิ้นงานเหลือ */}
                        <View style={{ width: COL_WIDTHS.remainGroup, borderRightWidth: 0.8, borderColor: '#000', flexDirection: 'column' }}>
                            <View style={{ borderBottomWidth: 0.8, borderColor: '#000', paddingVertical: 2, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={styles.thText}>ชิ้นงานเหลือ</Text>
                            </View>
                            <View style={{ flexDirection: 'row', flex: 1, alignItems: 'stretch' }}>
                                <View style={[styles.thSubCol, { width: '29.63%' }]}>
                                    <Text style={styles.thSubText}>หนา{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                                <View style={[styles.thSubCol, { width: '35.18%' }]}>
                                    <Text style={styles.thSubText}>กว้าง{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                                </View>
                                <View style={[styles.thSubCol, { width: '35.19%', borderRightWidth: 0 }]}>
                                    <Text style={styles.thSubText}>ยาว{"\n"}<Text style={styles.subEn}>(m.)</Text></Text>
                                </View>
                            </View>
                        </View>

                        {/* NG */}
                        <View style={[styles.th, { width: COL_WIDTHS.ng }]}>
                            <Text style={styles.thText}>NG{"\n"}<Text style={styles.subEn}>(m.)</Text></Text>
                        </View>
                        {/* Loss เกิน STD. */}
                        <View style={[styles.th, { width: COL_WIDTHS.lossOverStd }]}>
                            <Text style={styles.thText}>Loss ด้านข้างที่เกิน{"\n"}STD.{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                        </View>
                        {/* Loss ฝ่ายผลิต */}
                        <View style={[styles.th, { width: COL_WIDTHS.lossProduct }]}>
                            <Text style={styles.thText}>Loss ด้านข้างของ{"\n"}ฝ่ายผลิต{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                        </View>
                        {/* ใช้จริง */}
                        <View style={[styles.th, { width: COL_WIDTHS.actualUsed }]}>
                            <Text style={styles.thText}>จำนวนที่{"\n"}ใช้จริง{"\n"}<Text style={styles.subEn}>(mm.)</Text></Text>
                        </View>
                        {/* % Yield */}
                        <View style={[styles.th, { width: COL_WIDTHS.yield, borderRightWidth: 0, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={[styles.thText, { width: '100%', textAlign: 'center' }]}>% Yield</Text>
                        </View>
                    </View>

                    {/* Job Rows */}
                    {sortedJobs.map((job, idx) => {
                        const { partNoVal, materialNoVal } = getPartAndMaterialNo(job);
                        const foamName = (
                            job.materialType ||
                            job.MaterialType ||
                            job.foamName ||
                            (job.description && !job.description.startsWith(job.partNo) ? job.description.trim().split(/\s+/)[0] : '') ||
                            (job.partNo?.includes('TC-3HR') ? 'TC-3HR' : '') ||
                            '-'
                        );
                        const color = (
                            job.colorName ||
                            job.ColorName ||
                            job.color ||
                            (() => {
                                if (!job.description) return '';
                                const words = job.description.trim().split(/\s+/);
                                const last = words[words.length - 1];
                                return (last && !last.includes('X') && !last.includes('x') && last !== job.partNo) ? last : '';
                            })() ||
                            (job.embossLot?.includes('GY') ? 'GY' : (job.embossLot?.includes('BK') ? 'BK' : '')) ||
                            '-'
                        );
                        const jobList = (job.jobNo || '').split(',').map(s => s.trim()).filter(Boolean);
                        const partList = (partNoVal || job.partNo || '').split(',').map(s => s.trim()).filter(Boolean);
                        let validCuts = (job.firstSheetEntries && Array.isArray(job.firstSheetEntries))
                            ? job.firstSheetEntries.filter(e => (parseFloat(e.width || e.FirstShotWidth) > 0 || parseFloat(e.qty || e.ProductedQty) > 0))
                            : [];

                        if (validCuts.length === 0) {
                            const fallbackW = job.firstSheetWidth ?? job.firstSheetWidth1 ?? job.firstShotWidth;
                            const fallbackQ = job.productedQty ?? job.productedQty1 ?? job.totalProductedQty;
                            if (parseFloat(fallbackW) > 0 || parseFloat(fallbackQ) > 0) {
                                validCuts = [{
                                    jobNo: job.jobNo || '',
                                    partNo: partNoVal || job.partNo || '',
                                    width: fallbackW,
                                    qty: fallbackQ ?? 0
                                }];
                            }
                        }

                        const hasMultiCuts = validCuts.length > 1;
                        const entriesCount = hasMultiCuts ? validCuts.length : 1;
                        const rowHeight = entriesCount > 1 ? Math.max(entriesCount * 13, 24) : 22;

                        const jobProdDate = (CalculationService && typeof CalculationService.safeExtractDate === 'function')
                            ? CalculationService.safeExtractDate(job?.productionDate || job?.date || header?.date || job?.createdAt || job?.lotNumber)
                            : (job?.productionDate || job?.date || header?.date || '');
                        const formattedJobDate = formatSingleDate(jobProdDate);

                        return (
                            <View key={idx} style={[styles.dataRow, { minHeight: rowHeight }]}>
                                <View style={[styles.td, { width: COL_WIDTHS.item }]}><Text style={styles.tdText}>{idx + 1}</Text></View>
                                {showDateCol && (
                                    <View style={[styles.td, { width: COL_WIDTHS.date }]}>
                                        <Text style={[styles.tdText, { fontSize: 5.6 }]}>{formattedJobDate || '-'}</Text>
                                    </View>
                                )}
                                <View style={[styles.td, { width: COL_WIDTHS.job, paddingVertical: 0, paddingHorizontal: 0 }]}>
                                    {hasMultiCuts ? (
                                        validCuts.map((subCut, sIdx) => {
                                            const rawSubJobNo = subCut?.jobNo || jobList[sIdx] || jobList[0] || job.jobNo || '-';
                                            const subJobNo = cleanDisplayJobNo(rawSubJobNo);
                                            return (
                                                <View key={sIdx} style={{
                                                    flex: 1,
                                                    width: '100%',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    borderTopWidth: sIdx === 0 ? 0 : 0.8,
                                                    borderColor: '#000',
                                                    paddingVertical: 1,
                                                }}>
                                                    <Text style={[styles.tdText, { fontSize: 6.2 }]}>{subJobNo}</Text>
                                                </View>
                                            );
                                        })
                                    ) : (
                                        <Text style={styles.tdText}>{cleanDisplayJobNo(validCuts[0]?.jobNo || job.jobNo)}</Text>
                                    )}
                                </View>
                                <View style={[styles.td, { width: COL_WIDTHS.partNo, paddingVertical: 0, paddingHorizontal: 0 }]}>
                                    {hasMultiCuts ? (
                                        validCuts.map((subCut, sIdx) => {
                                            const subPartNo = subCut?.partNo || partList[sIdx] || partList[0] || partNoVal || '-';
                                            return (
                                                <View key={sIdx} style={{
                                                    flex: 1,
                                                    width: '100%',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    borderTopWidth: sIdx === 0 ? 0 : 0.8,
                                                    borderColor: '#000',
                                                    paddingVertical: 1,
                                                }}>
                                                    <Text style={[styles.tdText, { fontSize: 6.2 }]}>{subPartNo}</Text>
                                                </View>
                                            );
                                        })
                                    ) : (
                                        <Text style={styles.tdText}>{validCuts[0]?.partNo || partNoVal}</Text>
                                    )}
                                </View>
                                <View style={[styles.td, { width: COL_WIDTHS.materialNo }]}><Text style={styles.tdText}>{materialNoVal}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.foamName }]}><Text style={styles.tdText}>{foamName}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.actualWidth }]}><Text style={styles.tdText}>{job.actualFoamWidth || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.thickStd }]}><Text style={styles.tdText}>{job.stdThick || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.widthStd }]}><Text style={styles.tdText}>{job.stdWidth || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.lenStd }]}><Text style={styles.tdText}>{job.stdLength || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.color }]}><Text style={styles.tdText}>{color}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.lotMat }]}><Text style={styles.tdText}>{formatLotNo(job.embossLot, job)}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.rollLot }]}><Text style={styles.tdText}>{formatRollLot(job)}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.firstShotThick }]}><Text style={styles.tdText}>{job.firstSheetThick || job.stdThick || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.firstShotWidth, paddingVertical: 0, paddingHorizontal: 0 }]}>
                                    {hasMultiCuts ? (
                                        validCuts.map((subCut, sIdx) => (
                                            <View key={sIdx} style={{
                                                flex: 1,
                                                width: '100%',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                borderTopWidth: sIdx === 0 ? 0 : 0.8,
                                                borderColor: '#000',
                                                paddingVertical: 1,
                                            }}>
                                                <Text style={styles.tdText}>{subCut?.width || '-'}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.tdText}>{validCuts[0]?.width ?? job.firstSheetWidth ?? job.firstSheetWidth1 ?? '-'}</Text>
                                    )}
                                </View>
                                <View style={[styles.td, { width: COL_WIDTHS.producedQty, paddingVertical: 0, paddingHorizontal: 0 }]}>
                                    {hasMultiCuts ? (
                                        validCuts.map((subCut, sIdx) => (
                                            <View key={sIdx} style={{
                                                flex: 1,
                                                width: '100%',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                borderTopWidth: sIdx === 0 ? 0 : 0.8,
                                                borderColor: '#000',
                                                paddingVertical: 1,
                                            }}>
                                                <Text style={styles.tdText}>{subCut?.qty ?? 0}</Text>
                                            </View>
                                        ))
                                    ) : (
                                        <Text style={styles.tdText}>{validCuts[0]?.qty ?? job.productedQty ?? job.productedQty1 ?? job.totalProductedQty ?? 0}</Text>
                                    )}
                                </View>
                                <View style={[styles.td, { width: COL_WIDTHS.rollUsed }]}><Text style={styles.tdText}>{job.rollUsed || 1}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.remainThick }]}><Text style={styles.tdText}>{job.remainThick || job.stdThick || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.remainWidth }]}><Text style={styles.tdText}>{job.remainWidth || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.remainLen }]}><Text style={styles.tdText}>{job.remainLength || job.stdLength || '-'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.ng }]}><Text style={styles.tdText}>{job.ng && job.ng > 0 ? job.ng : ''}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.lossOverStd }]}><Text style={styles.tdText}>{job.lossOverStd || '0'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.lossProduct }]}><Text style={styles.tdText}>{job.lossProduct || '0'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.actualUsed }]}><Text style={styles.tdText}>{job.actualUsedQty || '0'}</Text></View>
                                <View style={[styles.td, { width: COL_WIDTHS.yield, borderRightWidth: 0, justifyContent: 'center', alignItems: 'center' }]}>
                                    <Text style={[styles.tdText, { fontWeight: 700, textAlign: 'center' }]}>{job.yield ?? 0}%</Text>
                                </View>
                            </View>
                        );
                    })}

                    {(!sortedJobs || sortedJobs.length === 0) && (
                        <View style={[styles.dataRow, { minHeight: 28, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={[styles.tdText, { width: '100%', textAlign: 'center', color: '#64748b' }]}>
                                ไม่มีข้อมูลการผลิต
                            </Text>
                        </View>
                    )}

                    {Array.from({ length: Math.max(0, 11 - (sortedJobs?.length || 0)) }).map((_, rIdx) => (
                        <View key={`empty-${rIdx}`} style={[styles.dataRow, { flex: 1, minHeight: 16 }]}>
                            <View style={[styles.td, { width: COL_WIDTHS.item }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            {showDateCol && (
                                <View style={[styles.td, { width: COL_WIDTHS.date }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            )}
                            <View style={[styles.td, { width: COL_WIDTHS.job }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.partNo }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.materialNo }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.foamName }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.actualWidth }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.thickStd }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.widthStd }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.lenStd }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.color }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.lotMat }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.rollLot }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.firstShotThick }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.firstShotWidth }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.producedQty }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.rollUsed }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.remainThick }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.remainWidth }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.remainLen }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.ng }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.lossOverStd }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.lossProduct }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.actualUsed }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                            <View style={[styles.td, { width: COL_WIDTHS.yield, borderRightWidth: 0 }]}><Text style={styles.tdText}>{"\u00A0"}</Text></View>
                        </View>
                    ))}

                    {/* 3. แถวสรุปผลรวมประจำตาราง (Total Summary Row) */}
                    <View style={styles.totalRow}>
                        <View style={[styles.td, { width: COL_WIDTHS.totalSummaryLeft }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>รวม (TOTAL)</Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.widthStd }]}>
                            <Text style={[styles.tdText, { fontWeight: 700, fontSize: 6.0 }]}>
                                {totalStdWidth > 0 ? totalStdWidth.toLocaleString('en-US') : '-'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.totalSummaryMid }]}>
                            <Text style={styles.tdText}>-</Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.producedQty }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>
                                {totalProductedQty > 0 ? totalProductedQty.toLocaleString('en-US') : '0'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.rollUsed }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>
                                {totalRollUsed > 0 ? totalRollUsed.toLocaleString('en-US') : '0'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.remainGroup }]}>
                            <Text style={styles.tdText}>-</Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.ng }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>
                                {totalNg > 0 ? totalNg : '-'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.lossOverStd }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>
                                {totalLossOverStd > 0 ? totalLossOverStd.toFixed(1) : '0'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.lossProduct }]}>
                            <Text style={[styles.tdText, { fontWeight: 700 }]}>
                                {totalLossProduct > 0 ? totalLossProduct.toFixed(1) : '0'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.actualUsed }]}>
                            <Text style={[styles.tdText, { fontWeight: 700, fontSize: 6.0 }]}>
                                {totalActualUsed > 0 ? totalActualUsed.toLocaleString('en-US') : '0'}
                            </Text>
                        </View>
                        <View style={[styles.td, { width: COL_WIDTHS.yield, borderRightWidth: 0, justifyContent: 'center', alignItems: 'center' }]}>
                            <Text style={[styles.tdText, { fontWeight: 700, textAlign: 'center' }]}>
                                {overallYield > 0 ? `${overallYield.toFixed(2)}%` : '0%'}
                            </Text>
                        </View>
                    </View>

                    {/* 4. แถบสรุปผลผลิตตรง Footer (ตามภาพตัวอย่าง: กว้าง STD, จำนวนที่ใช้จริง, % Yield) */}
                    <View style={styles.footerSummaryRow}>
                        <View style={[styles.footerSummaryCell, { width: '33.33%', borderLeftWidth: 0 }]}>
                            <Text style={styles.footerSummaryLabel}>STD. (mm.) :</Text>
                            <Text style={styles.footerSummaryValue}>{totalStdWidth > 0 ? totalStdWidth.toLocaleString('en-US') : '0'}</Text>
                        </View>
                        <View style={[styles.footerSummaryCell, { width: '33.33%' }]}>
                            <Text style={styles.footerSummaryLabel}>ACTUAL (mm.) :</Text>
                            <Text style={styles.footerSummaryValue}>{totalActualUsed > 0 ? totalActualUsed.toLocaleString('en-US') : '0'}</Text>
                        </View>
                        <View style={[styles.footerSummaryCell, { width: '33.34%', borderRightWidth: 0 }]}>
                            <Text style={styles.footerSummaryLabel}>% YIELD :</Text>
                            <Text style={[styles.footerSummaryValue, { fontWeight: 700, fontSize: 7.2 }]}>
                                {overallYield > 0 ? `${overallYield.toFixed(2)}%` : '0.00%'}
                            </Text>
                        </View>
                    </View>

                    {/* 5. Footer Signature Row (จัดตำแหน่งตามตาราง ให้เส้นจรดกันกับคอลัมน์ด้านบน) */}
                    <View style={styles.signatureTableRow}>
                        <View style={[styles.sigTd, { width: '38.5%' }]}>
                            <Text style={styles.sigCellText} numberOfLines={1}>
                                <Text style={{ fontWeight: 700 }}>Operator </Text>
                                <Text>{displayOperators.length > 0 ? displayOperators.join(', ') : '....................................................'}</Text>
                            </Text>
                        </View>
                        <View style={[styles.sigTd, { width: '18.6%' }]}>
                            <Text style={styles.sigCellText} numberOfLines={1}>
                                <Text style={{ fontWeight: 700 }}>Foreman </Text>
                                <Text>{resolvedForemanName ? resolvedForemanName : '..........................................'}</Text>
                            </Text>
                        </View>
                        <View style={[styles.sigTd, { width: '20.8%' }]}>
                            <Text style={styles.sigCellText} numberOfLines={1}>
                                <Text style={{ fontWeight: 700 }}>Supervisor </Text>
                                <Text>.....................................</Text>
                            </Text>
                        </View>
                        <View style={[styles.sigTd, { width: '22.1%', borderRightWidth: 0 }]}>
                            <Text style={styles.sigCellText} numberOfLines={1}>
                                <Text style={{ fontWeight: 700 }}>Manager/Ass't Manager </Text>
                                <Text>.....................................</Text>
                            </Text>
                        </View>
                    </View>
                </View>

                {/* รหัสควบคุมเอกสารใต้ตาราง (Row 26 ตามแบบ Excel) */}
                <View style={{ marginTop: 2, paddingLeft: 1 }}>
                    <Text style={styles.qfCode}>QF-PE-078 ; 06-14-10-56</Text>
                </View>
            </Page>
        </Document>
    );
};

export default SlitReportDocument;
