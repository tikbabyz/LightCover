import React, { useState, useEffect } from 'react';
import { formatQrCodeData, generateQrDataUrl } from '../../utils/qrLabelUtils';

/**
 * RollStickerCard
 * คอมโพเนนต์แสดงผลฉลากติดม้วน (Sticker Label) พร้อม QR Code
 * ออกแบบตามสเปกมาตรฐานของโรงงาน (ตรงตามรูปต้นแบบ 1:1)
 * 
 * Props:
 * - job: เลขที่ Job (เช่น "S40G800011")
 * - partNo: รหัสชิ้นส่วน (เช่น "T373778001")
 * - description: คำอธิบายสินค้า (เช่น "TC-3HR(NT) 5.5X60X200M EMBOSS(100u)SLIT")
 * - lotNo: วันที่ผลิต / Lot No. (เช่น "2026-09-01")
 * - runNo: ลำดับม้วน (เช่น 3)
 * - totalRolls: จำนวนม้วนทั้งหมดของ Job (เช่น 3)
 * - qty: ความยาวหรือจำนวน (เช่น "200 M." หรือ "1,000 M")
 * - process: "SLIT" หรือ "IPO TUBE"
 * - showRawCodeText: แสดงข้อความ raw QR ใต้ฉลาก (default: true)
 */
