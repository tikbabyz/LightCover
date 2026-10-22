import React from 'react';
import {
  Document,
  Page,
  Text,
  Image,
  View,
  StyleSheet,
  Font,
  pdf
} from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { formatQrCodeData } from '../../utils/qrLabelUtils';

// Register Sarabun font if available in client public
try {
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
} catch (e) {
  console.warn('[StickerPdfDocument] Font registration notice:', e);
}

// 100mm x 45mm in PDF Points:
// 100mm = (100 / 25.4) * 72 = 283.46 pt
// 45mm  = (45 / 25.4) * 72  = 127.56 pt
const styles = StyleSheet.create({
  page: {
    width: 283.46,
    height: 127.56,
    padding: 4.5,
    backgroundColor: '#ffffff',
    fontFamily: 'Sarabun',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  table: {
    width: '100%',
    height: '100%',
    borderWidth: 1.5,
    borderColor: '#000000',
    borderStyle: 'solid',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },
  topSection: {
    flexDirection: 'row',
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
  },
  qrCell: {
    width: '33%',
    borderRightWidth: 1.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  qrImage: {
    width: 78,
    height: 78,
    objectFit: 'contain',
  },
  rightDataCol: {
    width: '67%',
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    height: 19,
    alignItems: 'center',
  },
  descRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#000000',
    borderBottomStyle: 'solid',
    flex: 1,
    alignItems: 'center',
  },
  lastDataRow: {
    flexDirection: 'row',
    height: 19,
    alignItems: 'center',
  },
  fieldLabel: {
    width: '37%',
    borderRightWidth: 1.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    paddingLeft: 4,
    height: '100%',
    justifyContent: 'center',
  },
  fieldValue: {
    width: '63%',
    paddingLeft: 4,
    paddingRight: 2,
    height: '100%',
    justifyContent: 'center',
  },
  labelTxt: {
    fontSize: 8.5,
    fontWeight: 'bold',
    color: '#000000',
  },
  valTxt: {
    fontSize: 8.5,
    color: '#000000',
  },
  descTxt: {
    fontSize: 7.2,
    color: '#000000',
    lineHeight: 1.15,
    fontWeight: 'bold',
  },
  bottomSection: {
    flexDirection: 'row',
    height: 22,
    alignItems: 'center',
  },
  rollCell: {
    width: '33%',
    borderRightWidth: 1.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollTxt: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000000',
  },
  qtyLabelCell: {
    width: '24.79%', // 67% * 37%
    borderRightWidth: 1.5,
    borderRightColor: '#000000',
    borderRightStyle: 'solid',
    height: '100%',
    paddingLeft: 4,
    justifyContent: 'center',
  },
  qtyValCell: {
    width: '42.21%',
    height: '100%',
    paddingLeft: 4,
    justifyContent: 'center',
  },
  qtyTxt: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#000000',
  },
});

/**
 * StickerPdfDocument
 * เรนเดอร์สติ๊กเกอร์ขนาด 100 x 45 มม. สำหรับบันทึกเป็นไฟล์ PDF ตามมาตรฐานโรงงาน
 */
