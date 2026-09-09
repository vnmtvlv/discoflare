# Discoflare Admin

An account-local control plane that owns Cloudflare deployment authority for every Discoflare installation in one Cloudflare account.

## Language

**Discoflare Admin**:
The single small Worker through which an operator creates, discovers, updates, and repairs Discoflare installations in one Cloudflare account.
_Avoid_: Admin instance, installer workspace, management workspace

**Account Admin Token**:
The one account-owned Cloudflare credential held only by Discoflare Admin and used for fixed infrastructure operations in its account.
_Avoid_: Instance Admin Token, installer token, workspace token

**Installation**:
A Discoflare workspace Worker and the Cloudflare resources bound to it. It contains no Account Admin Token.
_Avoid_: Managed instance, tenant

**Bootstrap Installer**:
The temporary OAuth flow on discoflare.com that creates or repairs Discoflare Admin and then relinquishes its Cloudflare authority.
_Avoid_: Workspace installer, hosted control plane

**Update Policy**:
The operator's choice to receive an update notification or let Discoflare Admin apply a compatible release automatically.
_Avoid_: Management mode, manual installation, managed installation
