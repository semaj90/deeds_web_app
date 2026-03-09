import express from 'express';
import { getJobStatus, getJobsForCase } from '../lib/redis.js';

const router = express.Router();

router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const jobStatus = await getJobStatus(jobId);

    if (!jobStatus) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(jobStatus);
    return;

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      error: 'Status check failed',
      message: (error as Error).message
    });
    return;
  }
});

// Get all jobs for a case
router.get('/case/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;

    if (!caseId) {
      return res.status(400).json({ error: 'Case ID is required' });
    }

    // This would need to be implemented in redis.js
    const jobs = await getJobsForCase(caseId);

    res.json({ jobs });
    return;

  } catch (error) {
    console.error('Case jobs fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch case jobs',
      message: (error as Error).message
    });
    return;
  }
});

export { router as statusRouter };