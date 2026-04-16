import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
let listenersAttached = false;

export const initSentry = () => {
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.5 : 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: false, blockAllMedia: false }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  if (!listenersAttached && typeof window !== 'undefined') {
    listenersAttached = true;

    window.addEventListener('unhandledrejection', (event) => {
      if (!event?.reason) return;
      Sentry.captureException(event.reason, {
        extra: {
          source: 'window.unhandledrejection',
        },
      });
    });

    window.addEventListener('error', (event) => {
      if (!event?.error) return;
      Sentry.captureException(event.error, {
        extra: {
          source: 'window.error',
        },
      });
    });
  }
};

export const captureException = (error, context = {}) => {
  if (!dsn) return;
  Sentry.captureException(error, { extra: context });
};

export const addBreadcrumb = ({
  category = 'ui',
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
