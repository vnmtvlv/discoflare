import type { TaskStatus } from './types'

export const MANUAL_TASK_STATUSES = ['backlog', 'ready', 'review', 'done', 'failed'] as const satisfies readonly TaskStatus[]
export const RUNNABLE_TASK_STATUSES = ['backlog', 'ready', 'review', 'failed'] as const satisfies readonly TaskStatus[]

export function canSetTaskStatus(current: TaskStatus, next: TaskStatus): boolean {
  return current !== 'running' && next !== 'running'
}

export function canRunTask(status: TaskStatus): boolean {
  return (RUNNABLE_TASK_STATUSES as readonly TaskStatus[]).includes(status)
}
