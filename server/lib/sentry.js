import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

export const initSentry = () => {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.5 : 1.0,
    sendDefaultPii: false,
  });
};

export const captureException = (error, context = {}) => {
  if (!dsn) return;
  Sentry.captureException(error, { extra: context });
};

export const addBreadcrumb = ({
  category = 'app',
  message,
  level = 'info',
  data = {},
  type = 'default',
} = {}) => {
  if (!dsn || !message) return;

  Sentry.addBreadcrumb({
    category,
    message,
    level,
    type,
    data,
    timestamp: Date.now() / 1000,
  });
};

export { Sentry };
