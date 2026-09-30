import type { DiscoflareEnv } from './env'
import {
  addParticipant,
  createMeeting,
  endMeeting,
  loadRealtimeKitConfig,
  realtimekitConfigured,
  removeParticipants,
  type RealtimeKitParticipant,
} from './realtimekit'

/**
 * The media plane behind a Live room. The Channel Durable Object decides who
 * may join and who is a host; this only creates meetings and seats in them.
 * Today it talks to RealtimeKit with the installation's own credential.
 */
export type LiveMedia = {
  createMeeting: (title: string) => Promise<{ id: string }>
  addParticipant: (meetingId: string, seat: { name: string, customId: string, host: boolean }) => Promise<RealtimeKitParticipant>
  removeParticipants: (meetingId: string, participantIds: string[]) => Promise<void>
  endMeeting: (meetingId: string) => Promise<void>
}

/** The media plane for this installation, or null when Live is not connected. */
export async function liveMedia(env: DiscoflareEnv): Promise<LiveMedia | null> {
  const config = await loadRealtimeKitConfig(env)
  if (!realtimekitConfigured(config)) return null
  return {
    createMeeting: title => createMeeting(config, title),
    addParticipant: (meetingId, seat) => addParticipant(config, meetingId, {
      name: seat.name,
      customId: seat.customId,
      preset: seat.host ? config.hostPreset : config.participantPreset,
    }),
    removeParticipants: (meetingId, participantIds) => removeParticipants(config, meetingId, participantIds),
    endMeeting: meetingId => endMeeting(config, meetingId),
  }
}
