import crypto from 'node:crypto';

export const createId = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;

export const sanitizeWebsite = (website) => {
  if (!website) return '';
  return String(website).replace(/^https?:\/\//, '').trim();
};
