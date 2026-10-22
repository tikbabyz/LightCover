/**
 * downtimeUtils.js
 * รวมฟังก์ชันจัดการเวลาสูญเสีย (Downtime / Lost Time) กลาง เพื่อใช้ร่วมกันทั้งระบบ
 * ป้องกัน Code Duplication ระหว่าง Create Page, Context และ Report
 */

/**
 * คำนวณ Downtime (นาที) จากข้อความ เช่น "08:00-08:30 ประชุม" (30 นาที) หรือ "30 นาที"
 * รองรับการคำนวณข้ามเที่ยงคืน (Overnight Shift เช่น 23:30 - 00:30)
 */
export const parseDowntimeMinutesFromNote = (note) => {
  if (!note) return 0;
  const str = String(note);
  let totalMinutes = 0;

  // 1. ตรวจจับช่วงเวลา เช่น 08:00-08:30, 8:00 - 8:30, 08.00-08.30
  const timeRangeRegex = /(\b[0-2]?\d)[:.](\d{2})\s*[-–—to~]\s*([0-2]?\d)[:.](\d{2})\b/gi;
  let match;
  let foundRange = false;
  while ((match = timeRangeRegex.exec(str)) !== null) {
    const startH = parseInt(match[1], 10);
    const startM = parseInt(match[2], 10);
    const endH = parseInt(match[3], 10);
    const endM = parseInt(match[4], 10);
    if (startH < 24 && startM < 60 && endH < 24 && endM < 60) {
      const startTotal = startH * 60 + startM;
      let endTotal = endH * 60 + endM;
      // กะดึกข้ามเที่ยงคืน
      if (endTotal < startTotal) {
        endTotal += 24 * 60;
      }
      const diff = endTotal - startTotal;
      if (diff > 0 && diff < 24 * 60) {
        totalMinutes += diff;
        foundRange = true;
      }
    }
  }
  if (foundRange && totalMinutes > 0) return totalMinutes;

  // 2. ตรวจจับตัวเลขที่ระบุเป็นนาที เช่น "30 นาที", "15 mins", "45 min"
  const minRegex = /(\d+(?:\.\d+)?)\s*(?:นาที|min(?:ute)?s?)\b/gi;
  while ((match = minRegex.exec(str)) !== null) {
    const m = parseFloat(match[1]);
    if (m > 0 && m < 1440) {
      totalMinutes += Math.round(m);
    }
  }

  return totalMinutes;
};

/**
 * แยกข้อมูลเวลาเสียระหว่างการผลิต (ช่วงเวลา, สาเหตุ) ออกจากหมายเหตุทั่วไป
 * รองรับการดึงข้อมูลทั้งแบบช่วงเดียว และหลายช่วง (Multiple Lost Time Entries)
 */
export const extractLostTimeAndGeneralNote = (rawNote) => {
  if (!rawNote) {
    return {
      hasLostTime: false,
      lostTimeStart: '',
      lostTimeEnd: '',
      lostTimeReason: '',
      lostTimeMinutes: 0,
      entries: [],
      generalNote: ''
    };
  }
  const str = String(rawNote);

  // 1. Bracket format: ตรวจจับรูปแบบ [เวลาเสีย: 10:00-10:45 ล้างเครื่อง (45 นาที)] หรือ [LOST TIME: ...]
  const bracketRegex = /\[(?:เวลาเสีย|LOST TIME|Downtime)[:\s]*([0-2]?\d[:.][0-5]\d)\s*[-–—to~]\s*([0-2]?\d[:.][0-5]\d)\s*(.*?)(?:\((.*?)\))?\]/gi;
  let bMatch;
  const bracketEntries = [];
  while ((bMatch = bracketRegex.exec(str)) !== null) {
    const start = bMatch[1].replace('.', ':');
    const end = bMatch[2].replace('.', ':');
    const reason = (bMatch[3] || '').trim();
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    bracketEntries.push({
      start,
      end,
      reason,
      minutes: diff > 0 ? diff : 0
    });
  }

  if (bracketEntries.length > 0) {
    const genNote = str.replace(bracketRegex, '').replace(/\n\s*\n/g, '\n').trim();
    const totalMins = bracketEntries.reduce((sum, e) => sum + e.minutes, 0);
    return {
      hasLostTime: true,
      lostTimeStart: bracketEntries[0].start,
      lostTimeEnd: bracketEntries[0].end,
      lostTimeReason: bracketEntries.map(e => e.reason).filter(Boolean).join(', ') || bracketEntries[0].reason,
      lostTimeMinutes: totalMins,
      entries: bracketEntries,
      generalNote: genNote
    };
  }

  // 2. Multiline check: ตรวจสอบบรรทัดที่มีช่วงเวลาและสาเหตุ
  const lines = str.split('\n').map(l => l.trim()).filter(Boolean);
  const lineEntries = [];
  let remainingLines = [];

  const timeRegex = /^([0-2]?\d[:.][0-5]\d)\s*[-–—to~]\s*([0-2]?\d[:.][0-5]\d)\s*(.*)$/i;
  for (const l of lines) {
    const m = l.match(timeRegex);
    if (m && !l.includes('เริ่มงาน')) {
      const start = m[1].replace('.', ':');
      const end = m[2].replace('.', ':');
      const reason = (m[3] || '').replace(/^\(|\)$/g, '').trim();
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      let diff = (eH * 60 + eM) - (sH * 60 + sM);
      if (diff < 0) diff += 24 * 60;
      lineEntries.push({
        start,
        end,
        reason,
        minutes: diff > 0 ? diff : 0
      });
    } else {
      remainingLines.push(l);
    }
  }

  if (lineEntries.length > 0) {
    const totalMins = lineEntries.reduce((sum, e) => sum + e.minutes, 0);
    return {
      hasLostTime: true,
      lostTimeStart: lineEntries[0].start,
      lostTimeEnd: lineEntries[0].end,
      lostTimeReason: lineEntries.map(e => e.reason).filter(Boolean).join(', ') || lineEntries[0].reason,
      lostTimeMinutes: totalMins,
      entries: lineEntries,
      generalNote: remainingLines.join('\n')
    };
  }

  // 3. Fallback: ไม่มีช่วงเวลาชัดเจน
  const mins = parseDowntimeMinutesFromNote(str);
  return {
    hasLostTime: mins > 0,
    lostTimeStart: '',
    lostTimeEnd: '',
    lostTimeReason: mins > 0 ? str : '',
    lostTimeMinutes: mins,
    entries: [],
    generalNote: str
  };
};

/**
 * ทำความสะอาดข้อความ Downtime Note โดยคงการตัดบรรทัดไว้
 */
export const cleanDowntimeNote = (val) => {
  if (!val) return '';
  return String(val)
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
};
