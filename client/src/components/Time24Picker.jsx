import React, { useRef } from 'react';
import { Clock } from 'lucide-react';

export const Time24Picker = ({
    label = '',
    value = '',
    onChange,
    placeholder = 'HH:MM',
    className = '',
    inputRef = null,
    onEnterNext = null,
    labelStyle = {},
    inputStyle = {},
    isHighlight = false,
    hasError = false,
}) => {
    const internalRef = useRef(null);
    const activeRef = inputRef || internalRef;
    const isRequired = isHighlight || (typeof label === 'string' && label.includes('*'));

    // ดึงเวลาปัจจุบันมาใส่ (HH:mm)
    const handleSetNow = () => {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        onChange(`${hh}:${mm}`);
    };

    // พิมพ์ตัวเลข 4 หลักตรงๆ ได้อย่างชาญฉลาด (Auto-format HH:mm)
    const handleInputChange = (e) => {
        const raw = e.target.value.replace(/[^0-9:]/g, '');

        if (!raw) {
            onChange('');
            return;
        }

        // กรณีมี colon อยู่แล้ว
        if (raw.includes(':')) {
            const parts = raw.split(':');
            const h = parts[0].slice(0, 2);
            const m = (parts[1] || '').slice(0, 2);
            onChange(`${h}:${m}`);
            return;
        }

        // พิมพ์เลขล้วน 1-4 หลัก
        if (raw.length <= 2) {
            onChange(raw);
        } else if (raw.length <= 4) {
            onChange(`${raw.slice(0, 2)}:${raw.slice(2)}`);
        }
    };

    // จัดรูปแบบให้ถูกต้องเมื่อกดออกจากช่อง (Blur)
    const handleInputBlur = (e) => {
        const clean = (e.target.value || '').trim();
        if (!clean) return;

        // ตัวเลข 1-2 หลัก เช่น '8' หรือ '14' -> '08:00', '14:00'
        if (/^\d{1,2}$/.test(clean)) {
            const h = Math.min(23, Math.max(0, parseInt(clean, 10)));
            onChange(`${String(h).padStart(2, '0')}:00`);
        }
        // ตัวเลข 3 หลัก เช่น '830' -> '08:30'
        else if (/^\d{3}$/.test(clean)) {
            const h = Math.min(23, parseInt(clean.slice(0, 1), 10));
            const m = Math.min(59, parseInt(clean.slice(1), 10));
            onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
        // ตัวเลข 4 หลัก เช่น '0830' หรือ '1445' -> '08:30', '14:45'
        else if (/^\d{4}$/.test(clean)) {
            const h = Math.min(23, parseInt(clean.slice(0, 2), 10));
            const m = Math.min(59, parseInt(clean.slice(2), 10));
            onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
        // มีโคลอน เช่น '8:3' หรือ '14:5'
        else if (/^\d{1,2}:\d{1,2}$/.test(clean)) {
            const [hRaw, mRaw] = clean.split(':');
            const h = Math.min(23, parseInt(hRaw, 10) || 0);
            const m = Math.min(59, parseInt(mRaw, 10) || 0);
            onChange(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    };

    // ปรับเวลาด้วยลูกศรขึ้น/ลง (+15 / -15 นาที) หรือ Enter เพื่อตกลง
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleInputBlur(e);
            if (onEnterNext) {
                e.preventDefault();
                onEnterNext();
            } else {
                e.target.blur();
            }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = e.key === 'ArrowUp' ? 15 : -15;
            let [h, m] = (value && value.includes(':'))
                ? value.split(':').map(Number)
                : [8, 0];
            if (isNaN(h)) h = 8;
            if (isNaN(m)) m = 0;

            let total = h * 60 + m + delta;
            const DAY = 24 * 60;
            total = ((total % DAY) + DAY) % DAY;

            const newH = String(Math.floor(total / 60)).padStart(2, '0');
            const newM = String(total % 60).padStart(2, '0');
            onChange(`${newH}:${newM}`);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Header: Label + ปุ่ม "ตอนนี้" วางไว้ข้างบน ไม่บังตัวเลขในช่อง input */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px', minHeight: '20px' }}>
                {label && (
                    <label className="form-field-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', fontSize: '12.5px', fontWeight: 800, color: hasError ? '#dc2626' : (isRequired ? '#1e3a8a' : '#334155'), ...labelStyle }}>
                        {label}
                    </label>
                )}
                <button
                    type="button"
                    onClick={handleSetNow}
                    style={{

                        color: '#1d4ed8',
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '2px 7px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        lineHeight: 1.2,
                        height: '24px',
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                    }}
                    className="hover:bg-blue-100 hover:border-blue-400 hover:text-blue-900 active:scale-95"
                    title="ดึงเวลาปัจจุบัน (HH:mm)"
                >
                    <Clock size={17} strokeWidth={2.4} />
                </button>
            </div>

            {/* Input Box: กว้างเต็มช่อง 100% ตัวเลขใหญ่ชัดเจน ไม่มีปุ่มมาทับ */}
            <input
                ref={activeRef}
                type="text"
                inputMode="numeric"
                className={`form-field-input ${className}`}
                style={{
                    textAlign: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                    letterSpacing: '0.5px',
                    height: '36px',
                    padding: '2px 6px',
                    borderRadius: '7px',
                    border: hasError ? '2px solid #ef4444' : (isRequired ? '2px solid #3b82f6' : '1.5px solid #cbd5e1'),
                    background: hasError ? '#fef2f2' : (isRequired ? '#eff6ff' : '#ffffff'),
                    color: hasError ? '#b91c1c' : (isRequired ? '#1e3a8a' : '#0f172a'),
                    width: '100%',
                    boxSizing: 'border-box',
                    ...inputStyle
                }}
                placeholder={placeholder}
                maxLength={5}
                value={value}
                onFocus={(e) => {
                    // ไฮไลต์ข้อความเดิมทั้งหมด เพื่อให้พนักงานพิมพ์เลข 4 หลักทับได้ทันที
                    e.target.select();
                }}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
            />
        </div>
    );
};


