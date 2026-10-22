import React from 'react';
import { Eye, X, Calendar, User, History, ShieldCheck } from 'lucide-react';
import { CalculationService } from '../../../services/calculationService';
import { ActivityLogService, ACTION_LABELS } from '../../../services/activityLogService';

export const JobDetailViewModal = ({ job, header, onClose }) => {
  const [activityLogs, setActivityLogs] = React.useState([]);
  const [loadingLogs, setLoadingLogs] = React.useState(false);

  React.useEffect(() => {
    if (!job?.jobNo) return;
    let isMounted = true;
    setLoadingLogs(true);
    ActivityLogService.getLogsByJob(job.jobNo)
      .then((logs) => {
        if (isMounted) setActivityLogs(logs || []);
      })
      .catch(() => {
        if (isMounted) setActivityLogs([]);
      })
      .finally(() => {
        if (isMounted) setLoadingLogs(false);
      });
    return () => { isMounted = false; };
  }, [job?.jobNo]);

  if (!job) return null;

  // Format first sheet width & qty values (รองรับทั้งแบบช่องเดียว และหลายช่อง เช่น 168, 125)
  const firstShotWidthText = job.firstSheetEntries && job.firstSheetEntries.length > 0
    ? job.firstSheetEntries.map((e) => e.width).join(', ')
    : job.firstSheetWidth;

  const productedQtyText = job.firstSheetEntries && job.firstSheetEntries.length > 0
    ? job.firstSheetEntries.map((e) => e.qty).join(', ')
    : job.productedQty;

  const foamNameText = job.materialType || job.MaterialType || job.foamName || (job.description && !job.description.startsWith(job.partNo) ? job.description.trim().split(/\s+/)[0] : '') || (job.partNo?.includes('TC-3HR') ? 'TC-3HR' : '-');
  const colorText = job.colorName || job.ColorName || job.color || (() => {
    if (!job.description) return '-';
    const words = job.description.trim().split(/\s+/);
    const last = words[words.length - 1];
    return (last && !last.includes('X') && !last.includes('x') && last !== job.partNo) ? last : '-';
  })();
  const remainThickText = job.remainThick !== undefined ? job.remainThick : job.stdThick;
  const remainLengthText = job.remainLength !== undefined ? job.remainLength : job.stdLength;

  // แปลงรูปแบบวันที่จาก yyyy-mm-dd เป็น dd-mm-yyyy
  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '-';
    const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
    const parts = cleanStr.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
  };

  const displayDate = formatDateDDMMYYYY(job.date || header?.date || (job.createdAt ? job.createdAt.split('T')[0] : ''));

  // แปลงเวลาให้แสดงเฉพาะเวลา เช่น 14:58:59 (ถ้าเป็น 00:00:00 แสดงว่าไม่ได้ระบุเวลาจริง ให้คืนค่าว่าง)
  const formatTimeOnly = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}:${seconds}`;
      if (timeStr === '00:00:00') return '';
      return timeStr;
    } catch {
      return '';
    }
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
        .job-detail-modal-card {
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
          width: 95vw;
          max-width: 1400px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
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
        .job-detail-slit-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          text-align: center;
        }
        .job-detail-slit-table th,
        .job-detail-slit-table td {
          border: 1px solid #cbd5e1;
          padding: 6px 8px;
          vertical-align: middle;
        }
        .job-detail-slit-table thead th {
          background: #f1f5f9;
          color: #1e293b;
          font-weight: 700;
        }
        .job-detail-slit-table .th-sub {
          display: block;
          font-size: 9px;
          font-weight: 600;
          color: #64748b;
        }
        .td-bold {
          font-weight: 700;
        }
        .td-yield-good {
          font-weight: 800;
          color: #15803d;
          background: #dcfce7;
        }
        .td-yield-bad {
          font-weight: 800;
          color: #b91c1c;
          background: #fee2e2;
        }
        .btn-primary {
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
      `}</style>
      <div className="job-detail-modal-card">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="flex items-center gap-2.5">
            <div className="modal-icon-badge">
              <Eye size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="modal-title font-bold text-lg text-slate-900">
                รายละเอียดบันทึกการผลิต ({job.jobNo})
              </h3>
            </div>
          </div>
          <button type="button" className="btn-icon-close" onClick={onClose} title="ปิด">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body: Table Presentation */}
        <div className="modal-body-content" style={{ padding: '1.25rem' }}>
          {/* Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                <User size={13} className="text-blue-600" />
                ผู้บันทึก: <strong>{job.operatorName || header?.operatorName || '-'}</strong>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Calendar size={13} className="text-blue-600" />
                วันที่: <strong>{displayDate}</strong>
              </span>
              {job.embossLot && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-purple-700">
                    LOT NO. Emboss: <strong>{job.embossLot}</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Master Specification & Production Result Slit Table */}
          <div className="table-responsive-container" style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
            <table className="job-detail-slit-table">
              <thead>
                <tr>
                  <th rowSpan="2">ลำดับ<span className="th-sub">ITEM</span></th>
                  <th rowSpan="2">เลขที่ Job<span className="th-sub">JOB NO.</span></th>
                  <th rowSpan="2">หมายเลขชิ้นส่วน<span className="th-sub">PART NO.</span></th>
                  <th rowSpan="2">หมายเลขวัตถุดิบ<span className="th-sub">MATERIAL NO.</span></th>
                  <th rowSpan="2">ชื่อโฟม<span className="th-sub">FOAM NAME</span></th>
                  <th rowSpan="2">ความกว้างโฟมจริง<span className="th-sub">(mm.)</span></th>
                  <th colSpan="3">ขนาดโฟม</th>
                  <th rowSpan="2">สีของโฟม<span className="th-sub">COLOR</span></th>
                  <th rowSpan="2">LOT NO.</th>
                  <th rowSpan="2">ม้วน LOT<span className="th-sub">(ROLL)</span></th>
                  <th colSpan="2">First Shot</th>
                  <th rowSpan="2">จำนวนที่ผลิตได้<span className="th-sub">(PCS.)</span></th>
                  <th rowSpan="2">จำนวนโฟมที่ใช้<span className="th-sub">(ROLL)</span></th>
                  <th colSpan="3">ชิ้นงานเหลือ</th>
                  <th rowSpan="2">NG<span className="th-sub">(m.)</span></th>
                  <th rowSpan="2">Loss ด้านข้างที่เกิน STD.<span className="th-sub">(mm.)</span></th>
                  <th rowSpan="2">Loss ด้านข้างของฝ่ายผลิต<span className="th-sub">(mm.)</span></th>
                  <th rowSpan="2">จำนวนที่ใช้จริง<span className="th-sub">(mm.)</span></th>
                  <th rowSpan="2">% Yield</th>
                </tr>
                <tr>
                  {/* ขนาดโฟม */}
                  <th>หนา<span className="th-sub">(mm.)</span></th>
                  <th>กว้าง<span className="th-sub">(mm.)</span></th>
                  <th>ยาว<span className="th-sub">(m.)</span></th>
                  {/* First Shot */}
                  <th>หนา<span className="th-sub">(mm.)</span></th>
                  <th>กว้าง<span className="th-sub">(mm.)</span></th>
                  {/* ชิ้นงานเหลือ */}
                  <th>หนา<span className="th-sub">(mm.)</span></th>
                  <th>กว้าง<span className="th-sub">(mm.)</span></th>
                  <th>ยาว<span className="th-sub">(m.)</span></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-bold">{job.sequenceNo || 1}</td>
                  <td className="td-bold text-blue-900">
                    {job.firstSheetEntries && job.firstSheetEntries.length > 1 && job.firstSheetEntries.some(e => e.jobNo && e.jobNo !== job.jobNo)
                      ? job.firstSheetEntries.map(e => e.jobNo || job.jobNo).filter((v, i, a) => a.indexOf(v) === i).join(', ')
                      : job.jobNo}
                  </td>
                  <td className="td-bold tracking-wide">
                    {(() => {
                      if (job.firstSheetEntries && job.firstSheetEntries.length > 1 && job.firstSheetEntries.some(e => e.partNo && e.partNo !== job.partNo)) {
                        return job.firstSheetEntries.map(e => e.partNo || job.partNo).filter((v, i, a) => a.indexOf(v) === i).join(', ');
                      }
                      const isT = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('T');
                      const isP = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('P');
                      if (isT(job.partNo)) return job.partNo.trim();
                      if (isT(job.itemMst)) return job.itemMst.trim();
                      if (isT(job.finishedItem)) return job.finishedItem.trim();
                      if (job.itemMst && !isP(job.itemMst) && job.itemMst !== '-') return job.itemMst.trim();
                      if (job.finishedItem && !isP(job.finishedItem) && job.finishedItem !== '-') return job.finishedItem.trim();
                      if (job.partNo && !isP(job.partNo) && job.partNo !== '-') return job.partNo.trim();
                      return '-';
                    })()}
                  </td>
                  <td className="td-bold tracking-wide">
                    {(() => {
                      const isP = (s) => typeof s === 'string' && s.trim().toUpperCase().startsWith('P');
                      if (isP(job.materialNo)) return job.materialNo.trim();
                      if (isP(job.materialItem)) return job.materialItem.trim();
                      if (isP(job.partNo)) return job.partNo.trim();
                      if (isP(job.itemMst)) return job.itemMst.trim();
                      return job.materialNo || job.MaterialNo || job.materialItem || '-';
                    })()}
                  </td>
                  <td className="td-bold">{foamNameText}</td>
                  <td className="td-bold">{job.actualFoamWidth}</td>
                  {/* ขนาดโฟม */}
                  <td>{job.stdThick}</td>
                  <td>{job.stdWidth}</td>
                  <td>{job.stdLength}</td>
                  {/* สีโฟม & LOT */}
                  <td>{colorText}</td>
                  <td className="font-semibold text-slate-700">
                    {(() => {
                      const rawLot = job.embossLot || job.lotNo;
                      const details = CalculationService.extractEmbossDetails(rawLot);
                      return details?.lotDate || CalculationService.formatLotNoToAD(rawLot, job.date || header?.date) || '-';
                    })()}
                  </td>
                  <td className="font-bold text-blue-700 text-center">
                    {(() => {
                      const rollVal = job.slitRoll ?? job.slit_roll ?? job.rollSlit ?? job.roll_slit ?? job.embossRoll ?? job.EmbossRoll;
                      const roll = (rollVal !== undefined && rollVal !== null && String(rollVal).trim() !== '')
                        ? String(rollVal).trim()
                        : '';
                      const totalVal = job.slitTotalRoll ?? job.slit_total_roll ?? job.totalRollSlit ?? job.total_roll_slit ?? job.embossTotalRoll ?? job.EmbossTotalRoll;
                      const total = (totalVal !== undefined && totalVal !== null && String(totalVal).trim() !== '')
                        ? String(totalVal).trim()
                        : '';
                      if (roll && total) {
                        return (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontWeight: 800,
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe'
                          }}>
                            {roll}/{total}
                          </span>
                        );
                      }
                      if (roll) {
                        return (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontWeight: 800,
                            borderRadius: '6px',
                            border: '1px solid #bfdbfe'
                          }}>
                            {roll}
                          </span>
                        );
                      }
                      const rawLot = job.embossLot || job.lotNo || job.slitLot || job.slit_lot || '';
                      if (rawLot) {
                        const details = CalculationService.extractEmbossDetails(rawLot);
                        if (details?.rollNo && details?.totalRolls) {
                          return (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 800,
                              borderRadius: '6px',
                              border: '1px solid #bfdbfe'
                            }}>
                              {details.rollNo}/{details.totalRolls}
                            </span>
                          );
                        }
                        if (details?.rollNo) {
                          return (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 800,
                              borderRadius: '6px',
                              border: '1px solid #bfdbfe'
                            }}>
                              {details.rollNo}
                            </span>
                          );
                        }
                      }
                      return '-';
                    })()}
                  </td>
                  {/* First Shot */}
                  <td>{job.firstSheetThick || job.stdThick}</td>
                  <td className="td-bold">{firstShotWidthText}</td>
                  {/* ผลิตได้ & ม้วน */}
                  <td className="td-bold">{productedQtyText}</td>
                  <td>{job.rollUsed || 1}</td>
                  {/* ชิ้นงานเหลือ */}
                  <td>{remainThickText}</td>
                  <td className="td-bold">{job.remainWidth}</td>
                  <td>{remainLengthText}</td>
                  {/* NG & Loss & Actual & Yield */}
                  <td className={job.ng > 0 ? 'text-red-600 font-bold' : ''}>{job.ng || 0}</td>
                  <td>{job.lossOverStd}</td>
                  <td>{job.lossProduct}</td>
                  <td className="td-bold">{job.actualUsedQty}</td>
                  <td className={job.isYieldWarning ? 'td-yield-bad' : 'td-yield-good'}>
                    {job.yield}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* สรุปรายละเอียดขนาดตัดย่อย (Multi-Cut Details) */}
          {job.firstSheetEntries && job.firstSheetEntries.length > 1 && (
            <div className="mt-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs">
              <span className="font-extrabold text-blue-900 block mb-2">
                ✂️ รายการตัดชิ้นงานในม้วนนี้ ({job.firstSheetEntries.length} ขนาดตัด):
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {job.firstSheetEntries.map((e, idx) => {
                  const w = parseFloat(e.width) || 0;
                  const q = parseInt(e.qty, 10) || 0;
                  const totalMm = w * q;
                  return (
                    <div key={idx} className="bg-white p-2.5 rounded-lg border border-blue-200 shadow-2xs flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">
                          ชิ้นที่ {idx + 1}
                        </span>
                        <span className="font-bold text-slate-800 text-[11px]">
                          {e.jobNo ? `Job: ${e.jobNo}` : '-'}
                        </span>
                      </div>
                      <div className="text-[11px] text-teal-700 font-semibold truncate">
                        Part: {e.partNo || '-'}
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-slate-600 font-medium">{w} mm. × {q} PCS</span>
                        <span className="font-extrabold text-green-700">{totalMm.toLocaleString()} mm.</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* เวลาบันทึก */}
          {formatTimeOnly(job.createdAt) && (
            <div className="mt-2 text-right text-xs text-slate-400">
              เวลาบันทึก: {formatTimeOnly(job.createdAt)}
            </div>
          )}

          {/* ประวัติกิจกรรม & การแก้ไข (Audit Trail) */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <History size={14} className="text-indigo-600" />
                <span>ประวัติกิจกรรม & การแก้ไข (Audit Trail)</span>
              </h5>
              <span className="text-[11px] text-slate-400 font-medium">
                {activityLogs.length} รายการ
              </span>
            </div>

            {loadingLogs ? (
              <div className="py-2 text-center text-xs text-slate-400">กำลังโหลดประวัติ...</div>
            ) : activityLogs.length === 0 ? (
              <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg text-slate-400 text-xs flex items-center gap-2">
                <ShieldCheck size={14} className="text-slate-400" />
                <span>ยังไม่มีประวัติการแก้ไขเพิ่มเติมสำหรับ Job นี้ (บันทึกเริ่มแรกโดย {job.operatorName || 'พนักงาน'})</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                {activityLogs.map((log) => {
                  const isOfficer = log.role && (log.role.toLowerCase().includes('officer') || log.role.toLowerCase().includes('admin'));
                  const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString('th-TH', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : '-';

                  return (
                    <div key={log.id} className="p-2 text-xs hover:bg-slate-50 flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                        log.actionType === 'EDIT_CLOSED_JOB' ? 'bg-purple-600' :
                        log.actionType === 'EDIT_JOB' ? 'bg-blue-600' :
                        log.actionType === 'DELETE_JOB' ? 'bg-rose-600' : 'bg-emerald-600'
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800">
                            {ACTION_LABELS[log.actionType] || log.actionType}
                          </span>
                          {isOfficer && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">
                              Foreman
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-[11px] text-slate-600 mt-0.5">{log.details}</p>
                        )}
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 mt-0.5">
                          <span className="font-medium text-slate-600">
                            {log.employeeName || 'ไม่ระบุชื่อ'} {log.employeeId ? `(${log.employeeId})` : ''}
                          </span>
                          <span>•</span>
                          <span>{dateStr}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="modal-footer-actions" style={{ justifyContent: 'flex-end', padding: '1rem 1.25rem' }}>
          <button type="button" className="btn-primary" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
