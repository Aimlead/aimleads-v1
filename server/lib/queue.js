import crypto from 'node:crypto';
import { logger } from './observability.js';

const JOB_TTL_MS = 30 * 60 * 1000;
const JOB_RETENTION_LIMIT = 500;
const jobs = new Map();

const normalizeError = (error) => ({
  message: error?.message || 'Job failed',
  code: error?.code || null,
});

const pruneJobs = () => {
  const now = Date.now();

  for (const [jobId, job] of jobs.entries()) {
    if ((job.finished_at || job.created_at) + JOB_TTL_MS <= now) {
      jobs.delete(jobId);
    }
  }

  if (jobs.size <= JOB_RETENTION_LIMIT) return;

  const sorted = [...jobs.values()].sort((left, right) => left.created_at - right.created_at);
  const overflow = jobs.size - JOB_RETENTION_LIMIT;

  for (let index = 0; index < overflow; index += 1) {
    jobs.delete(sorted[index].id);
  }
};

setInterval(pruneJobs, 60 * 1000).unref?.();

const serializeJob = (job) => ({
  id: job.id,
  status: job.status,
  name: job.name,
  action: job.action,
  progress: job.progress,
  message: job.message,
  workspace_id: job.workspace_id,
  user_id: job.user_id,
  lead_id: job.lead_id,
  created_at: new Date(job.created_at).toISOString(),
  started_at: job.started_at ? new Date(job.started_at).toISOString() : null,
  finished_at: job.finished_at ? new Date(job.finished_at).toISOString() : null,
  result: job.status === 'completed' ? job.result : null,
  error: job.status === 'failed' ? job.error : null,
});

const updateJob = (jobId, updates = {}) => {
  const current = jobs.get(jobId);
  if (!current) return null;

  const next = {
    ...current,
    ...updates,
  };

  jobs.set(jobId, next);
  return next;
};

export const enqueueJob = ({
  name,
  action,
  workspaceId,
  userId,
  leadId = null,
  execute,
  initialMessage = 'Queued',
  runningMessage = 'Processing',
} = {}) => {
  if (typeof execute !== 'function') {
    throw new Error('enqueueJob requires an execute function');
  }

  const id = `job_${crypto.randomUUID()}`;
  const createdAt = Date.now();

  const job = {
    id,
    name: String(name || action || 'job'),
    action: String(action || name || 'job'),
    workspace_id: String(workspaceId || '').trim(),
    user_id: String(userId || '').trim(),
    lead_id: leadId ? String(leadId) : null,
    status: 'queued',
    progress: 5,
    message: initialMessage,
    created_at: createdAt,
    started_at: null,
    finished_at: null,
    result: null,
    error: null,
  };

  jobs.set(id, job);

  const setProgress = (progress, message = null) => {
    updateJob(id, {
      progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : job.progress,
      message: message || jobs.get(id)?.message || runningMessage,
    });
  };

  queueMicrotask(async () => {
    updateJob(id, {
      status: 'running',
      progress: 20,
      message: runningMessage,
      started_at: Date.now(),
    });

    try {
      const result = await execute({ setProgress, jobId: id });
      updateJob(id, {
        status: 'completed',
        progress: 100,
        message: 'Completed',
        finished_at: Date.now(),
        result,
      });
    } catch (error) {
      logger.errorFrom('async_job_failed', error, {
        job_id: id,
        action,
        workspace_id: workspaceId || null,
        user_id: userId || null,
        lead_id: leadId || null,
      });

      updateJob(id, {
        status: 'failed',
        progress: 100,
        message: error?.message || 'Failed',
        finished_at: Date.now(),
        error: normalizeError(error),
      });
    }
  });

  return serializeJob(job);
};

export const getJobStatus = ({ jobId, workspaceId, userId = null } = {}) => {
  const job = jobs.get(String(jobId || ''));
  if (!job) return null;
  if (workspaceId && String(job.workspace_id || '') !== String(workspaceId)) return null;
  if (userId && job.user_id && String(job.user_id) !== String(userId)) {
    return null;
  }
  return serializeJob(job);
};

export const __resetJobsForTests = () => {
  jobs.clear();
};
