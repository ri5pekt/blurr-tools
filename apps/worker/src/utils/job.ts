import { eq } from 'drizzle-orm'
import { jobs } from '@blurr-tools/db'
import { db } from '../db.js'

export async function startJob(jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(jobs.id, jobId))
}

export async function updateJobProgress(jobId: string, progress: number): Promise<void> {
  await db
    .update(jobs)
    .set({ progress })
    .where(eq(jobs.id, jobId))
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'completed', completedAt: new Date(), progress: 100, result })
    .where(eq(jobs.id, jobId))
}

export async function failJob(jobId: string, errorMessage: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: 'failed', completedAt: new Date(), errorMessage })
    .where(eq(jobs.id, jobId))
}
