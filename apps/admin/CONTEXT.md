# Discoflare Admin

An account-local control plane that owns Cloudflare deployment authority for every Discoflare installation in one Cloudflare account.

## Language

**Discoflare Admin**:
The single small Worker through which an operator creates, discovers, updates, and repairs Discoflare installations in one Cloudflare account.
_Avoid_: Admin instance, installer workspace, management workspace

**Account Admin Token**:
The account-owned Cloudflare credential an operator can create and submit directly to Admin on its own origin. It is stored only as Admin's encrypted Worker secret.
_Avoid_: Instance Admin Token, installer token, workspace token

**Managed Admin OAuth Credential**:
The renewable Cloudflare OAuth credential installed as encrypted Admin Worker secrets by Managed Setup. It authorizes fixed infrastructure operations without creating an Account Admin Token.
_Avoid_: Installer token, Admin login token, workspace OAuth

**Admin Session**:
The stateless encrypted cookie issued after discoflare.com returns a verified Cloudflare identity to Admin. It contains no Cloudflare account credential and needs no Admin database.
_Avoid_: Managed OAuth Grant, Cloudflare Access session, workspace session

**Installation**:
A Discoflare workspace Worker and the Cloudflare resources bound to it. It contains no Account Admin Token.
_Avoid_: Managed instance, tenant

**Managed Setup**:
The discoflare.com flow that creates or repairs Admin, installs its renewable OAuth credential as encrypted Worker secrets, asks Admin to create the first base Installation, and discards the website installer session.
_Avoid_: Hosted control plane, runtime proxy, Private Setup

**Update Policy**:
The operator's choice to receive an update notification or let Discoflare Admin apply a compatible release automatically.
_Avoid_: Management mode, manual installation, managed installation
