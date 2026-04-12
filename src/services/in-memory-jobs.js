const crypto = require('crypto');

const jobs = new Map();
const MAX_JOBS = 200;
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneJobs() {
  const now = Date.now();
  if (jobs.size <= MAX_JOBS) {
    return;
  }
  for (const [id, row] of jobs.entries()) {
    if (now - row.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function createJob() {
  pruneJobs();
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    state: 'queued',
    createdAt: Date.now(),
    result: null,
    error: null,
  });
  return id;
}

function updateJob(id, patch) {
  const row = jobs.get(id);
  if (!row) {
    return null;
  }
  Object.assign(row, patch);
  return row;
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = { createJob, updateJob, getJob };
