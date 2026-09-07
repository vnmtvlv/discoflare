import { describe, expect, it, vi } from 'vitest'
import { cleanComputerPath, createAgentComputer } from '../../workers/agent-computer-adapter'

function workspaceFixture() {
  const disposeRun = vi.fn()
  const disposeWorkspace = vi.fn()
  const result = vi.fn().mockResolvedValue({
    status: 'completed',
    exitCode: 0,
    stdout: 'hello\n',
    stderr: '',
  })
  const workspace = {
    fs: {
      readFile: vi.fn().mockResolvedValue('contents'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([
        { parentPath: '/workspace', name: 'notes', size: 0, isDirectory: true, isSymbolicLink: false },
      ]),
      find: vi.fn().mockResolvedValue([{ path: '/workspace/notes/todo.md', type: 'file' }]),
    },
    runtime: {
      exec: vi.fn().mockResolvedValue({ result, [Symbol.dispose]: disposeRun }),
    },
    [Symbol.dispose]: disposeWorkspace,
  }
  return { workspace, disposeRun, disposeWorkspace, result }
}

describe('AgentComputer adapter', () => {
  it('keeps every file operation inside the durable workspace', () => {
    expect(cleanComputerPath('notes/todo.md')).toBe('/workspace/notes/todo.md')
    expect(cleanComputerPath('/workspace')).toBe('/workspace')
    expect(() => cleanComputerPath('/etc/passwd')).toThrow('inside /workspace')
    expect(() => cleanComputerPath('../secret')).toThrow('Path traversal')
  })

  it('creates parent directories and records mutations', async () => {
    const { workspace } = workspaceFixture()
    const mutated = vi.fn().mockResolvedValue(undefined)
    const computer = createAgentComputer(workspace, mutated)

    await computer.write('notes/todo.md', 'ship it')

    expect(workspace.fs.mkdir).toHaveBeenCalledWith('/workspace/notes', { recursive: true })
    expect(workspace.fs.writeFile).toHaveBeenCalledWith('/workspace/notes/todo.md', 'ship it')
    expect(mutated).toHaveBeenCalledOnce()
  })

  it('runs commands from /workspace and disposes remote handles', async () => {
    const { workspace, disposeRun, disposeWorkspace } = workspaceFixture()
    const mutated = vi.fn().mockResolvedValue(undefined)
    const computer = createAgentComputer(workspace, mutated)

    await expect(computer.exec('printf hello')).resolves.toEqual({
      success: true,
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
    })
    expect(workspace.runtime.exec).toHaveBeenCalledWith('printf hello', {
      cwd: '/workspace',
      encoding: 'utf8',
      timeoutMs: 120_000,
    })
    expect(disposeRun).toHaveBeenCalledOnce()
    expect(mutated).toHaveBeenCalledOnce()

    computer.close()
    expect(disposeWorkspace).toHaveBeenCalledOnce()
  })

  it('normalizes list results without exposing the preview API', async () => {
    const { workspace } = workspaceFixture()
    const computer = createAgentComputer(workspace)

    await expect(computer.list('/workspace')).resolves.toEqual([
      { path: '/workspace/notes', type: 'directory', size: 0 },
    ])
    await expect(computer.list('/workspace', true)).resolves.toEqual([
      { path: '/workspace/notes/todo.md', type: 'file', size: 0 },
    ])
  })
})
