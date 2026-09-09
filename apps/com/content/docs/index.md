---
title: Documentation
description: Learn the Discoflare apps and Agents, deploy a workspace, and operate it with observable checks.
navigation:
  icon: i-ph-book-open-text
---

Discoflare is a self-hosted workspace for people and Agents. Chat, Tasks, Mail, and Databases share one workspace, one permission model, and data stored in the workspace owner's Cloudflare account.

## Start here

- [Understand the workspace](/docs/product-guide) explains how apps, members, permissions, and shared data fit together.
- [Explore the apps](/docs/product-guide/apps) covers the released Chat, Tasks, Mail, and Databases surfaces.
- [Create and use Agents](/docs/product-guide/agents) covers profiles, conversations, models, Sandboxes, and approval boundaries.
- [Run Agent tasks](/docs/product-guide/tasks) covers boards, assignment, durable runs, results, and recovery.
- [Choose a deployment](/docs/getting-started/deployment-options) compares the guided installer with the manual GitHub/Workers Builds path.
- [Deploy to Cloudflare](/docs/installation/cloudflare) covers the complete runtime, including Agents.
- [Environment variables](/docs/configuration/environment-variables) is the configuration reference.
- [Verify an installation](/docs/operations/verification) separates service health, setup state, persistence, and browser checks.

## Product guides

The product guides describe behavior visible to workspace members and operators. They start with the app switcher, then follow the two ways an Agent can participate: a conversation in Chat or an assigned run in Tasks.

## Configuration is explicit

Discoflare does not depend on configuration hidden in this website. Runtime configuration belongs to the installed workspace:

- Cloudflare bindings, Worker variables, and secrets describe the deployment.
- Settings saved by the workspace owner live with the workspace data.
- Deployment-managed credentials override the matching settings stored through the UI.

The marketing site only performs the Cloudflare OAuth installation flow and publishes these docs. Its private environment values configure that installer; they are not copied into a workspace unless the installation flow explicitly provisions a corresponding value.

::docs-verification{title="A documented setup is not considered complete until it can prove readiness"}
Every installation guide ends with observable checks. A successful build or deploy event is useful evidence, but it is not proof that the database migrated, the owner completed setup, persistent data survives a restart, or the browser can use the workspace.
::

## Source and release boundary

The [Discoflare repository](https://github.com/vnmtvlv/discoflare) owns the application, Cloudflare configuration, migrations, and maintainer documentation. This site documents released behavior for operators and users.

When the source documentation and this site disagree, check the version you installed and use the documentation shipped with that release. Tagged release notes describe what changed between versions.
