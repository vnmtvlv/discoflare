# Discoflare

Self-hosted team chat that runs on a Cloudflare account. One operator, many members, text plus optional voice huddles.

## Language

**Guild**:
A named space members belong to. Owns channels, roles, and invites.
_Avoid_: Server, workspace, team (in data), Discord server

**Channel**:
A named stream inside a guild. Type is `text`, `voice`, `thread`, or `dm`.
_Avoid_: Room, chat, conversation

**Direct Message**:
A workspace-scoped conversation among guild members. Two participants is 1:1; three to twenty-five is a group. It is still a Channel of type `dm`.
_Avoid_: Friend chat, private message, Group DM as a separate kind, DM voice channel

**Huddle**:
A live voice (optional camera) session on a voice channel or on a Direct Message. Media is a RealtimeKit meeting; Discoflare only stores meeting id and participants.
_Avoid_: Call, meeting (except UI copy), a second conversation entity

**Voice channel**:
A workspace Channel of type `voice` whose huddle is the room itself.
_Avoid_: DM voice, huddle channel (legacy name)

**Thread**:
A child Channel of type `thread` hanging off a text or Direct Message Channel.
_Avoid_: Subchannel, comment thread as a different store

**Member**:
A user joined to a guild with one role.
_Avoid_: User-in-server, participant (except huddle media peers)

**Role**:
Named permission set on a guild: `owner`, `admin`, or `member`.
_Avoid_: Rank, group

**Invite**:
A code that grants membership in a guild with the default member role.
_Avoid_: Link (alone), invite URL as the entity

**Message**:
A chat event in a channel. Soft-deleted via `deleted_at`. Live path is the Channel Durable Object; history source of truth is D1.
_Avoid_: Post, comment

**Attachment**:
A file blob in R2 referenced by a message.
_Avoid_: Upload, blob (in product language)

**Presence**:
Ephemeral online / idle / offline for a member. Lives in the Guild Durable Object, not D1.
_Avoid_: Status (alone), availability
