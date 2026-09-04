import { getSandbox, type Sandbox } from '@cloudflare/sandbox'
import { Think, defaultContextOverflowClassifier, type TurnContext } from '@cloudflare/think'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { newId, nowIso } from '../shared/ids'
import type { DiscoflareEnv } from './env'
import { messageNotificationStatement, signalNotificationOutbox } from './notifications'
import { signalChannelActivity } from './channel-activity'

const DEFAULT_MODEL = '@cf/moonshotai/kimi-k2.7-code'
const WORKSPACE_ROOT = '/workspace'

type AgentProfile = {
  displayName: string
  model: string
  instructions: string
  status: 'active' | 'paused'
  sandboxId: string
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

export class DiscoflareAgent extends Think<DiscoflareEnv> {
  override maxSteps = 20
  override messageConcurrency = 'queue' as const
  override classifyChatError = defaultContextOverflowClassifier

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
    return {
      model: profile.model || this.getModel(),
      system: [
        ctx.system,
        `Your participant name is ${profile.displayName}.`,
        profile.instructions ? `Your profile instructions:\n${profile.instructions}` : '',
        `Your persistent computer root is ${WORKSPACE_ROOT}. Its files are checkpointed to R2 after mutations.`,
      ].filter(Boolean).join('\n\n'),
    }
  }

  override getTools(): ToolSet {
    return {
      computer_exec: tool({
        description: 'Run a shell command on your isolated Cloudflare Sandbox computer. Changes under /workspace are persisted to R2.',
        inputSchema: z.object({ command: z.string().min(1).max(12_000) }),
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
          const board = await this.env.DB.prepare('SELECT id FROM task_boards ORDER BY position, created_at LIMIT 1').first<{ id: string }>()
          if (!board) throw new Error('No task board exists')
          const id = newId()
          const now = nowIso()
          await this.env.DB.prepare(
            `INSERT INTO tasks (id, board_id, title, description, status, position, assignee_id, channel_id, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ready', ?, ?, NULL, ?, ?, ?)`,
          ).bind(id, board.id, title, description, Date.now() % 1_000_000_000, agentId, agentId, now, now).run()
          return { id, title, status: 'ready' }
        },
      }),
      update_task: tool({
        description: 'Update the status and result text of a task assigned to you.',
        inputSchema: z.object({
          taskId: z.string().min(8),
          status: z.enum(['backlog', 'ready', 'running', 'review', 'done', 'failed']),
          summary: z.string().max(2000).optional(),
          details: z.string().max(20_000).optional(),
        }),
        execute: async ({ taskId, status, summary, details }) => {
          const result = await this.env.DB.prepare(
            `UPDATE tasks SET status = ?, result_summary = coalesce(?, result_summary), result_details = coalesce(?, result_details), updated_at = ?
             WHERE id = ? AND assignee_id = ?`,
          ).bind(status, summary ?? null, details ?? null, nowIso(), taskId, this.agentId()).run()
          return { updated: (result.meta.changes ?? 0) > 0 }
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

  async receiveMessage(input: { messageId: string; channelId: string; authorName: string; content: string }): Promise<string> {
    const profile = await this.profile()
    if (!profile || profile.status !== 'active') throw new Error('Agent is unavailable')
    return this.runWorkflow('AGENT_MESSAGE_WORKFLOW', input, {
      id: `reply-${this.agentId()}-${input.messageId}`,
      agentBinding: 'AGENT_DO',
      metadata: { messageId: input.messageId, channelId: input.channelId, agentId: this.agentId() },
    })
  }

  private agentId(): string {
    return this.name.startsWith('agent:') ? this.name.slice('agent:'.length) : this.name
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
    await this.env.FILES.put(this.archiveKey(), archive.content, {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: { agentId: this.agentId(), checkpointedAt: nowIso() },
    })
    await this.env.DB.prepare('UPDATE agents SET last_active_at = ?, updated_at = ? WHERE user_id = ?')
      .bind(nowIso(), nowIso(), this.agentId()).run()
  }

  async postMessage(channelId: string, content: string) {
    const agentId = this.agentId()
    const channel = await this.env.DB.prepare('SELECT id, visibility FROM channels WHERE id = ?').bind(channelId).first<{ id: string; visibility: string }>()
    if (!channel) throw new Error('Channel not found')
    if (channel.visibility === 'private') {
      const access = await this.env.DB.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').bind(channelId, agentId).first()
      if (!access) throw new Error('Agent cannot access this private channel')
    }
    const id = newId()
    const createdAt = nowIso()
    const profile = await this.profile()
    const message = {
      id,
      channelId,
      workspaceId: 'main',
      author: { id: agentId, kind: 'agent', displayName: profile?.displayName ?? 'Agent', avatarR2Key: null },
      content,
      replyTo: null,
      mentions: [],
      attachments: [],
      reactions: [],
      pin: null,
      threadId: null,
      editedAt: null,
      deletedAt: null,
      createdAt,
    } as const
    const notification = await messageNotificationStatement(this.env, {
      id,
      channelId,
      author: message.author,
      content,
      mentions: [],
      attachmentCount: 0,
    })
    await this.env.DB.batch([
      this.env.DB.prepare(
        'INSERT INTO messages (id, channel_id, author_id, content, reply_to_id, edited_at, deleted_at, created_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?)',
      ).bind(id, channelId, agentId, content, createdAt),
      ...(notification ? [notification] : []),
    ])
    this.ctx.waitUntil(signalNotificationOutbox(this.env))
    this.ctx.waitUntil(signalChannelActivity(this.env, channelId, agentId, id))
    try {
      const stub = this.env.CHANNEL_DO.getByName(`channel:${channelId}`) as DurableObjectStub & { fanout: (value: unknown) => Promise<void> }
      await stub.fanout({ t: 'message', message })
    }
    catch {
      // The D1 write is authoritative; live clients will catch up on refresh.
    }
    return { id, channelId }
  }
}
