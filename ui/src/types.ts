// The webhook registry model — ported verbatim from the desktop client
// `apps/desktop/src/lib/api/webhooks.ts` (camelCase), which the host bridge reuses:
// its closures call `fetchWebhooks` / `fetchWebhookIngressStatus` (those clients
// normalize Core's snake_case wire into these shapes) and forward the result
// unchanged over the bridge, so the app reads exactly what the desktop page read.

/** Kind of receiver behind an endpoint. `composio` is the shared trigger webhook
 *  (N subscriptions, one URL); `workflow` is a per-workflow Webhook trigger. */
export type WebhookEndpointKind = "composio" | "workflow";

/** One inbound webhook endpoint from the registry. */
export interface WebhookEndpoint {
	/** Whether a signing secret is configured for this endpoint. */
	hasSecret: boolean;
	/** Stable id: `"composio"` or the workflow id. */
	id: string;
	kind: WebhookEndpointKind;
	/** Human label (e.g. "Composio triggers" or the workflow name). */
	label: string;
	/** Unix-seconds timestamp of the last accepted delivery, or `null`. */
	lastDelivery: number | null;
	/** The path Core listens on (e.g. `/api/composio/webhook`). */
	path: string;
	/** The RESOLVED, reachable public URL to paste into the external service, or
	 *  `null` when no reachable URL exists yet (ingress not up, or a workflow path
	 *  under the non-addressable RyuRelay). Never a localhost URL. */
	publicUrl: string | null;
	/** composio only: number of trigger subscriptions bound to this webhook. */
	subscriptionCount: number | null;
	/** workflow only: the owning workflow's id. */
	workflowId: string | null;
	/** workflow only: the owning workflow's name. */
	workflowName: string | null;
}

/** The full registry response. */
export interface WebhookRegistry {
	endpoints: WebhookEndpoint[];
	/** The active ingress backend kind (e.g. `ryu-relay`, `cloudflared`). */
	ingressKind: string;
	/** The origin base for path-addressable (tunnel) backends, else `null`
	 *  (RyuRelay), in which case per-workflow URLs are advertised as `null`. */
	publicBaseUrl: string | null;
	/** True once any public URL has been resolved (ingress can receive webhooks). */
	up: boolean;
}

/** The ingress backend status (header banner source). */
export interface WebhookIngressStatus {
	/** The configured backend kind (e.g. `ryu-relay`, `tailscale-funnel`). */
	kind: string;
	/** The overall resolved public ingress URL, or `null` when not up. */
	publicUrl: string | null;
	/** True once a public URL has been resolved. */
	up: boolean;
}
