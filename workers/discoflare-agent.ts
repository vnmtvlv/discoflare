import { getSandbox, type Sandbox } from '@cloudflare/sandbox'
import { Agent } from 'agents'
import {
  Think,
  action,
  defaultContextOverflowClassifier,
  type Action,
  type ChatResponseResult,
  type ChunkContext,
  type ThinkSubmissionInspection,
  type ToolCallContext,
  type ToolCallResultContext,
  type TurnContext,
} from '@cloudflare/think'
import { tool, type ToolSet, type UIMessage } from 'ai'
import { z } from 'zod'
import { newId, nowIso } from '../shared/ids'
import type { DiscoflareEnv } from './env'
import { ensureAgentReplyTarget } from './agent-replies'
import type { AgentReactionEmoji } from './agent-reactions'
import { deleteAgentTurn, fanoutAgentTurns, patchAgentTurn, putAgentTurn } from './agent-turns'
import { requiresCommandApproval } from './agent-command-risk'
import { signalTasksChanged } from './task-events'
import { agentUserMessage, type AgentTurnMetadata } from './agent-message'
import { agentModelSupportsVision, attachMessageImages } from './agent-vision'

const DEFAULT_MODEL = '@cf/moonshotai/kimi-k2.7-code'
const WORKSPACE_ROOT = '/workspace'

type AgentProfile = {
  displayName: string
  model: string
  instructions: string
  status: 'active' | 'paused'
  sandboxId: string
}

export type AgentMessageInput = {
  messageId: string
  channelId: string
  authorId: string
  authorName: string
  content: string
  hasImages?: boolean
  mode?: 'queue' | 'steer'
}

type StreamState = {
  content: string
  lastFlushedAt: number
}

function cleanPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `${WORKSPACE_ROOT}/${path}`
  if (normalized !== WORKSPACE_ROOT && !normalized.startsWith(`${WORKSPACE_ROOT}/`)) {
    throw new Error('Path must be inside /workspace')
  }
  if (normalized.split('/').includes('..')) throw new Error('Path traversal is not allowed')
  return normalized
}

function clipped(value: string, max = 24_000): string {
  return value.length > max ? `${value.slice(0, max)}\n…truncated` : value
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is Extract<UIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map(part => part.text)
    .join('')
}

function toolLabel(toolName: string): string {
  return ({
    computer_exec: 'Running a command',
    computer_read_file: 'Reading a file',
    computer_write_file: 'Writing a file',
    computer_list_files: 'Listing files',
    create_task: 'Creating a task',
    update_task: 'Updating a task',
    post_message: 'Posting a message',
  } as Record<string, string>)[toolName] ?? 'Using a tool'
}

/** Isolated Think runtime used as a conversation or task-run facet. */
export class DiscoflareThink extends Think<DiscoflareEnv> {
  override maxSteps = 20
  override messageConcurrency = 'queue' as const
  override classifyChatError = defaultContextOverflowClassifier
  private readonly streams = new Map<string, StreamState>()

  override getModel() {
    return this.env.AGENT_MODEL?.trim() || DEFAULT_MODEL
  }

  override getSystemPrompt() {
    return [
      'You are an autonomous participant in a Discoflare workspace.',
      'Work on the assigned task, use your Cloudflare Sandbox computer when useful, and leave durable results.',
      'Do not claim that a command or file operation succeeded unless a tool result proves it.',
      'Create follow-up tasks when you discover concrete work that should be tracked separately.',
    ].join(' ')
  }

  override async beforeTurn(ctx: TurnContext) {
    const profile = await this.profile()
    if (!profile) throw new Error('Agent profile not found')
    if (profile.status !== 'active') throw new Error('Agent is paused')
    const model = profile.model || this.getModel()
    const metadata = this.messageMetadata(this.activeTurnMetadata)
    const canSeeImages = agentModelSupportsVision(model)
    const messages = metadata?.hasImages && canSeeImages
      ? await attachMessageImages(ctx.messages, this.env.DB, this.env.FILES, metadata.sourceMessageId)
      : ctx.messages
    return {
      model,
      messages,
      system: [
        ctx.system,
        `Your participant name is ${profile.displayName}.`,
        profile.instructions ? `Your profile instructions:\n${profile.instructions}` : '',
        `Your persistent computer root is ${WORKSPACE_ROOT}. Its files are checkpointed to R2 after mutations.`,
        metadata?.hasImages && !canSeeImages
          ? 'The current workspace message has image attachments, but your selected model cannot inspect visual input. Do not pretend you saw them; ask for a vision-capable model or a text description if the image is needed.'
          : '',
      ].filter(Boolean).join('\n\n'),
    }
  }

