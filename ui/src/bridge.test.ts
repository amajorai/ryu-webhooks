import { afterEach, describe, expect, it } from "bun:test";
import { fetchWebhookIngressStatus, fetchWebhooks } from "./bridge.ts";
import type { RyuBridge } from "./ryu.d.ts";
import type { WebhookIngressStatus, WebhookRegistry } from "./types";

// `bridge.ts` reads the host-installed `window.ryu` surface. These tests drive
// the guard/delegation logic by installing (and clearing) a fake bridge on the
// global `window` — the same object the module dereferences at call time.

interface Calls {
	ingressStatus: number;
	list: number;
}

/** Install a fake `window.ryu` whose methods resolve to the given payloads and
 *  count their invocations. Returns the call counter for assertions. */
function installBridge(payloads: {
	list?: unknown;
	ingressStatus?: unknown;
}): Calls {
	const calls: Calls = { list: 0, ingressStatus: 0 };
	const bridge: RyuBridge = {
		context: null,
		webhooks: {
			list: (...args: unknown[]) => {
				calls.list += 1;
				// The bridge must call with NO arguments — the target is dropped.
				expect(args).toHaveLength(0);
				return Promise.resolve(payloads.list);
			},
			ingressStatus: (...args: unknown[]) => {
				calls.ingressStatus += 1;
				expect(args).toHaveLength(0);
				return Promise.resolve(payloads.ingressStatus);
			},
		},
	};
	(globalThis as { window?: { ryu?: RyuBridge } }).window = { ryu: bridge };
	return calls;
}

afterEach(() => {
	// Reset the global between tests so the "missing bridge" cases are honest.
	(globalThis as { window?: unknown }).window = undefined;
});

const REGISTRY: WebhookRegistry = {
	endpoints: [
		{
			hasSecret: true,
			id: "composio",
			kind: "composio",
			label: "Composio triggers",
			lastDelivery: 1_700_000_000,
			path: "/api/composio/webhook",
			publicUrl: "https://relay.example/api/composio/webhook",
			subscriptionCount: 3,
			workflowId: null,
			workflowName: null,
		},
	],
	ingressKind: "ryu-relay",
	publicBaseUrl: null,
	up: true,
};

const INGRESS: WebhookIngressStatus = {
	kind: "cloudflared",
	publicUrl: "https://node.example",
	up: true,
};

describe("fetchWebhooks", () => {
	it("delegates to window.ryu.webhooks.list and forwards its result verbatim", async () => {
		const calls = installBridge({ list: REGISTRY });
		const result = await fetchWebhooks();
		// Same object identity the bridge returned — no re-shaping in bridge.ts.
		expect(result).toBe(REGISTRY);
		expect(calls.list).toBe(1);
		expect(calls.ingressStatus).toBe(0);
	});

	it("ignores the ApiTarget argument (the host owns the token)", async () => {
		const calls = installBridge({ list: REGISTRY });
		// A non-null target must NOT be forwarded to the bridge method — the
		// installBridge fake asserts zero args, so this passing proves it is dropped.
		await fetchWebhooks({ url: "https://ignored.example", token: "secret" });
		expect(calls.list).toBe(1);
	});

	it("throws a grant-webhooks:crud error when no bridge is installed", () => {
		// window exists but has no `ryu` — the host port never arrived. The guard
		// throws SYNCHRONOUSLY (before any promise), so assert on the call itself.
		(globalThis as { window?: { ryu?: RyuBridge } }).window = {};
		expect(() => fetchWebhooks()).toThrow(/grant webhooks:crud/);
	});

	it("throws when window itself is undefined (server-side / pre-bootstrap)", () => {
		(globalThis as { window?: unknown }).window = undefined;
		expect(() => fetchWebhooks()).toThrow(
			"The webhooks capability is not available for this app (grant webhooks:crud)."
		);
	});
});

describe("fetchWebhookIngressStatus", () => {
	it("delegates to window.ryu.webhooks.ingressStatus and forwards the result", async () => {
		const calls = installBridge({ ingressStatus: INGRESS });
		const result = await fetchWebhookIngressStatus();
		expect(result).toBe(INGRESS);
		expect(calls.ingressStatus).toBe(1);
		expect(calls.list).toBe(0);
	});

	it("ignores the ApiTarget argument", async () => {
		const calls = installBridge({ ingressStatus: INGRESS });
		await fetchWebhookIngressStatus({ url: "https://x.example", token: null });
		expect(calls.ingressStatus).toBe(1);
	});

	it("throws the capability error when the bridge is absent", () => {
		(globalThis as { window?: { ryu?: RyuBridge } }).window = {};
		expect(() => fetchWebhookIngressStatus()).toThrow(/grant webhooks:crud/);
	});
});
