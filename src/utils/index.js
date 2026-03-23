import { PAGE_ROUTE_MAP, ROUTES } from '@/constants/routes';

const normalizePageKey = (value) => String(value || '').replace(/[\s_-]/g, '').toLowerCase();

const routeByNormalizedPageName = Object.entries(PAGE_ROUTE_MAP).reduce((acc, [key, path]) => {
  acc[normalizePageKey(key)] = path;
  return acc;
}, {});

export function resolveRoute(pageName) {
  if (!pageName) return ROUTES.home;
  if (typeof pageName !== 'string') return ROUTES.home;
  if (pageName.startsWith('/')) return pageName;

  const normalized = normalizePageKey(pageName);
  return routeByNormalizedPageName[normalized] || `/${pageName.toLowerCase()}`;
}

export function createPageUrl(pageName, params = {}) {
  let path = resolveRoute(pageName);

  for (const [paramName, value] of Object.entries(params)) {
    path = path.replace(`:${paramName}`, encodeURIComponent(value));
  }

  return path;
}

export function createLeadDetailUrl(leadId) {
  return createPageUrl('LeadDetail', { leadId });
}
