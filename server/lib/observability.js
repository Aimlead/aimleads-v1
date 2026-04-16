import crypto from 'node:crypto';
import { captureException } from './sentry.js';
import { getRuntimeConfig } from './config.js';
import { recordHttpRequestMetric } from './metrics.js';

const nowIso = () => new Date().toISOString();
const LEVEL_PRIORITY = { info: 20, warn: 30, error: 40 };

const toErrorMeta = (error) => {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

const shouldEmit = (level) => {
  const configured = String(getRuntimeConfig().logLevel || 'info').toLowerCase();
  const configuredPriority = LEVEL_PRIORITY[configured] || LEVEL_PRIORITY.info;
  const levelPriority = LEVEL_PRIORITY[level] || LEVEL_PRIORITY.info;
  return levelPriority >= configuredPriority;
};

const emit = (level, message, meta = {}) => {
  if (!shouldEmit(level)) return;

  const payload = {
    ts: nowIso(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info: (message, meta) => emit('info', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  error: (message, meta) => emit('error', message, meta),
  errorFrom: (message, error, meta = {}) => emit('error', message, { ...meta, error: toErrorMeta(error) }),
};

export const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

export const securityHeadersMiddleware = (req, res, next) => {
  const config = getRuntimeConfig();
  const scriptSrc = config.isProduction
    ? ["'self'"]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];
  const connectSrc = config.isProduction
    ? ["'self'", 'https://*.supabase.co', 'https://*.sentry.io']
    : ["'self'", 'http://localhost:*', 'ws://localhost:*', 'https://*.supabase.co', 'https://*.sentry.io'];
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-xss-protection', '0');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('cross-origin-opener-policy', 'same-origin');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader('content-security-policy', csp);
  if (req.secure) {
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  next();
};

export const requestLoggingMiddleware = (req, res, next) => {
  const start = Date.now();
  const sanitizePathForMetrics = () => {
    const routePath = typeof req.route?.path === 'string' ? req.route.path : '';
    const basePath = typeof req.baseUrl === 'string' ? req.baseUrl : '';
    const rawPath = routePath
      ? `${basePath}${routePath}`
      : String(req.originalUrl || req.url || '/').split('?')[0];

    return rawPath
      .replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\b/gi, ':id')
      .replace(/\b(?:lead|user|invite|icp|ai_run|demo_request|workspace)_[a-z0-9-]+\b/gi, ':id')
      .replace(/\/\d+\b/g, '/:id');
  };

  res.on('finish', () => {
    const latencyMs = Date.now() - start;
    logger.info('http_request', {
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: latencyMs,
      ip: req.ip,
      user_id: req.user?.id || null,
    });
    recordHttpRequestMetric({
      method: req.method,
      path: sanitizePathForMetrics(),
      status: res.statusCode,
      latencyMs,
    });
  });

  next();
};

export const errorHandlerMiddleware = (error, req, res, _next) => {
  logger.errorFrom('http_error', error, {
    request_id: req.requestId,
    method: req.method,
    path: req.originalUrl,
    user_id: req.user?.id || null,
  });

  const status = Number(error?.status) || 500;

  if (status >= 500) {
    captureException(error, {
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      user_id: req.user?.id || null,
    });
  }
  const safeMessage = status >= 500 ? 'Internal server error' : error.message || 'Request failed';

  res.status(status).json({
    message: safeMessage,
    request_id: req.requestId,
  });
};
