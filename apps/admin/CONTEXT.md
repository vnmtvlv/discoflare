# Discoflare Admin

An account-local control plane that owns Cloudflare deployment authority for every Discoflare installation in one Cloudflare account.

## Language

**Discoflare Admin**:
The single small Worker through which an operator creates, discovers, updates, and repairs Discoflare installations in one Cloudflare account.
_Avoid_: Admin instance, installer workspace, management workspace

**Account Admin Token**:
The account-owned Cloudflare credential stored only as Admin's encrypted Worker secret. Managed Setup creates it automatically; Private Setup leaves it to the operator.
_Avoid_: Instance Admin Token, installer token, workspace token

**Admin Session**:
The stateless encrypted cookie issued after discoflare.com returns a verified Cloudflare identity to Admin. It contains no Cloudflare account credential and needs no Admin database.
_Avoid_: Managed OAuth Grant, Cloudflare Access session, workspace session

**Installation**:
A Discoflare workspace Worker and the Cloudflare resources bound to it. It contains no Account Admin Token.
_Avoid_: Managed instance, tenant

**Managed Setup**:
The discoflare.com flow that creates or repairs Admin, creates its Account Admin Token as a Worker secret, and discards temporary OAuth.
_Avoid_: Hosted control plane, runtime proxy

**Private Setup**:
The discoflare.com/deploy/private flow that creates or repairs Admin with temporary OAuth and leaves Account Admin Token connection to the operator.
_Avoid_: Managed OAuth, separate Admin product

**Update Policy**:
The operator's choice to receive an update notification or let Discoflare Admin apply a compatible release automatically.
_Avoid_: Management mode, manual installation, managed installation
