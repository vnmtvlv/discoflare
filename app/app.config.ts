import { version } from '../package.json'

export default defineAppConfig({
  version,
  ui: {
    colors: {
      primary: 'cloudflare',
      neutral: 'neutral',
    },
    icons: {
      loading: 'i-ph-spinner',
      close: 'i-ph-x',
      check: 'i-ph-check',
      chevronDown: 'i-ph-caret-down',
      chevronRight: 'i-ph-caret-right',
      chevronLeft: 'i-ph-caret-left',
      chevronUp: 'i-ph-caret-up',
      arrowLeft: 'i-ph-arrow-left',
      arrowRight: 'i-ph-arrow-right',
      search: 'i-ph-magnifying-glass',
      external: 'i-ph-arrow-square-out',
      plus: 'i-ph-plus',
      minus: 'i-ph-minus',
      ellipsis: 'i-ph-dots-three',
    },
  },
})
