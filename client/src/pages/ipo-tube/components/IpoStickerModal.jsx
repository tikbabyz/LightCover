import React from 'react';
import { StickerPrintModal } from '../../../components/StickerLabel';

/**
 * IpoStickerModal
 * คอมโพเนนต์โมดอลสั่งพิมพ์ฉลากม้วนสำหรับกระบวนการ IPO TUBE
 * ฟอร์แมต QR: JOB|PART NO.|LOT NO.|ROLL|IPO TUBE|
 */
export const IpoStickerModal = ({
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
      processName="IPO TUBE"
    />
  );
};

export default IpoStickerModal;
