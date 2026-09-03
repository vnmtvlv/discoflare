import { defineStore } from 'pinia'
import type { HuddleState } from '~~/shared/types'

type Conn = 'idle' | 'connecting' | 'live' | 'error'

export const useHuddleStore = defineStore('huddle', () => {
  const state = ref<HuddleState | null>(null)
  const muted = ref(false)
  const deafened = ref(false)
  const camera = ref(false)
  const connection = ref<Conn>('idle')
  const error = ref<string | null>(null)
  const meeting = shallowRef<unknown>(null)

  function setState(next: HuddleState | null) {
    state.value = next
  }

  type MeetingSelf = {
    enableAudio: () => Promise<void>
    disableAudio: () => Promise<void> | void
  }

  async function applyMute(next: boolean) {
    const m = meeting.value as { self?: MeetingSelf } | null
    if (m?.self) {
      if (next) await m.self.disableAudio()
      else await m.self.enableAudio()
    }
    muted.value = next
  }

  async function toggleMute() {
    if (deafened.value && muted.value) return
    await applyMute(!muted.value)
  }

  async function toggleDeafen() {
    const next = !deafened.value
    deafened.value = next
    if (next) await applyMute(true)
  }

  return { state, muted, deafened, camera, connection, error, meeting, setState, applyMute, toggleMute, toggleDeafen }
})