export const RollStickerCard = ({
  job = '',
  partNo = '',
  description = '',
  lotNo = '',
  runNo = 1,
  totalRolls = 1,
  qty = '',
  process = 'IPO TUBE',
  showRawCodeText = true,
  className = '',
  style = {}
}) => {
  const [qrDataUrl, setQrDataUrl] = useState('');

  const qrRawString = formatQrCodeData({
    job,
    partNo,
    lotNo,
    runNo,
    totalRolls,
    process
  });

  useEffect(() => {
    let isMounted = true;
    generateQrDataUrl(qrRawString, { width: 130 }).then((url) => {
      if (isMounted) setQrDataUrl(url);
    });
    return () => {
      isMounted = false;
    };
  }, [qrRawString]);

  // จัดการฟอร์แมตวันที่ให้อยู่ในรูป YYYY-MM-DD
  const formattedLotNo = (() => {
    if (!lotNo) return '';
    try {
      const clean = String(lotNo).trim().split('T')[0];
      return clean;
    } catch {
      return String(lotNo);
    }
  })();

  // จัดการฟอร์แมต Qty ให้มีหน่วยกำกับ (เช่น 200 M. หรือ 1,000 M)
  const formattedQty = (() => {
    if (!qty && qty !== 0) return '-';
    const s = String(qty).trim();
    const isSlit = String(process || '').toUpperCase().includes('SLIT');
    if (s.toLowerCase().includes('m')) {
      // ให้แน่ใจว่าถ้าเป็น Slit จะลงท้ายด้วย M. ตามสเปก (มีจุด) และ IPO TUBE ไม่มีจุด
      if (isSlit && !s.endsWith('.')) {
        return `${s}.`;
      }
      if (!isSlit && s.endsWith('.')) {
        return s.slice(0, -1);
      }
      return s;
    }
    const n = Number(s.replace(/,/g, ''));
    if (!isNaN(n)) {
      if (isSlit) {
        return `${n.toLocaleString()} M.`;
      }
      return `${n.toLocaleString()} M`;
    }
    return isSlit ? `${s} M.` : `${s} M`;
  })();

  return (
    <div
      className={`sticker-label-wrapper ${className}`}
      style={{
        fontFamily: "'Segoe UI', 'Sarabun', Arial, sans-serif",
        color: '#000000',
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '460px',
        padding: '12px 14px',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {/* ── Main Sticker Box (Bordered Table matching Factory standard 1:1) ── */}
      <table
        className="sticker-border-box sticker-border-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '2px solid #000000',
          backgroundColor: '#ffffff',
          boxSizing: 'border-box',
          tableLayout: 'fixed'
        }}
      >
        <tbody>
          {/* Row 1: Job */}
          <tr>
            {/* Left QR Column (spanning 4 rows) */}
            <td
              rowSpan={4}
              className="cell-qr"
              style={{
                width: '33%',
                borderRight: '2px solid #000000',
                borderBottom: '2px solid #000000',
                textAlign: 'center',
                verticalAlign: 'middle',
                padding: '4px',
                backgroundColor: '#ffffff'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: '100%'
                }}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Roll QR Code"
                    style={{
                      width: '100%',
                      maxWidth: '96px',
                      aspectRatio: '1/1',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                      display: 'block',
                      margin: '0 auto'
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '90px',
                      height: '90px',
                      backgroundColor: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      color: '#64748b',
                      margin: '0 auto'
                    }}
                  >
                    กำลังสร้าง QR...
                  </div>
                )}
              </div>
            </td>

            {/* Job Label */}
            <td
              className="cell-label"
              style={{
                width: '24%',
                borderRight: '2px solid #000000',
                borderBottom: '2px solid #000000',
                padding: '3px 6px',
                fontWeight: 800,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              Job :
            </td>

            {/* Job Value */}
            <td
              className="cell-val"
              style={{
                borderBottom: '2px solid #000000',
                padding: '3px 8px',
                fontWeight: 800,
                fontSize: '12.5px',
                letterSpacing: '0.3px',
                wordBreak: 'break-all',
                verticalAlign: 'middle'
              }}
            >
              {job || '-'}
            </td>
          </tr>

          {/* Row 2: Part No. */}
          <tr>
            <td
              className="cell-label"
              style={{
                borderRight: '2px solid #000000',
                borderBottom: '2px solid #000000',
                padding: '3px 6px',
                fontWeight: 800,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              Part No. :
            </td>
            <td
              className="cell-val"
              style={{
                borderBottom: '2px solid #000000',
                padding: '3px 8px',
                fontWeight: 700,
                fontSize: '12px',
                wordBreak: 'break-all',
                verticalAlign: 'middle'
              }}
            >
              {partNo || '-'}
            </td>
          </tr>

          {/* Row 3: Description */}
          <tr>
            <td
              className="cell-label"
              style={{
                borderRight: '2px solid #000000',
                borderBottom: '2px solid #000000',
                padding: '3px 6px',
                fontWeight: 800,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              Description :
            </td>
            <td
              className="cell-val cell-desc"
              style={{
                borderBottom: '2px solid #000000',
                padding: '2px 8px',
                fontWeight: 700,
                fontSize: '10.5px',
                lineHeight: '1.25',
                wordBreak: 'break-word',
                verticalAlign: 'middle'
              }}
            >
              {description || '-'}
            </td>
          </tr>

          {/* Row 4: Lot No. */}
          <tr>
            <td
              className="cell-label"
              style={{
                borderRight: '2px solid #000000',
                borderBottom: '2px solid #000000',
                padding: '3px 6px',
                fontWeight: 800,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              Lot No. :
            </td>
            <td
              className="cell-val"
              style={{
                borderBottom: '2px solid #000000',
                padding: '3px 8px',
                fontWeight: 700,
                fontSize: '12px',
                verticalAlign: 'middle'
              }}
            >
              {formattedLotNo || '-'}
            </td>
          </tr>

          {/* Row 5: Roll & Qty (Bottom Row) */}
          <tr>
            <td
              className="cell-roll"
              style={{
                borderRight: '2px solid #000000',
                textAlign: 'center',
                verticalAlign: 'middle',
                padding: '4px 2px',
                fontWeight: 800,
                fontSize: '12.5px',
                letterSpacing: '0.3px',
                whiteSpace: 'nowrap'
              }}
            >
              Roll : {runNo}/{totalRolls}
            </td>
            <td
              className="cell-label cell-qty-label"
              style={{
                borderRight: '2px solid #000000',
                padding: '4px 6px',
                fontWeight: 800,
                fontSize: '12px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              Qty :
            </td>
            <td
              className="cell-val cell-qty"
              style={{
                padding: '4px 8px',
                fontWeight: 800,
                fontSize: '13px',
                whiteSpace: 'nowrap',
                verticalAlign: 'middle'
              }}
            >
              {formattedQty}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Subtitle / QR Raw Data Guide (matching image bottom note) ── */}
      {showRawCodeText && (
        <div
          className="qr-raw-text-note no-print"
          style={{
            marginTop: '8px',
            fontSize: '11px',
            color: '#334155'
          }}
        >
          <div style={{ fontWeight: 700 }}>
            ข้อมูลใน QR Code: <span style={{ fontWeight: 500, color: '#475569' }}>JOB|PART NO.|LOT NO.|ROLL|PROCESS</span>
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              backgroundColor: '#f8fafc',
              padding: '3px 6px',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              marginTop: '3px',
              wordBreak: 'break-all',
              color: '#0f172a'
            }}
          >
            {qrRawString}
          </div>
        </div>
      )}
    </div>
  );
};

export default RollStickerCard;
