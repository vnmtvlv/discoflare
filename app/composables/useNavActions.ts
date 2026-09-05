/**
 * Sidebar actions that live in one component but are triggered from another —
 * the workspace dropdown and the `+` on each nav section header both open
 * modals that are mounted by NavShell or by the page currently on screen.
 */
export function useNavActions() {
  const createChannelOpen = useState('nav:create-channel', () => false)
  const createChannelCategoryId = useState<string | null>('nav:create-channel-category', () => null)
  const createCategoryOpen = useState('nav:create-category', () => false)
  const inviteOpen = useState('nav:invite', () => false)
  const workspaceSettingsOpen = useState('nav:workspace-settings', () => false)
  const createBoardOpen = useState('nav:create-board', () => false)
  const composeOpen = useState('nav:compose', () => false)

  function openCreateChannel(categoryId: string | null = null) {
    createChannelCategoryId.value = categoryId === 'uncategorized' ? null : categoryId
    createChannelOpen.value = true
  }

  return {
    createChannelOpen,
    createChannelCategoryId,
    createCategoryOpen,
    inviteOpen,
    workspaceSettingsOpen,
    createBoardOpen,
    composeOpen,
    openCreateChannel,
  }
}
