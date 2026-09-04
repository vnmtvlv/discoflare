# Roadmap notes

## Audio message transcription

Add optional transcription for recorded audio Attachments without making it a requirement for messaging.

- Keep transcripts as derived Attachment data rather than Message content.
- Start with an explicit **Transcribe** action, then consider a workspace-level automatic transcription setting.
- Use Cloudflare Workers AI for Cloudflare deployments.
- Use a private `faster-whisper` sidecar for Docker and Coolify deployments.
- Bake the Whisper model into the sidecar image so an offline NUC can transcribe without downloading anything at runtime.
- Keep one provider-neutral transcription interface so storage, authorization, job state, retries, and UI behavior remain identical in both deployment modes.
- Show pending, ready, and failed states beneath the compact audio player and deliver completed transcripts through the existing channel realtime path.
