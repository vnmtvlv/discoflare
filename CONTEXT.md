# Discoflare

Self-hosted team chat that runs on a Cloudflare account. One operator, many members, text plus optional voice huddles.

## Language

**Workspace**:
The single named space in a Discoflare installation. It owns the installation's members, roles, channels, and invites. Its fixed id is `main`; owned tables do not repeat `workspace_id`.
_Avoid_: Guild, server, team (in data), tenant

**Channel**:
A named stream inside the workspace. Type is `text`, `voice`, `thread`, or `dm`; visibility is `workspace` or `private`.
_Avoid_: Room, chat, conversation

**Channel Member**:
A workspace member granted access to a private Channel. Stored in `channel_members`; Direct Message participants use the same relation. Threads inherit access from their parent Channel.
_Avoid_: DM participant as a separate entity, channel role

**Direct Message**:
A private Channel among workspace members. Two members is 1:1; three to twenty-five is a group. Its access list is stored in `channel_members`.
_Avoid_: Friend chat, private message, Group DM as a separate kind, DM voice channel

**Huddle**:
A live voice (optional camera) session on a voice channel or on a Direct Message. Media is a RealtimeKit meeting; Discoflare only stores meeting id and participants.
_Avoid_: Call, meeting (except UI copy), a second conversation entity

**Voice channel**:
A workspace Channel of type `voice` whose huddle is the room itself.
_Avoid_: DM voice, huddle channel

**Thread**:
A child Channel of type `thread` hanging off a text or Direct Message Channel.
_Avoid_: Subchannel, comment thread as a different store

**User**:
A person known to Discoflare. A User is `pending` before joining, `active` while admitted to the workspace, and `removed` after being kicked. An active User has one Role.
_Avoid_: Separate profile and membership entities

**Member**:
An active User, as presented in workspace member lists. It is a state of User, not a separate entity.
_Avoid_: User-in-server record, participant (except huddle media peers)

**Role**:
Named installation-wide permission set: `owner`, `admin`, or `member`.
_Avoid_: Rank, group

**Invite**:
A code that grants membership in the workspace with the default member role.
_Avoid_: Link (alone), invite URL as the entity

**Message**:
A chat event in a channel. Soft-deleted via `deleted_at`. Live path is the Channel Durable Object; history source of truth is D1.
_Avoid_: Post, comment

**Attachment**:
A file blob in R2 referenced by a message.
_Avoid_: Upload, blob (in product language)

**Presence**:
Ephemeral online / idle / offline for a member. Lives in the workspace presence Durable Object, not D1.
_Avoid_: User status, membership status, availability
