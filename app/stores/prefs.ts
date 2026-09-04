import { defineStore } from 'pinia'
import { useLocalStorage } from '@vueuse/core'

export const usePrefsStore = defineStore('prefs', () => {
  const compact = import.meta.client ? useLocalStorage('df:compact', false) : ref(false)
  const messageSounds = import.meta.client ? useLocalStorage('df:sounds', true) : ref(true)
  const showOnline = import.meta.client ? useLocalStorage('df:showOnline', true) : ref(true)
  const allowDms = import.meta.client ? useLocalStorage('df:allowDms', true) : ref(true)

  return { compact, messageSounds, showOnline, allowDms }
})