  override getActions(): Record<string, Action> {
    return {
      computer_exec: action({
        description: 'Run a shell command on your isolated Cloudflare Sandbox computer. Changes under /workspace are persisted to R2. High-risk or externally mutating commands require human approval.',
        inputSchema: z.object({ command: z.string().min(1).max(12_000) }),
        kind: 'durable-pause',
        approval: ({ input }) => Boolean(this.messageMetadata(this.activeTurnMetadata)) && requiresCommandApproval(input.command),
        approvalSummary: 'Run a high-risk command',
        approvalRisk: 'high',
        timeoutMs: 120_000,
        execute: async ({ command }) => {
          const sandbox = await this.computer()
          const result = await sandbox.exec(command, { timeout: 120_000 })
          await this.persistComputer(sandbox)
          return {
            success: result.success,
            exitCode: result.exitCode,
            stdout: clipped(result.stdout),
            stderr: clipped(result.stderr),
            durationMs: result.duration,
          }
        },
      }),
    }
  }

  override getTools(): ToolSet {
    return {
      computer_read_file: tool({
        description: 'Read a UTF-8 file from your persistent computer workspace.',
        inputSchema: z.object({ path: z.string().min(1).max(1000) }),
        execute: async ({ path }) => {
          const sandbox = await this.computer()
          const result = await sandbox.readFile(cleanPath(path))
          return { path: result.path, content: clipped(result.content) }
        },
      }),
      computer_write_file: tool({
        description: 'Write a UTF-8 file to your persistent computer workspace.',
        inputSchema: z.object({ path: z.string().min(1).max(1000), content: z.string().max(250_000) }),
        execute: async ({ path, content }) => {
          const sandbox = await this.computer()
          const result = await sandbox.writeFile(cleanPath(path), content)
          await this.persistComputer(sandbox)
          return { success: result.success, path: result.path }
        },
      }),
      computer_list_files: tool({
        description: 'List files in your persistent computer workspace.',
        inputSchema: z.object({ path: z.string().default('/workspace'), recursive: z.boolean().default(false) }),
        execute: async ({ path, recursive }) => {
          const sandbox = await this.computer()
          const result = await sandbox.listFiles(cleanPath(path), { recursive, includeHidden: true })
          return { files: result.files.slice(0, 500) }
        },
      }),
      create_task: tool({
        description: 'Create a follow-up task on the current Discoflare task board and assign it to yourself.',
        inputSchema: z.object({ title: z.string().min(1).max(160), description: z.string().max(4000).default('') }),
        execute: async ({ title, description }) => {
          const agentId = this.agentId()
          const runId = this.name.startsWith('task-') ? this.name.slice('task-'.length) : null
          const current = runId
            ? await this.env.DB.prepare(
                'SELECT t.board_id as id FROM task_runs r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?',
              ).bind(runId).first<{ id: string }>()
            : null
          const board = current ?? await this.env.DB.prepare(
            'SELECT id FROM task_boards WHERE archived_at IS NULL ORDER BY position, created_at LIMIT 1',
          ).first<{ id: string }>()
          if (!board) throw new Error('No task board exists')
          const id = newId()
          const now = nowIso()
          const position = await this.env.DB.prepare(
            "SELECT coalesce(max(position), 0) + 1024 as value FROM tasks WHERE board_id = ? AND status = 'ready'",
          ).bind(board.id).first<{ value: number }>()
          await this.env.DB.prepare(
            `INSERT INTO tasks (id, board_id, title, description, status, position, assignee_id, channel_id, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ready', ?, ?, NULL, ?, ?, ?)`,
          ).bind(id, board.id, title, description, position?.value ?? 1024, agentId, agentId, now, now).run()
          await this.env.DB.prepare(
            'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).bind(newId(), agentId, 'task.create', 'task', id, JSON.stringify({ boardId: board.id, sourceRunId: runId }), now).run()
          await signalTasksChanged(this.env, board.id, id)
          return { id, title, status: 'ready' }
        },
      }),
      update_task: tool({
        description: 'Update the status and result text of a task assigned to you.',
        inputSchema: z.object({
          taskId: z.string().min(8),
          status: z.enum(['backlog', 'ready', 'review', 'done', 'failed']),
          summary: z.string().max(2000).optional(),
          details: z.string().max(20_000).optional(),
        }),
        execute: async ({ taskId, status, summary, details }) => {
          const agentId = this.agentId()
          const current = await this.env.DB.prepare('SELECT board_id as boardId FROM tasks WHERE id = ? AND assignee_id = ? AND status <> \'running\'')
            .bind(taskId, agentId).first<{ boardId: string }>()
          if (!current) return { updated: false }
          const result = await this.env.DB.prepare(
            `UPDATE tasks SET status = ?, result_summary = coalesce(?, result_summary), result_details = coalesce(?, result_details), updated_at = ?
             WHERE id = ? AND assignee_id = ? AND status <> 'running'`,
          ).bind(status, summary ?? null, details ?? null, nowIso(), taskId, agentId).run()
          const updated = (result.meta.changes ?? 0) > 0
          if (updated) {
            const now = nowIso()
            await this.env.DB.prepare(
              'INSERT INTO audit_log (id, actor_id, action, target_type, target_id, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ).bind(newId(), agentId, 'task.update', 'task', taskId, JSON.stringify({ fields: ['status', 'result'], status }), now).run()
            await signalTasksChanged(this.env, current.boardId, taskId)
          }
          return { updated }
        },
      }),
      post_message: tool({
        description: 'Post a message as yourself to a Discoflare channel you can access.',
        inputSchema: z.object({ channelId: z.string().min(8), content: z.string().min(1).max(2000) }),
        execute: async ({ channelId, content }) => this.postMessage(channelId, content),
      }),
    }
  }

  async startTask(input: { taskId: string; runId: string }): Promise<string> {
    const profile = await this.profile()
    if (!profile || profile.status !== 'active') throw new Error('Agent is unavailable')
    return this.runWorkflow('AGENT_TASK_WORKFLOW', input, {
      id: input.runId,
      agentBinding: 'AGENT_DO',
      metadata: { taskId: input.taskId, agentId: this.agentId() },
    })
  }

  async receiveMessage(input: AgentMessageInput): Promise<string> {
    const profile = await this.profile()
    if (!profile || profile.status !== 'active') throw new Error('Agent is unavailable')
    if (input.mode === 'steer') await this.cancelActive(false, 'Steered by a member')
    const submissionId = `message-${input.messageId}`
    await Promise.all([
      this.setMessageReaction(input.channelId, input.messageId, '👀'),
      putAgentTurn(this.env, {
        submissionId,
        agentId: this.agentId(),
        channelId: input.channelId,
        sourceMessageId: input.messageId,
        initiatedBy: input.authorId,
        status: 'queued',
        detail: 'Queued',
      }),
    ])
    try {
      const metadata: AgentTurnMetadata = {
        kind: 'message',
        submissionId,
        sourceMessageId: input.messageId,
        channelId: input.channelId,
        initiatedBy: input.authorId,
        hasImages: input.hasImages,
      }
      const submission = await this.submitMessages([agentUserMessage({
        id: input.messageId,
        authorName: input.authorName,
        content: input.content,
        metadata,
      })], {
        submissionId,
        idempotencyKey: input.messageId,
        metadata,
      })
      await fanoutAgentTurns(this.env, input.channelId, this.agentId())
      return submission.submissionId
    }
    catch (error) {
      await Promise.all([
        this.setMessageReaction(input.channelId, input.messageId, '❌'),
        deleteAgentTurn(this.env, submissionId),
      ])
      await fanoutAgentTurns(this.env, input.channelId, this.agentId())
      throw error
    }
  }

  async controlConversation(input: {
    channelId: string
    action: 'stop' | 'approve' | 'reject'
    executionId?: string
  }): Promise<void> {
    if (input.action === 'stop') {
      await this.cancelActive(true, 'Stopped by a member')
      return
    }
    if (!input.executionId) throw new Error('Approval execution id is required')
    const pending = await this.pendingApprovals(input.executionId)
    const approval = pending.find(item => item.executionId === input.executionId)
    if (!approval) throw new Error('Approval is no longer pending')
    const row = await this.env.DB.prepare(
      'SELECT submission_id as submissionId FROM agent_turns WHERE channel_id = ? AND request_id = ?',
    ).bind(input.channelId, approval.descriptor.requestId).first<{ submissionId: string }>()
    if (!row) throw new Error('Approval does not belong to this channel')
    await patchAgentTurn(this.env, row.submissionId, { status: 'thinking', detail: input.action === 'approve' ? 'Approved' : 'Rejected', approval: null })
    await fanoutAgentTurns(this.env, input.channelId, this.agentId())
    const decision = input.action === 'approve'
      ? this.approveExecution(input.executionId)
      : this.rejectExecution(input.executionId, 'Rejected by a member')
    this.ctx.waitUntil(decision.catch(async () => {
      await this.failMessageTurn(row.submissionId)
    }))
  }

  override async onSubmissionStatus(submission: ThinkSubmissionInspection): Promise<void> {
    const metadata = this.messageMetadata(submission.metadata)
    if (!metadata) return
    if (submission.status === 'pending' || submission.status === 'running') {
      await putAgentTurn(this.env, {
        submissionId: metadata.submissionId,
        agentId: this.agentId(),
        channelId: metadata.channelId,
        sourceMessageId: metadata.sourceMessageId,
        initiatedBy: metadata.initiatedBy,
        requestId: submission.requestId,
        status: submission.status === 'pending' ? 'queued' : 'thinking',
        detail: submission.status === 'pending' ? 'Queued' : 'Thinking',
      })
      await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
      return
    }
    if (submission.status === 'error' || submission.status === 'aborted' || submission.status === 'skipped') {
      await this.failMessageTurn(metadata.submissionId, submission.status === 'aborted' ? '⏹️' : '❌')
    }
  }

  override async beforeToolCall(ctx: ToolCallContext): Promise<void> {
    const metadata = this.messageMetadata(this.activeTurnMetadata)
    if (!metadata) {
      await this.setTaskProgress(toolLabel(ctx.toolName))
      return
    }
    await patchAgentTurn(this.env, metadata.submissionId, { status: 'tool', detail: toolLabel(ctx.toolName), approval: null })
    await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
  }

  override async afterToolCall(_ctx: ToolCallResultContext): Promise<void> {
    const metadata = this.messageMetadata(this.activeTurnMetadata)
    if (!metadata) {
      await this.setTaskProgress('Thinking')
      return
    }
    await patchAgentTurn(this.env, metadata.submissionId, { status: 'thinking', detail: 'Thinking' })
    await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
  }

  override async onChunk(ctx: ChunkContext): Promise<void> {
    if (ctx.chunk.type !== 'text-delta') return
    const metadata = this.messageMetadata(this.activeTurnMetadata)
    if (!metadata) return
    const state = this.streams.get(metadata.submissionId) ?? { content: '', lastFlushedAt: 0 }
    state.content += ctx.chunk.text
    this.streams.set(metadata.submissionId, state)
    const now = Date.now()
    if (now - state.lastFlushedAt < 300) return
    state.lastFlushedAt = now
    await this.flushDraft(metadata, state.content)
  }

  override async onChatResponse(result: ChatResponseResult): Promise<void> {
    const metadata = this.messageMetadata(this.activeTurnMetadata)
    if (!metadata) return
    const approval = (await this.pendingApprovals()).find(item => item.descriptor.requestId === result.requestId)
    if (approval) {
      await patchAgentTurn(this.env, metadata.submissionId, {
        requestId: result.requestId,
        status: 'waiting_approval',
        detail: approval.descriptor.summary,
        approval: {
          executionId: approval.executionId,
          action: approval.descriptor.action,
          summary: approval.descriptor.summary,
          input: approval.descriptor.input,
          risk: approval.descriptor.risk,
        },
      })
      await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
      return
    }

    const content = clipped(messageText(result.message), 2000).trim()
    if (content) await this.flushDraft(metadata, content)
    this.streams.delete(metadata.submissionId)
    await Promise.all([
      this.setMessageReaction(metadata.channelId, metadata.sourceMessageId, result.status === 'completed' ? '✅' : result.status === 'aborted' ? '⏹️' : '❌'),
      deleteAgentTurn(this.env, metadata.submissionId),
    ])
    await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
  }

  async setMessageReaction(channelId: string, messageId: string, emoji: AgentReactionEmoji) {
    try {
      const agentId = this.agentId()
      const channel = this.env.CHANNEL_DO.getByName(`channel:${channelId}`) as DurableObjectStub & {
        setAgentReaction: (input: { agentId: string; messageId: string; emoji: AgentReactionEmoji }) => Promise<void>
      }
      await channel.setAgentReaction({ agentId, messageId, emoji })
    }
    catch {
      // Reactions are best-effort feedback; they never block the Agent's reply.
    }
  }

  async replyToMessage(channelId: string, messageId: string, content: string) {
    const target = await ensureAgentReplyTarget(this.env.DB, channelId, messageId)
    if (target.parentChannelId && target.parentMessageId) {
      try {
        const parent = this.env.CHANNEL_DO.getByName(`channel:${target.parentChannelId}`) as DurableObjectStub & { fanout: (value: unknown) => Promise<void> }
        await parent.fanout({ t: 'thread.created', messageId: target.parentMessageId, threadId: target.channelId })
      }
      catch {
        // D1 is authoritative; clients recover the thread link on refresh.
      }
    }
    return this.postMessage(target.channelId, content)
  }

  private messageMetadata(value: Record<string, unknown> | undefined): AgentTurnMetadata | null {
    if (!value || value.kind !== 'message') return null
    const submissionId = typeof value.submissionId === 'string' ? value.submissionId : ''
    const sourceMessageId = typeof value.sourceMessageId === 'string' ? value.sourceMessageId : ''
    const channelId = typeof value.channelId === 'string' ? value.channelId : ''
    const initiatedBy = typeof value.initiatedBy === 'string' ? value.initiatedBy : ''
    const hasImages = value.hasImages === true
    return submissionId && sourceMessageId && channelId && initiatedBy
      ? { kind: 'message', submissionId, sourceMessageId, channelId, initiatedBy, hasImages }
      : null
  }

  private async setTaskProgress(progress: string): Promise<void> {
    if (!this.name.startsWith('task-')) return
    const runId = this.name.slice('task-'.length)
    await this.env.DB.prepare("UPDATE task_runs SET progress = ? WHERE id = ? AND status IN ('queued', 'running')")
      .bind(progress, runId).run()
    const task = await this.env.DB.prepare(
      'SELECT t.id, t.board_id as boardId FROM task_runs r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?',
    ).bind(runId).first<{ id: string; boardId: string }>()
    if (task) await signalTasksChanged(this.env, task.boardId, task.id)
  }

  private async cancelActive(includePending: boolean, reason: string): Promise<void> {
    const submissions = await this.listSubmissions({ status: includePending ? ['pending', 'running'] : 'running' })
    await Promise.all(submissions.map(submission => this.cancelSubmission(submission.submissionId, reason)))
  }

  private async failMessageTurn(submissionId: string, emoji: AgentReactionEmoji = '❌'): Promise<void> {
    const row = await this.env.DB.prepare(
      'SELECT channel_id as channelId, source_message_id as sourceMessageId FROM agent_turns WHERE submission_id = ?',
    ).bind(submissionId).first<{ channelId: string; sourceMessageId: string }>()
    if (!row) return
    this.streams.delete(submissionId)
    await Promise.all([
      this.setMessageReaction(row.channelId, row.sourceMessageId, emoji),
      deleteAgentTurn(this.env, submissionId),
    ])
    await fanoutAgentTurns(this.env, row.channelId, this.agentId())
  }

  private async flushDraft(metadata: AgentTurnMetadata, content: string): Promise<void> {
    const value = clipped(content, 2000)
    const turn = await this.env.DB.prepare(
      `SELECT t.draft_message_id as draftMessageId, m.channel_id as draftChannelId
       FROM agent_turns t LEFT JOIN messages m ON m.id = t.draft_message_id
       WHERE t.submission_id = ?`,
    ).bind(metadata.submissionId).first<{ draftMessageId: string | null; draftChannelId: string | null }>()
    if (!turn) return
    if (!turn.draftMessageId) {
      const posted = await this.replyToMessage(metadata.channelId, metadata.sourceMessageId, value)
      await patchAgentTurn(this.env, metadata.submissionId, { draftMessageId: posted.id })
      await fanoutAgentTurns(this.env, metadata.channelId, this.agentId())
      return
    }
    const channel = this.env.CHANNEL_DO.getByName(`channel:${turn.draftChannelId || metadata.channelId}`) as DurableObjectStub & {
      updateAgentMessage: (input: { agentId: string; messageId: string; content: string }) => Promise<void>
    }
    await channel.updateAgentMessage({ agentId: this.agentId(), messageId: turn.draftMessageId, content: value })
  }

  private agentId(): string {
    const rootName = this.parentPath[0]?.name ?? this.name
    return rootName.startsWith('agent:') ? rootName.slice('agent:'.length) : rootName
  }

  private async profile(): Promise<AgentProfile | null> {
    return this.env.DB.prepare(
      `SELECT u.display_name as displayName, a.model, a.instructions, a.status, a.sandbox_id as sandboxId
       FROM agents a JOIN users u ON u.id = a.user_id WHERE a.user_id = ?`,
    ).bind(this.agentId()).first<AgentProfile>()
  }

  private archiveKey(): string {
    return `agent-computers/${this.agentId()}/workspace.tgz`
  }

  private async computer(): Promise<Sandbox> {
    const profile = await this.profile()
    if (!profile) throw new Error('Agent profile not found')
    const sandbox = getSandbox(this.env.AGENT_SANDBOX, profile.sandboxId, {
      sleepAfter: '10m',
      normalizeId: true,
      transport: 'rpc',
      labels: { product: 'discoflare', agentId: this.agentId() },
    })
    const marker = await sandbox.exists(`${WORKSPACE_ROOT}/.discoflare-hydrated`)
    if (!marker.exists) {
      await sandbox.mkdir(WORKSPACE_ROOT, { recursive: true })
      const archive = await this.env.FILES.get(this.archiveKey())
      if (archive?.body) {
        await sandbox.writeFile('/tmp/discoflare-workspace.tgz', archive.body)
        const restored = await sandbox.exec(`tar -xzf /tmp/discoflare-workspace.tgz -C ${WORKSPACE_ROOT}`, { timeout: 120_000 })
        if (!restored.success) throw new Error(`Could not restore agent computer: ${restored.stderr}`)
      }
      await sandbox.writeFile(`${WORKSPACE_ROOT}/.discoflare-hydrated`, nowIso())
    }
    return sandbox
  }

  private async persistComputer(sandbox: Sandbox): Promise<void> {
    const packed = await sandbox.exec(
      `tar --exclude=.discoflare-hydrated -czf /tmp/discoflare-workspace.tgz -C ${WORKSPACE_ROOT} .`,
      { timeout: 120_000 },
    )
    if (!packed.success) throw new Error(`Could not checkpoint agent computer: ${packed.stderr}`)
    const archive = await sandbox.readFile('/tmp/discoflare-workspace.tgz', { encoding: 'none' })
    const fixed = new FixedLengthStream(archive.size)
    const upload = this.env.FILES.put(this.archiveKey(), fixed.readable, {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: { agentId: this.agentId(), checkpointedAt: nowIso() },
    })
    await Promise.all([archive.content.pipeTo(fixed.writable), upload])
    await this.env.DB.prepare('UPDATE agents SET last_active_at = ?, updated_at = ? WHERE user_id = ?')
      .bind(nowIso(), nowIso(), this.agentId()).run()
  }

  async postMessage(channelId: string, content: string) {
    const agentId = this.agentId()
    const channel = this.env.CHANNEL_DO.getByName(`channel:${channelId}`) as DurableObjectStub & {
      postAgentMessage: (input: { agentId: string; content: string }) => Promise<{ id: string; channelId: string }>
    }
    return channel.postAgentMessage({ agentId, content })
  }
}

/** Stable top-level coordinator. Each channel/thread and task run receives its own Think facet. */
export class DiscoflareAgent extends Agent<DiscoflareEnv> {
  async receiveMessage(input: AgentMessageInput): Promise<string> {
    const conversation = await this.subAgent(DiscoflareThink, `channel-${input.channelId}`)
    return conversation.receiveMessage(input)
  }

  async startTask(input: { taskId: string; runId: string }): Promise<string> {
    const run = await this.subAgent(DiscoflareThink, `task-${input.runId}`)
    return run.startTask(input)
  }

  async controlConversation(input: {
    channelId: string
    action: 'stop' | 'approve' | 'reject'
    executionId?: string
  }): Promise<void> {
    const conversation = await this.subAgent(DiscoflareThink, `channel-${input.channelId}`)
    await conversation.controlConversation(input)
  }
}
