// The client layer the ported page calls. It mirrors the desktop
// `lib/api/webhooks.ts` surface — SAME function names, SAME (target-first)
// signatures, SAME return types — but every call goes over the `window.ryu`
// bridge instead of a direct `fetch`. The `target` argument is IGNORED (the host
// holds the node token; the sandboxed frame never sees it), kept only so the
// copied component call-sites need no edits. Return shapes match the desktop
// client verbatim because the host closures reuse those very clients.

import type { RyuBridge } from "./ryu.d.ts";
import type { WebhookIngressStatus, WebhookRegistry } from "./types";

/** A node target the shell passes around. In the sandbox it is inert (the host
 *  owns the token); kept so the ported call-sites type-check unchanged. */
export interface ApiTarget {
	token: string | null;
	url: string;
}

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The webhooks capability is not available for this app (grant webhooks:crud)."
		);
	}
	return b;
}

/** GET /api/webhooks — the unified webhook endpoint registry. */
export function fetchWebhooks(_t?: ApiTarget): Promise<WebhookRegistry> {
	return ryu().webhooks.list() as Promise<WebhookRegistry>;
}

/** GET /api/webhook-ingress/status — the resolved public ingress URL + backend. */
export function fetchWebhookIngressStatus(
	_t?: ApiTarget
): Promise<WebhookIngressStatus> {
	return ryu().webhooks.ingressStatus() as Promise<WebhookIngressStatus>;
}
