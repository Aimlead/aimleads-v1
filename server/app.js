import { fileURLToPath } from 'url';
import path from 'path';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';
import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import icpRoutes from './routes/icp.js';
import analyzeRoutes from './routes/analyze.js';
import auditRoutes from './routes/audit.js';
import workspaceRoutes from './routes/workspace.js';
import analyticsInsightsRoutes from './routes/analyticsInsights.js';
import devRoutes from './routes/dev.js';
import publicRoutes from './routes/public.js';
import { getCorsOptions } from './lib/http.js';
import { csrfProtection, ensureCsrfCookie } from './lib/middleware.js';
import { bootstrapDb, bootstrapSupabaseDemoUser, bootstrapWorkspaceDemoData } from './services/bootstrap.js';
import { dataStore, getDataStoreRuntime } from './lib/dataStore.js';
import { createRateLimit } from './lib/rateLimit.js';
import {
  errorHandlerMiddleware,
  logger,
  requestIdMiddleware,
  requestLoggingMiddleware,
  securityHeadersMiddleware,
} from './lib/observability.js';
import { getAuthProvider, getDataProvider, getRuntimeConfig, validateRuntimeConfig } from './lib/config.js';

const app = express();
app.disable('x-powered-by');

let config;
try {
  config = validateRuntimeConfig();
} catch (startupError) {
  console.error('[startup] FATAL config error:', startupError.message);
  throw startupError;
}

if (!config.isProduction && getDataProvider() === 'local') {
  await bootstrapDb();

  const demoUser = await dataStore.findUserByEmail('demo@aimleads.local');
  if (demoUser) {
    await bootstrapWorkspaceDemoData(dataStore, demoUser);
  }
}

if (getDataProvider() === 'supabase' && config.demoBootstrapEnabled) {
  try {
    await bootstrapSupabaseDemoUser(dataStore);
  } catch (error) {
    logger.errorFrom('supabase_bootstrap_failed', error, {
      provider: getDataProvider(),
    });

    logger.warn('supabase_bootstrap_skipped', {
      reason: String(error?.message || 'bootstrap_failed'),
    });
  }
} else if (getDataProvider() === 'supabase') {
  logger.info('supabase_bootstrap_disabled', {
    provider: getDataProvider(),
    node_env: config.nodeEnv,
  });
}

app.set('trust proxy', config.trustProxy);

app.use(compression());
app.use(requestIdMiddleware);
app.use(securityHeadersMiddleware);
app.use(cors(getCorsOptions()));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use('/api', ensureCsrfCookie);
app.use(requestLoggingMiddleware);

const apiRateLimit = createRateLimit({
  namespace: 'api',
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  keyGenerator: (req) => req.ip,
  message: 'Too many requests, please try again later.',
});

app.use('/api', apiRateLimit);
app.use('/api', csrfProtection);

if (config.apiDocsEnabled) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
}

app.get('/api/health', async (_req, res) => {
  const runtime = getDataStoreRuntime();
  let dbStatus = 'ok';
  try {
    // Lightweight DB ping: find a non-existent user — succeeds if DB is reachable
    await dataStore.findUserByEmail('__health_check__@aimleads.internal');
  } catch {
    dbStatus = 'error';
  }
  return res.json({
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    service: 'aimleads-api',
    database: dbStatus,
    provider: runtime.configuredProvider,
    auth_provider: getAuthProvider(),
    active_provider: runtime.activeProvider,
    fallback_reason: runtime.fallbackReason,
    node_env: getRuntimeConfig().nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// Versioned routes (v1) — canonical
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/icp', icpRoutes);
app.use('/api/v1/analyze', analyzeRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/workspace', workspaceRoutes);
app.use('/api/v1/analytics', analyticsInsightsRoutes);
app.use('/api/v1/public', publicRoutes);

// Legacy unversioned routes — kept for backwards compatibility
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/icp', icpRoutes);
app.use('/api/analyze', analyzeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/analytics', analyticsInsightsRoutes);
app.use('/api/public', publicRoutes);

// Dev tools: only mounted when not in production (double guard — route itself also checks)
if (!config.isProduction) {
  app.use('/api/v1/dev', devRoutes);
  app.use('/api/dev', devRoutes);
}

app.use('/api', (_req, res) => {
  return res.status(404).json({ message: 'API route not found' });
});

// Serve frontend static files in production
if (config.isProduction) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath, { maxAge: '30d' }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.use(errorHandlerMiddleware);

const runtime = getDataStoreRuntime();
logger.info('app_ready', {
  provider: runtime.configuredProvider,
  auth_provider: getAuthProvider(),
  active_provider: runtime.activeProvider,
  node_env: getRuntimeConfig().nodeEnv,
});

export default app;
