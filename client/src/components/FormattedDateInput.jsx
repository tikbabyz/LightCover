import React, { useMemo, useRef } from 'react';
import { Calendar, X } from 'lucide-react';

export const FormattedDateInput = ({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className = "",
  style = {}
}) => {
  const inputRef = useRef(null);

  const displayValue = useMemo(() => {
    if (!value) return '';
    try {
      const cleanStr = String(value).trim();
      const parts = cleanStr.includes('T') ? cleanStr.split('T')[0].split('-') : cleanStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD/MM/YYYY
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
        return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
      return cleanStr;
    } catch {
      return value;
    }
  }, [value]);

  const handleOpenPicker = () => {
    if (inputRef.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        try {
          inputRef.current.showPicker();
        } catch {
          inputRef.current.focus();
        }
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div
      onClick={handleOpenPicker}
      style={style}
      className={`relative flex items-center justify-between px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 cursor-pointer transition-all shadow-xs h-[34px] ${className}`}
    >
      <span className={`select-none font-medium truncate ${displayValue ? 'text-slate-800' : 'text-slate-400 font-normal'}`}>
        {displayValue || placeholder}
      </span>

      <div className="flex items-center gap-1 shrink-0 ml-1">
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
            title="ล้างวันที่"
          >
            <X size={13} />
          </button>
        ) : null}
        <Calendar size={14} className="text-slate-400 shrink-0" />
      </div>

      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10"
        tabIndex={-1}
      />
    </div>
  );
};

export default FormattedDateInput;
