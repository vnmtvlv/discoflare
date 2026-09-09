# Discoflare Admin

An account-local control plane that owns Cloudflare deployment authority for every Discoflare installation in one Cloudflare account.

## Language

**Discoflare Admin**:
The single small Worker through which an operator creates, discovers, updates, and repairs Discoflare installations in one Cloudflare account.
_Avoid_: Admin instance, installer workspace, management workspace

**Account Admin Token**:
The account-owned Cloudflare credential manually supplied to a Private Admin and stored only as its encrypted Worker secret.
_Avoid_: Instance Admin Token, installer token, workspace token

**Managed OAuth Grant**:
The renewable public-client Cloudflare OAuth credential stored only as Discoflare Admin secrets. Admin refreshes it locally; discoflare.com is not a token broker or runtime proxy.
_Avoid_: Hosted Admin token, workspace OAuth

**Installation**:
A Discoflare workspace Worker and the Cloudflare resources bound to it. It contains no Account Admin Token.
_Avoid_: Managed instance, tenant

**Managed Setup**:
The discoflare.com flow that creates or repairs Admin, transfers a renewable OAuth grant into it, and discards the hosted copy.
_Avoid_: Hosted control plane, runtime proxy

**Private Setup**:
The discoflare.com/deploy/private flow that creates or repairs Admin with temporary OAuth and leaves Account Admin Token connection to the operator.
_Avoid_: Managed OAuth, separate Admin product

**Update Policy**:
The operator's choice to receive an update notification or let Discoflare Admin apply a compatible release automatically.
_Avoid_: Management mode, manual installation, managed installation
