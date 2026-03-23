import crypto from 'node:crypto';

export const createId = (prefix = 'id') => `${prefix}_${crypto.randomUUID()}`;

export const sortByCreatedDateDesc = (items) => {
  return [...items].sort((a, b) => {
    const left = new Date(a.created_date || 0).getTime();
    const right = new Date(b.created_date || 0).getTime();
    return right - left;
  });
};

export const sanitizeWebsite = (website) => {
  if (!website) return '';
  return String(website).replace(/^https?:\/\//, '').trim();
};

export const normalizeCategory = (value) => {
  const aliases = {
    Qualifie: 'Strong Fit',
    'Qualifié': 'Strong Fit',
    Moyen: 'Medium Fit',
    'Non qualifie': 'Low Fit',
    'Non qualifié': 'Low Fit',
    Exclu: 'Excluded',
  };
  return aliases[value] || value;
};
