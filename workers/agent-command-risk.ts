export function requiresCommandApproval(command: string): boolean {
  return /(^|[;&|]\s*)(rm|rmdir|shred)\b|\bgit\s+push\b|\bgh\s+pr\s+merge\b|\b(?:npm|pnpm|yarn)\s+publish\b|\bwrangler\s+(?:deploy|delete|rollback|versions\s+deploy)\b|\bterraform\s+(?:apply|destroy)\b|\bkubectl\s+(?:apply|delete|replace|patch)\b/i.test(command)
}
