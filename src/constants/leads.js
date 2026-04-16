export const LEAD_STATUS = {
  TO_ANALYZE: 'To Analyze',
  PROCESSING: 'Processing',
  QUALIFIED: 'Qualified',
  REJECTED: 'Rejected',
  ERROR: 'Error',
};

export const FOLLOW_UP_STATUS = {
  TO_CONTACT: 'To Contact',
  CONTACTED: 'Contacted',
  REPLY_PENDING: 'Reply Pending',
  CLOSED_WON: 'Closed Won',
  CLOSED_LOST: 'Closed Lost',
};

export const ICP_CATEGORY = {
  EXCELLENT: 'Excellent',
  STRONG: 'Strong Fit',
  MEDIUM: 'Medium Fit',
  LOW: 'Low Fit',
  EXCLUDED: 'Excluded',
};

export const LEAD_STATUS_LIST = Object.values(LEAD_STATUS);
export const FOLLOW_UP_STATUS_LIST = Object.values(FOLLOW_UP_STATUS);
export const ICP_CATEGORY_LIST = Object.values(ICP_CATEGORY);