export const StickerPdfDocument = ({ items = [] }) => {
  return (
    <Document title="Sticker Labels">
      {items.map((item, index) => (
        <Page key={`page_${index}`} size={[283.46, 127.56]} style={styles.page}>
          <View style={styles.table}>
            {/* Top Area: QR Code on left, 4 Rows on right */}
            <View style={styles.topSection}>
              {/* Left QR Cell */}
              <View style={styles.qrCell}>
                {item.qrDataUrl ? (
                  <Image src={item.qrDataUrl} style={styles.qrImage} />
                ) : (
                  <Text style={{ fontSize: 7, color: '#64748b' }}>QR CODE</Text>
                )}
              </View>

              {/* Right Table Column */}
              <View style={styles.rightDataCol}>
                {/* Row 1: Job */}
                <View style={styles.row}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.labelTxt}>Job :</Text>
                  </View>
                  <View style={styles.fieldValue}>
                    <Text style={[styles.valTxt, { fontWeight: 'bold' }]}>
                      {item.job || '-'}
                    </Text>
                  </View>
                </View>

                {/* Row 2: Part No. */}
                <View style={styles.row}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.labelTxt}>Part No. :</Text>
                  </View>
                  <View style={styles.fieldValue}>
                    <Text style={[styles.valTxt, { fontWeight: 'bold' }]}>
                      {item.partNo || '-'}
                    </Text>
                  </View>
                </View>

                {/* Row 3: Description */}
                <View style={styles.descRow}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.labelTxt}>Description :</Text>
                  </View>
                  <View style={styles.fieldValue}>
                    <Text style={styles.descTxt}>
                      {item.description || '-'}
                    </Text>
                  </View>
                </View>

                {/* Row 4: Lot No. */}
                <View style={styles.lastDataRow}>
                  <View style={styles.fieldLabel}>
                    <Text style={styles.labelTxt}>Lot No. :</Text>
                  </View>
                  <View style={styles.fieldValue}>
                    <Text style={styles.valTxt}>
                      {item.lotNo || '-'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Bottom Row: Roll No. on left, Qty on right */}
            <View style={styles.bottomSection}>
              <View style={styles.rollCell}>
                <Text style={styles.rollTxt}>
                  Roll : {item.runNo}/{item.totalRolls}
                </Text>
              </View>
              <View style={styles.qtyLabelCell}>
                <Text style={styles.labelTxt}>Qty :</Text>
              </View>
              <View style={styles.qtyValCell}>
                <Text style={styles.qtyTxt}>
                  {item.qty || '-'}
                </Text>
              </View>
            </View>
          </View>
        </Page>
      ))}
    </Document>
  );
};

/**
 * downloadStickersPdf
 * ฟังก์ชันสร้างและดาวน์โหลดไฟล์ PDF โดยตรงลงเครื่องผู้ใช้ทันที (Direct Download)
 */
export async function downloadStickersPdf({
  rolls = [],
  jobSummary = {},
  processName = 'IPO TUBE',
  copiesPerRoll = 1,
  resolveStickerQty
}) {
  const safeJobNo = String(jobSummary.jobNo || 'JOB').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeProcess = String(processName || 'ROLL').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeJobNo}_Sticker_Label_${safeProcess}.pdf`;

  // 1. เตรียมข้อมูลของแต่ละสติ๊กเกอร์
  const rollItems = [];
  for (let idx = 0; idx < rolls.length; idx++) {
    const r = rolls[idx];
    const rNo = r.runNo || r.sequenceNo || (idx + 1);
    const rJob = r.jobNo || jobSummary.jobNo || '';
    const rPart = r.partNo || jobSummary.partNo || '';
    const rDesc = r.description || jobSummary.description || '';
    const rLot = (r.lotNo || jobSummary.lotNo || '').split('T')[0];
    const rTotal = r.totalRolls || jobSummary.totalRolls || 1;
    const rQty = resolveStickerQty
      ? resolveStickerQty(r, jobSummary, processName, rDesc)
      : (r.qty || '-');

    const qrRaw = formatQrCodeData({
      job: rJob,
      partNo: rPart,
      lotNo: rLot,
      runNo: rNo,
      totalRolls: rTotal,
      process: processName
    });

    const qrDataUrl = await QRCode.toDataURL(qrRaw, {
      width: 250,
      margin: 1,
      errorCorrectionLevel: 'M'
    });

    // ทำซ้ำตาม copiesPerRoll
    for (let c = 0; c < copiesPerRoll; c++) {
      rollItems.push({
        job: rJob,
        partNo: rPart,
        description: rDesc,
        lotNo: rLot,
        runNo: rNo,
        totalRolls: rTotal,
        qty: rQty,
        qrDataUrl
      });
    }
  }

  // 2. สร้าง PDF Blob โดยใช้ @react-pdf/renderer
  const doc = <StickerPdfDocument items={rollItems} />;
  const instance = pdf(doc);
  const blob = await instance.toBlob();

  // 3. ทริกเกอร์ดาวน์โหลดลงเครื่องทันที (Direct Download)
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(downloadUrl);
  }, 2000);

  return { fileName, count: rollItems.length };
}

export default StickerPdfDocument;
