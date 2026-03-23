import crypto from 'node:crypto';
import { captureException } from './sentry.js';

const nowIso = () => new Date().toISOString();

const toErrorMeta = (error) => {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

const emit = (level, message, meta = {}) => {
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

export const securityHeadersMiddleware = (_req, res, next) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-xss-protection', '0');
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

export const requestLoggingMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    logger.info('http_request', {
      request_id: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      latency_ms: Date.now() - start,
      ip: req.ip,
      user_id: req.user?.id || null,
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
