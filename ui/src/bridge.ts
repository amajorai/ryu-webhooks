// The client layer the ported page calls. It mirrors the desktop
// `lib/api/webhooks.ts` surface — SAME function names, SAME (target-first)
// signatures, SAME return types — but every call goes over the `window.ryu`
// bridge instead of a direct `fetch`. The `target` argument is IGNORED (the host
// holds the node token; the sandboxed frame never sees it), kept only so the
// copied component call-sites need no edits. Return shapes match the desktop
// client verbatim because the host closures reuse those very clients.

import { z } from "zod";
import type { RyuBridge } from "./ryu.d.ts";
import type { WebhookIngressStatus, WebhookRegistry } from "./types.ts";

/** A node target the shell passes around. In the sandbox it is inert (the host
 *  owns the token); kept so the ported call-sites type-check unchanged. */
export interface ApiTarget {
	token: string | null;
	url: string;
}

const webhookSecretPayloadSchema = z.json();
export type WebhookSecretPayload = z.infer<typeof webhookSecretPayloadSchema>;
const secretReplySchema = z
	.object({ secret: z.string().nullable().catch(null) })
	.catch({ secret: null });

function ryu(): RyuBridge {
	const b = globalThis.window?.ryu;
	if (!b) {
		throw new Error(
			"The webhooks capability is not available for this app (grant webhooks:crud)."
		);
	}
	return b;
}

/** GET /api/webhooks — the unified webhook endpoint registry. */
export function fetchWebhooks(_t?: ApiTarget): Promise<WebhookRegistry> {
	return ryu().webhooks.list();
}

/** GET /api/webhook-ingress/status — the resolved public ingress URL + backend. */
export function fetchWebhookIngressStatus(
	_t?: ApiTarget
): Promise<WebhookIngressStatus> {
	return ryu().webhooks.ingressStatus();
}

/** GET /api/webhooks/:id/secret — explicit protected secret read. */
export function fetchWebhookSecret(
	id: string,
	_t?: ApiTarget
): Promise<string | null> {
	return ryu()
		.webhooks.getSecret(id)
		.then((value) => {
			return secretReplySchema.parse(value).secret;
		});
}

/** POST /api/webhooks/:id/secret — set a supplied secret or server-generate one. */
export function setWebhookSecret(
	id: string,
	secret?: string,
	_t?: ApiTarget
): Promise<string> {
	return ryu()
		.webhooks.setSecret(secret === undefined ? { id } : { id, secret })
		.then((value) => {
			const nextSecret = secretReplySchema.parse(value).secret;
			if (nextSecret === null || nextSecret.length === 0) {
				throw new Error("webhook secret response was empty");
			}
			return nextSecret;
		});
}
