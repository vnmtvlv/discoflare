import { describe, expect, it } from 'vitest'
import { requiresCommandApproval } from '../../workers/agent-command-risk'

describe('requiresCommandApproval', () => {
  it.each([
    'rm -rf dist',
    'pnpm test && git push origin main',
    'gh pr merge 42',
    'npm publish',
    'wrangler deploy',
    'wrangler versions deploy',
    'terraform destroy',
    'kubectl patch deployment web',
  ])('requires approval for %s', (command) => {
    expect(requiresCommandApproval(command)).toBe(true)
  })

  it.each([
    'ls -la',
    'pnpm test',
    'git status --short',
    'wrangler d1 execute DB --local --command "select 1"',
    'kubectl get pods',
  ])('allows %s without approval', (command) => {
    expect(requiresCommandApproval(command)).toBe(false)
  })
})
