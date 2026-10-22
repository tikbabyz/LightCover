/**
 * qrLabelUtils.js
 * จัดการฟอร์แมตข้อมูลใน QR Code สำหรับพิมพ์ฉลากติดม้วน (Sticker Label)
 * ตามมาตรฐานที่ระบุในแบบฟอร์มโรงงาน:
 * รูปแบบ: JOB|PART NO.|LOT NO.|ROLL|PROCESS|
 * ตัวอย่าง:
 * - SLIT:     S40G800011|T373778001|2026-09-01|3|3|SLIT|
 * - IPO TUBE: S40G800006|T323778001|2026-09-01|3|3|IPO TUBE|
 */

import QRCode from 'qrcode';

/**
 * สร้าง String ข้อมูลตามฟอร์แมตมาตรฐานของโรงงาน
 */
export const formatQrCodeData = ({
  job = '',
  partNo = '',
  lotNo = '',
  runNo = 1,
  totalRolls = 1,
  process = 'IPO TUBE'
}) => {
  const cleanJob = String(job || '').trim();
  const cleanPartNo = String(partNo || '').trim();
  const cleanLotNo = String(lotNo || '').trim().split('T')[0];
  const rollPart = `${runNo}|${totalRolls}`;
  const cleanProcess = String(process || 'IPO TUBE').trim().toUpperCase();

  // รูปแบบ: JOB|PART NO.|LOT NO.|ROLL|PROCESS|
  return `${cleanJob}|${cleanPartNo}|${cleanLotNo}|${rollPart}|${cleanProcess}|`;
};

/**
 * สกัดความยาวมาตรฐานต่อม้วน (เมตร) จาก Description หรือชื่อสินค้า
 * เช่น "TC-3HR(NT) 5.5X60X200M EMBOSS(100u)SLIT" -> "200"
 * หรือ "IPO ALP6-23(NT) ID7XT6X1000M" -> "1000"
 */
export const extractStickerRollLength = (description = '', defaultLen = '200') => {
  if (!description) return defaultLen;
  // 1. ดักจับแพทเทิร์น X200M, XL500M, X1000M
  const matchX = description.match(/[xX](?:L)?(\d+(?:\.\d+)?)\s*M(?:\.|\b)?/i);
  if (matchX && matchX[1]) return matchX[1];

  // 2. ดักจับตัวเลขตามด้วย M เช่น 200M, 1000M, 500 M.
  const matchM = description.match(/\b(\d+(?:\.\d+)?)\s*M(?:\.|\b)/i);
  if (matchM && matchM[1]) return matchM[1];

  return defaultLen;
};

/**
 * คำนวณหาค่า Qty ที่ถูกต้องสำหรับพิมพ์ฉลากตามกระบวนการ (SLIT vs IPO TUBE vs EMBOSS)
 * - SLIT: ใช้ความยาวต่อม้วนเสมอ (เช่น "200 M.") มีจุดตามสเปกโรงงาน ไม่ใช้จำนวนเส้น (PCS)
 * - IPO TUBE: ใช้ความยาวต่อม้วนเสมอ (เช่น "1,000 M") ไม่มีจุด มีคอมม่าคั่น
 */
export const resolveStickerQty = (roll, job, process = 'SLIT', customDesc = '') => {
  const proc = String(process || '').toUpperCase();
  const isSlit = proc.includes('SLIT');
  const isIpo = proc.includes('IPO');
  const desc = customDesc || roll?.description || job?.description || '';

  // =========================================================================
  // 🔵 [SLIT] คำนวณความยาวต่อม้วน (เช่น 200 M. มีจุดตามสเปก)
  // =========================================================================
  if (isSlit) {
    // สำหรับ Slit: หาความยาวจาก description ก่อนเสมอ (เช่น 200M)
    const fromDesc = extractStickerRollLength(desc, '');
    if (fromDesc && Number(fromDesc) > 0) {
      return `${Number(fromDesc).toLocaleString()} M.`;
    }
    // ถ้าไม่มีใน desc หาจาก stdLength หรือ stdRollLength
    const std = roll?.stdLength || job?.stdLength || roll?.stdRollLength || job?.stdRollLength;
    if (std && Number(std) > 0) {
      return `${Number(std).toLocaleString()} M.`;
    }
    return '200 M.';
  }

  // =========================================================================
  // 🟢 [IPO TUBE] คำนวณความยาวต่อม้วน (เช่น 1,000 M ไม่มีจุด มีคอมม่า)
  // =========================================================================
  if (isIpo) {
    // สำหรับ IPO Tube: ถ้ามี totalMeters หรือ actualMeters ใน roll ที่ระบุไว้เป็นความยาวจริง
    const rawMeters = roll?.totalMeters || roll?.actualMeters;
    if (rawMeters) {
      const num = Number(String(rawMeters).replace(/,/g, '').replace(/m/gi, '').trim());
      if (!isNaN(num) && num > 50) {
        return `${num.toLocaleString()} M`;
      }
    }
    // หาจาก description
    const fromDesc = extractStickerRollLength(desc, '');
    if (fromDesc && Number(fromDesc) > 0) {
      return `${Number(fromDesc).toLocaleString()} M`;
    }
    // หาจาก stdRollLength หรือ default 1,000 M
    const std = roll?.stdRollLength || job?.stdRollLength || job?.stdLength || '1000';
    const numStd = Number(String(std).replace(/,/g, '').replace(/m/gi, '').trim());
    return !isNaN(numStd) && numStd > 0 ? `${numStd.toLocaleString()} M` : `${std} M`;
  }

  // ค่ามาตรฐานกระบวนการอื่น (เช่น EMBOSS)
  const fromDesc = extractStickerRollLength(desc, '200');
  return `${Number(fromDesc).toLocaleString()} M.`;
};

/**
 * สร้าง Data URL ของรูป QR Code (PNG) สำหรับนำไปแสดงผลหรือพิมพ์
 */
export const generateQrDataUrl = async (text, options = {}) => {
  try {
    const opts = {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: options.width || 140,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      ...options
    };
    return await QRCode.toDataURL(text, opts);
  } catch (err) {
    console.error('[generateQrDataUrl error]:', err);
    return '';
  }
};

