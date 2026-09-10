/** Open a workspace URL without going through Vue Router, which drops `#claim=` hashes. */
export function openWorkspaceOrigin(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) window.location.assign(url)
}
