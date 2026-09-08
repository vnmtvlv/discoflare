const WORKFLOW_METADATA_KEY = '__thinkWorkflowPrompt'

/** Resolve the Task Run identity Think persists on Workflow prompt turns. */
export function taskRunIdFromTurnMetadata(value: Record<string, unknown> | undefined): string | null {
  const prompt = value?.[WORKFLOW_METADATA_KEY]
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null
  const workflow = (prompt as { workflow?: unknown }).workflow
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return null
  const candidate = workflow as { name?: unknown; id?: unknown }
  return candidate.name === 'AGENT_TASK_WORKFLOW' && typeof candidate.id === 'string' ? candidate.id : null
}
