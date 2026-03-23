import { mockAnalyzeLead } from '@/components/utils/mockAnalysis';
import { dataClient } from '@/services/dataClient';

const allowLocalFallback = String(import.meta.env.VITE_ALLOW_LOCAL_ANALYSIS_FALLBACK || '').toLowerCase() === 'true';

// Backend-first analysis flow. Local fallback is opt-in only to avoid silent score drift.
export async function analyzeLead(payload) {
  const result = await dataClient.analyze(payload);
  if (result) return result;

  if (allowLocalFallback) {
    return mockAnalyzeLead(payload);
  }

  throw new Error('Analysis API unavailable. Set VITE_ALLOW_LOCAL_ANALYSIS_FALLBACK=true only for offline debugging.');
}
