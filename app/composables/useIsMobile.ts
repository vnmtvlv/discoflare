import { useWindowSize } from '@vueuse/core'

/** Phone layout: one pane at a time with the navigation in a drawer. */
export function useIsMobile() {
  const { width } = useWindowSize()
  return computed(() => width.value > 0 && width.value < 768)
}
