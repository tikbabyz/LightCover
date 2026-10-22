import React from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

/**
 * Confirm Modal Dialog
 * ดีไซน์แบบเดียวกับหน้าต่างยืนยันการออกจากระบบ (Logout Modal) ใน Navbar
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  title = 'ยืนยันการลบข้อมูล',
  message = 'คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?',
  subMessage = '',
  confirmText = 'ลบข้อมูล',
  cancelText = 'ยกเลิก',
  confirmIcon: ConfirmIcon = Trash2
}) => {
  if (!isOpen) return null;

  const handleClose = onClose || onCancel;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn cursor-pointer"
        onClick={handleClose}
      />

      {/* Modal Box */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 animate-fadeIn">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                {message}
              </p>
              {subMessage && (
                <p className="mt-1 text-xs text-red-500 font-medium">
                  {subMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl active:scale-95 transition-all cursor-pointer shadow-sm"
          >
            {ConfirmIcon && <ConfirmIcon size={15} />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
