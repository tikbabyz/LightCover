import React from 'react';
import { StickerPrintModal } from '../../../components/StickerLabel';

/**
 * SlitStickerModal
 * คอมโพเนนต์โมดอลสั่งพิมพ์ฉลากม้วนสำหรับกระบวนการ SLIT
 * ฟอร์แมต QR: JOB|PART NO.|LOT NO.|ROLL|SLIT|
 */
export const SlitStickerModal = ({
  isOpen,
  onClose,
  jobData = null,
  initialQuery = '',
  initialRollNo = null,
  allJobs = []
}) => {
  return (
    <StickerPrintModal
      isOpen={isOpen}
      onClose={onClose}
      jobData={jobData}
      initialQuery={initialQuery}
      initialRollNo={initialRollNo}
      allJobs={allJobs}
      processName="SLIT"
    />
  );
};

export default SlitStickerModal;
