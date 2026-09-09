# Product demo media

The landing page works without video assets by showing coded product previews.

To replace a preview with a looping demo, add an optimized `.webm` (and optional poster image) here, then pass its public path to the matching `DemoPanel` in `app/pages/index.vue`, for example:

```vue
<DemoPanel video-src="/demos/channels.webm" ... />
```

Keep clips short, muted, loopable, and free of real customer data. WebM/MP4 is preferred over GIF for size and clarity.
