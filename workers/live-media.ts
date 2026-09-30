import type { DiscoflareEnv } from './env'
import { discoflareAdmin } from './discoflare-admin'
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

/**
 * The media plane for this installation, or null when Live is not connected.
 * A workspace linked to a Discoflare Admin uses the Admin's RealtimeKit app and
 * holds no credential; otherwise it uses the token pasted in Workspace Settings.
 */
export async function liveMedia(env: DiscoflareEnv): Promise<LiveMedia | null> {
  const admin = discoflareAdmin(env)
  if (admin) {
    return {
      createMeeting: title => admin.liveCreateMeeting(title),
      addParticipant: (meetingId, seat) => admin.liveAddParticipant(meetingId, seat),
      removeParticipants: (meetingId, participantIds) => admin.liveRemoveParticipants(meetingId, participantIds),
      endMeeting: meetingId => admin.liveEndMeeting(meetingId),
    }
  }
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
