# Discoflare

Self-hosted team chat that runs on a Cloudflare account. One operator, many members, text plus optional voice huddles.

## Language

**Workspace**:
The single named space in a Discoflare installation. It owns the installation's members, roles, channels, and invites.
_Avoid_: Guild, server, team (in data), tenant

**Channel**:
A named stream inside the workspace. Type is `text`, `voice`, `thread`, or `dm`; visibility is `workspace` or `private`.
_Avoid_: Room, chat, conversation

**Channel Category**:
An ordered, collapsible sidebar group for workspace text and voice Channels. A Channel may be uncategorized. Direct Messages and Threads do not belong to Channel Categories.
_Avoid_: Folder, section as a separate data model, category as a Channel type

**Channel Member**:
A workspace member granted access to a private Channel. Direct Message participants are Channel Members, and Threads inherit access from their parent Channel.
_Avoid_: DM participant as a separate entity, channel role

**Direct Message**:
A private Channel among workspace members. Two members is 1:1; three to twenty-five is a group.
_Avoid_: Friend chat, private message, Group DM as a separate kind, DM voice channel

**Huddle**:
A live voice session, optionally with camera, on a Voice Channel or Direct Message.
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
Named reusable set of workspace Grants assigned to Members. Owner, Admin, and Member are protected system Roles; operators may add custom Roles.
_Avoid_: Rank, group

**Grant**:
A workspace permission included in a Role. A Member receives the Grants held by their assigned Role; the workspace owner always has every Grant.
_Avoid_: Capability, privilege

**Invite**:
A code that grants membership in the workspace with the default member role.
_Avoid_: Link (alone), invite URL as the entity

**Message**:
A written chat event in a Channel.
_Avoid_: Post, comment

**Attachment**:
A file shared with a Message.
_Avoid_: Upload, blob (in product language)

**Presence**:
A Member's ephemeral online, idle, or offline state.
_Avoid_: User status, membership status, availability
