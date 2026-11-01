// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app needs only the `webhooks` surface (grant
// `webhooks:crud`); Core owns the registry plus the explicit protected secret
// routes behind it.
//
// Method return shapes mirror the desktop client the host reuses verbatim (the
// host closures call `fetchWebhooks`/`fetchWebhookIngressStatus` and forward the
// camelCase-normalized result), so `bridge.ts` re-declares the concrete types and
// uses those concrete host-owned response contracts.

import type { WebhookSecretPayload } from "./bridge.ts";
import type { WebhookIngressStatus, WebhookRegistry } from "./types.ts";

export interface RyuWebhooks {
	/** GET /api/webhooks/:id/secret — explicit protected secret read. */
	getSecret(id: string): Promise<WebhookSecretPayload | undefined>;
	/** GET /api/webhook-ingress/status — the resolved public ingress URL + backend. */
	ingressStatus(): Promise<WebhookIngressStatus>;
	/** GET /api/webhooks — the unified webhook endpoint registry. */
	list(): Promise<WebhookRegistry>;
	/** POST /api/webhooks/:id/secret — set or server-generate one secret. */
	setSecret(input: {
		id: string;
		secret?: string;
	}): Promise<WebhookSecretPayload | undefined>;
}

export interface RyuBridge {
	context: { spaceId?: string; docId?: string } | null;
	webhooks: RyuWebhooks;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
