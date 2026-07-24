// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app needs only the `webhooks` surface (grant
// `webhooks:crud`); Core owns the `/api/webhooks` + `/api/webhook-ingress/status`
// reads behind it.
//
// Method return shapes mirror the desktop client the host reuses verbatim (the
// host closures call `fetchWebhooks`/`fetchWebhookIngressStatus` and forward the
// camelCase-normalized result), so `bridge.ts` re-declares the concrete types and
// casts these `unknown`s.

export interface RyuWebhooks {
	/** GET /api/webhook-ingress/status — the resolved public ingress URL + backend. */
	ingressStatus(): Promise<unknown>;
	/** GET /api/webhooks — the unified webhook endpoint registry. */
	list(): Promise<unknown>;
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
