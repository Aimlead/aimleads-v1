import express from 'express';
import { renderPrometheusMetrics } from '../lib/metrics.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.send(renderPrometheusMetrics());
});

export default router;
