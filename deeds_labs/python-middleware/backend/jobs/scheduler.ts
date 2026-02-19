/**
 * Background Job Scheduler
 *
 * Schedules and manages background jobs including data archival.
 * Uses node-cron for scheduling jobs at specific times.
 *
 * @module jobs/scheduler
 */

import cron from 'node-cron';
import { archiveOldData } from './archiveOldData.js';

/**
 * Job Schedule Configuration
 */
const JOB_SCHEDULES = {
	// Data archival: Daily at 2 AM UTC
	dataArchival: '0 2 * * *', // Cron: minute hour day month weekday
};

/**
 * Scheduled Jobs Registry
 */
const scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

/**
 * Schedule Data Archival Job
 *
 * Runs daily at 2 AM UTC to archive old error clusters and interaction logs.
 * Logs execution results and errors.
 */
function scheduleDataArchival(): void {
	const jobName = 'data-archival';

	// Stop existing job if running
	if (scheduledJobs.has(jobName)) {
		console.log(`[Scheduler] Stopping existing ${jobName} job`);
		scheduledJobs.get(jobName)?.stop();
		scheduledJobs.delete(jobName);
	}

	// Schedule new job
	const task = cron.schedule(
		JOB_SCHEDULES.dataArchival,
		async () => {
			console.log(`[Scheduler] Starting ${jobName} job`);
			const startTime = Date.now();

			try {
				const stats = await archiveOldData();
				const duration = Date.now() - startTime;

				console.log(`[Scheduler] ${jobName} completed successfully in ${duration}ms`);
				console.log(`[Scheduler] Stats:`, {
					errorClustersArchived: stats.errorClustersArchived,
					interactionLogsArchived: stats.interactionLogsArchived,
					errors: stats.errors.length,
				});

				// Log to database or monitoring system if needed
				// await logJobExecution(jobName, 'success', stats);
			} catch (error) {
				const duration = Date.now() - startTime;
				console.error(`[Scheduler] ${jobName} failed after ${duration}ms:`, error);

				// Log to database or monitoring system if needed
				// await logJobExecution(jobName, 'failed', { error: error.message });
			}
		},
		{
			scheduled: true,
			timezone: 'UTC',
		}
	);

	scheduledJobs.set(jobName, task);
	console.log(`[Scheduler] ${jobName} scheduled: ${JOB_SCHEDULES.dataArchival} (UTC)`);
}

/**
 * Initialize All Scheduled Jobs
 *
 * Starts all background jobs defined in the scheduler.
 * Should be called once at application startup.
 */
export function initializeScheduler(): void {
	console.log('='.repeat(80));
	console.log('[Scheduler] Initializing background job scheduler');
	console.log('='.repeat(80));

	// Schedule data archival job
	scheduleDataArchival();

	// Add more scheduled jobs here as needed
	// scheduleHealthCheck();
	// scheduleReportGeneration();

	console.log(`[Scheduler] ${scheduledJobs.size} job(s) scheduled`);
	console.log('='.repeat(80));
}

/**
 * Stop All Scheduled Jobs
 *
 * Gracefully stops all running background jobs.
 * Should be called on application shutdown.
 */
export function stopScheduler(): void {
	console.log('[Scheduler] Stopping all scheduled jobs');

	scheduledJobs.forEach((task, jobName) => {
		console.log(`[Scheduler] Stopping ${jobName}`);
		task.stop();
	});

	scheduledJobs.clear();
	console.log('[Scheduler] All jobs stopped');
}

/**
 * Get Scheduled Jobs Status
 *
 * Returns information about all scheduled jobs.
 * Useful for monitoring and debugging.
 */
export function getSchedulerStatus(): {
	totalJobs: number;
	jobs: Array<{ name: string; schedule: string; running: boolean }>;
} {
	const jobs: Array<{ name: string; schedule: string; running: boolean }> = [];

	scheduledJobs.forEach((task, jobName) => {
		jobs.push({
			name: jobName,
			schedule: JOB_SCHEDULES.dataArchival, // TODO: Store schedule per job
			running: task.getStatus() === 'scheduled',
		});
	});

	return {
		totalJobs: scheduledJobs.size,
		jobs,
	};
}

/**
 * Manually Trigger Data Archival
 *
 * Allows manual execution of the data archival job.
 * Useful for testing or immediate archival needs.
 */
export async function triggerDataArchival(): Promise<void> {
	console.log('[Scheduler] Manually triggering data archival job');

	try {
		const stats = await archiveOldData();
		console.log('[Scheduler] Manual archival completed:', stats);
	} catch (error) {
		console.error('[Scheduler] Manual archival failed:', error);
		throw error;
	}
}

/**
 * CLI Entry Point
 *
 * Allows running the scheduler from command line:
 * node backend/jobs/scheduler.js
 */
if (import.meta.url === `file://${process.argv[1]}`) {
	console.log('[Scheduler] Starting scheduler from CLI');

	// Initialize scheduler
	initializeScheduler();

	// Keep process alive
	console.log('[Scheduler] Scheduler running. Press Ctrl+C to stop.');

	// Handle graceful shutdown
	process.on('SIGINT', () => {
		console.log('\n[Scheduler] Received SIGINT, shutting down gracefully');
		stopScheduler();
		process.exit(0);
	});

	process.on('SIGTERM', () => {
		console.log('\n[Scheduler] Received SIGTERM, shutting down gracefully');
		stopScheduler();
		process.exit(0);
	});
}

/**
 * Export for use in main application
 */
export default {
	initialize: initializeScheduler,
	stop: stopScheduler,
	getStatus: getSchedulerStatus,
	triggerDataArchival,
};
