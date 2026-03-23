import dotenv from 'dotenv';
dotenv.config({ override: true });
import { initSentry } from './lib/sentry.js';
initSentry();
import app from './app.js';
import { logger } from './lib/observability.js';

const port = Number(process.env.API_PORT || process.env.PORT || 3001);

const server = app.listen(port, () => {
  logger.info('api_listening', {
    port,
    url: `http://localhost:${port}`,
  });
});

server.on('error', (error) => {
  logger.errorFrom('api_start_error', error, { port });
  process.exitCode = 1;
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
const SHUTDOWN_TIMEOUT_MS = 10_000;

const shutdown = (signal) => {
  logger.info('api_shutting_down', { signal });

  server.close((err) => {
    if (err) {
      logger.errorFrom('api_shutdown_error', err);
      process.exitCode = 1;
    } else {
      logger.info('api_shutdown_complete');
    }
    process.exit(process.exitCode ?? 0);
  });

  // Force-kill if drain takes too long
  setTimeout(() => {
    logger.warn('api_shutdown_forced', { timeoutMs: SHUTDOWN_TIMEOUT_MS });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.errorFrom('uncaught_exception', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.errorFrom('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason)));
});
