import React, { useState } from 'react';
import { Edit2, Save, X, AlertTriangle } from 'lucide-react';
import { CalculationService } from '../../../services/calculationService';
export const EditJobModal = ({ job, onSave, onClose }) => {
    const rawLotStr = String(job.embossLot || job.slitLot || job.lotNo || '');
    const initialRollDetails = CalculationService.extractEmbossDetails(rawLotStr);
    const [actualFoamWidth, setActualFoamWidth] = useState(job.actualFoamWidth);
    const [firstSheetWidth, setFirstSheetWidth] = useState(job.firstSheetWidth);
    const [firstSheetThick, setFirstSheetThick] = useState(job.firstSheetThick);
    const [productedQty, setProductedQty] = useState(job.productedQty);
    const [embossLot, setEmbossLot] = useState(
        initialRollDetails.lotDate || CalculationService.formatToYYYYMMDD(rawLotStr.replace(/\(.*?\)/g, '')) || rawLotStr || ''
    );
    const initialRoll = job.slitRoll ?? job.slit_roll ?? job.rollSlit ?? job.roll_slit ?? job.embossRoll ?? job.EmbossRoll ?? initialRollDetails.rollNo ?? '';
    const initialTotalRoll = job.slitTotalRoll ?? job.slit_total_roll ?? job.totalRollSlit ?? job.total_roll_slit ?? job.embossTotalRoll ?? job.EmbossTotalRoll ?? initialRollDetails.totalRolls ?? '';
    const [embossRoll, setEmbossRoll] = useState(initialRoll);
    const [embossTotalRoll, setEmbossTotalRoll] = useState(initialTotalRoll);
    const [rollUsed, setRollUsed] = useState(job.rollUsed || 1);
    const [ngQty, setNgQty] = useState(job.ng || 0);
    const [ngReason, setNgReason] = useState(job.ngReason || '');

    const handleLotChange = (val) => {
        const parsed = CalculationService.extractEmbossDetails(val);
        if (parsed.lotDate) {
            setEmbossLot(parsed.lotDate);
            if (parsed.rollNo) setEmbossRoll(parsed.rollNo);
            if (parsed.totalRolls) setEmbossTotalRoll(parsed.totalRolls);
        } else {
            setEmbossLot(val);
        }
    };

    // Calculate live preview metrics
    const previewCalc = CalculationService.calculatePipeLineMetrics({
        stdWidth: job.stdWidth,
        actualFoamWidth,
        firstSheetWidth,
        productedQty,
        rollUsed,
        targetYieldStd: 95.0
    });
    const handleSubmit = (e) => {
        e.preventDefault();
        const rollStr = embossRoll ? String(embossRoll).trim() : '';
        const totalRollStr = embossTotalRoll ? String(embossTotalRoll).trim() : '';
        const updatedJob = {
            ...job,
            actualFoamWidth,
            firstSheetWidth,
            firstSheetThick,
            productedQty,
            embossLot: CalculationService.formatToYYYYMMDD(embossLot.trim()),
            embossRoll: rollStr,
            embossTotalRoll: totalRollStr,
            slitRoll: rollStr,
            slitTotalRoll: totalRollStr,
            rollSlit: rollStr,
            totalRollSlit: totalRollStr,
            slit_roll: rollStr,
            slit_total_roll: totalRollStr,
            rollUsed,
            ng: ngQty,
            ngReason: ngReason.trim() || undefined,
            remainWidth: previewCalc.remainWidth,
            lossOverStd: previewCalc.lossOverStd,
            lossProduct: previewCalc.lossProduct,
            actualUsedQty: previewCalc.actualUsedQty,
            yield: previewCalc.yield,
            isYieldWarning: previewCalc.isYieldWarning,
            status: previewCalc.isYieldWarning ? 'Warning' : 'Completed'
        };
        onSave(updatedJob);
        onClose();
    };
    return (
    <div className="modal-backdrop animate-fadeIn">
      <style>{`
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(15, 23, 42, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 50;
        }
        .edit-modal-card {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          width: 100%;
          max-width: 640px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #f1f5f9;
          background: #f8fafc;
        }
        .modal-icon-badge {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: #dbeafe;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-icon-close {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          cursor: pointer;
          color: #64748b;
          transition: all 0.15s ease;
        }
        .btn-icon-close:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .modal-body-form {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .grid-2-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .grid-3-cols {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .input-label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
        }
        .text-input {
          width: 100%;
          height: 38px;
          padding: 6px 12px;
          font-size: 13px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          outline: none;
          background-color: #ffffff;
          box-sizing: border-box;
          transition: all 0.15s ease;
        }
        .text-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
        }
        .edit-preview-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 16px;
        }
        .yield-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 9999px;
          font-size: 12px;
        }
        .yield-chip-success {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }
        .yield-chip-warning {
          background: #fee2e2;
          color: #b91c1c;
          border: 1px solid #fca5a5;
        }
        .modal-footer-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 18px;
          background: #1d4ed8;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: background-color 0.15s ease;
        }
        .btn-primary:hover {
          background: #1e40af;
        }
        .btn-secondary {
          padding: 8px 16px;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .btn-secondary:hover {
          background: #e2e8f0;
        }
      `}</style>
      <div className="edit-modal-card">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="modal-icon-badge">
              <Edit2 size={18} className="text-blue-600"/>
            </div>
            <div>
              <h3 className="modal-title font-bold text-lg">
                แก้ไขข้อมูล Job #{job.sequenceNo} ({job.jobNo})
              </h3>
              <p className="text-xs text-slate-500">
                สเปค STD: หนา {job.stdThick} × กว้าง {job.stdWidth} × ยาว {job.stdLength}M
              </p>
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose}>
            <X size={20}/>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body-form">
          <div className="grid-2-cols">
            <div className="form-group">
              <label className="input-label">ความกว้างโฟมจริง (Actual Foam mm.)</label>
              <input type="number" step="0.1" className="text-input" value={actualFoamWidth} onChange={(e) => setActualFoamWidth(parseFloat(e.target.value) || 0)} required/>
            </div>
            <div className="form-group">
              <label className="input-label">Lot โฟม Slit / Emboss & ม้วน (Roll)</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="text-input"
                  style={{ flex: 1 }}
                  value={embossLot}
                  onChange={(e) => handleLotChange(e.target.value)}
                  onBlur={(e) => handleLotChange(e.target.value)}
                  placeholder="YYYY-MM-DD"
                  required
                />
                <input
                  type="text"
                  style={{ width: '48px', height: '38px', textAlign: 'center', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1d4ed8' }}
                  value={embossRoll}
                  onChange={(e) => setEmbossRoll(e.target.value)}
                  placeholder="ม้วน"
                  title="เลขม้วน"
                />
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>/</span>
                <input
                  type="text"
                  style={{ width: '48px', height: '38px', textAlign: 'center', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1d4ed8' }}
                  value={embossTotalRoll}
                  onChange={(e) => setEmbossTotalRoll(e.target.value)}
                  placeholder="ทั้งหมด"
                  title="จำนวนม้วนทั้งหมด"
                />
              </div>
            </div>
          </div>

          <div className="grid-3-cols">
            <div className="form-group">
              <label className="input-label">First Sheet กว้าง (mm.)</label>
              <input type="number" step="0.01" className="text-input font-bold text-blue-700" value={firstSheetWidth} onChange={(e) => setFirstSheetWidth(parseFloat(e.target.value) || 0)} required/>
            </div>
            <div className="form-group">
              <label className="input-label">First Sheet หนา (mm.)</label>
              <input type="number" step="0.01" className="text-input" value={firstSheetThick} onChange={(e) => setFirstSheetThick(parseFloat(e.target.value) || 0)} required/>
            </div>
            <div className="form-group">
              <label className="input-label">จำนวนผลิตได้ (Good PCS)</label>
              <input type="number" className="text-input font-bold text-green-700" value={productedQty} onChange={(e) => setProductedQty(parseInt(e.target.value, 10) || 0)} required/>
            </div>
          </div>

          <div className="grid-3-cols">
            <div className="form-group">
              <label className="input-label">จำนวนม้วนโฟม (Roll Used)</label>
              <input type="number" min="1" className="text-input" value={rollUsed} onChange={(e) => setRollUsed(parseInt(e.target.value, 10) || 1)}/>
            </div>
            <div className="form-group">
              <label className="input-label">จำนวนของเสีย (NG PCS)</label>
              <input type="number" className="text-input text-red-600" value={ngQty} onChange={(e) => setNgQty(parseFloat(e.target.value) || 0)}/>
            </div>
            <div className="form-group">
              <label className="input-label">สาเหตุของเสีย</label>
              <input type="text" className="text-input" value={ngReason} onChange={(e) => setNgReason(e.target.value)} placeholder="ระบุสาเหตุถ้ามี"/>
            </div>
          </div>

          {/* Recalculation Preview Banner */}
          <div className="edit-preview-banner">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs text-slate-500 font-semibold uppercase">ผลลัพธ์การคำนวณใหม่:</span>
                <div className="flex gap-4 mt-1 text-sm">
                  <span>ใช้จริง: <b>{previewCalc.actualUsedQty} mm.</b></span>
                  <span>เหลือกว้าง: <b>{previewCalc.remainWidth} mm.</b></span>
                  <span>Loss Over STD: <b>{previewCalc.lossOverStd} mm.</b></span>
                </div>
              </div>
              <div className={`yield-chip ${previewCalc.isYieldWarning ? 'yield-chip-warning' : 'yield-chip-success'}`}>
                <span>% Yield: <b>{previewCalc.yield}%</b></span>
                {previewCalc.isYieldWarning && <AlertTriangle size={14}/>}
              </div>
            </div>
          </div>

          <div className="modal-footer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              ยกเลิก
            </button>
            <button type="submit" className="btn-primary">
              <Save size={16}/> บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </div>
    </div>);
};
