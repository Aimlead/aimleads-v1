const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 45_000;

const sleep = (durationMs) => new Promise((resolve) => {
  window.setTimeout(resolve, durationMs);
});

export async function waitForJobCompletion(jobId, getStatus, {
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await getStatus(jobId);

    if (status?.status === 'completed' || status?.status === 'failed') {
      return status;
    }

    await sleep(pollIntervalMs);
  }

  const timeoutError = new Error('Timed out while waiting for background job completion.');
  timeoutError.code = 'JOB_TIMEOUT';
  throw timeoutError;
}
