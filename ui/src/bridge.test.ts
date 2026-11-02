import { afterEach, describe, expect, it } from "bun:test";
import type { WebhookSecretPayload } from "./bridge.ts";
import {
	fetchWebhookIngressStatus,
	fetchWebhookSecret,
	fetchWebhooks,
	setWebhookSecret,
} from "./bridge.ts";
import type { RyuBridge } from "./ryu.d.ts";
import type { WebhookIngressStatus, WebhookRegistry } from "./types.ts";

// `bridge.ts` reads the host-installed `window.ryu` surface. These tests drive
// the guard/delegation logic by installing (and clearing) a fake bridge on the
// global `window` — the same object the module dereferences at call time.

interface Calls {
	getSecret: number;
	getSecretArgs: [string] | null;
	ingressStatus: number;
	ingressStatusArgs: [] | null;
	list: number;
	listArgs: [] | null;
	setSecret: number;
	setSecretArgs: [{ id: string; secret?: string }] | null;
}

/** Install a fake `window.ryu` whose methods resolve to the given payloads and
 *  count their invocations. Returns the call counter for assertions. */
function installBridge(payloads: {
	getSecret?: WebhookSecretPayload;
	list?: WebhookRegistry;
	ingressStatus?: WebhookIngressStatus;
	setSecret?: WebhookSecretPayload;
}): Calls {
	const calls: Calls = {
		getSecret: 0,
		getSecretArgs: null,
		ingressStatus: 0,
		ingressStatusArgs: null,
		list: 0,
		listArgs: null,
		setSecret: 0,
		setSecretArgs: null,
	};
	const bridge: RyuBridge = {
		context: null,
		webhooks: {
			list: (...args: []) => {
				calls.list += 1;
				calls.listArgs = args;
				return Promise.resolve(payloads.list ?? REGISTRY);
			},
			ingressStatus: (...args: []) => {
				calls.ingressStatus += 1;
				calls.ingressStatusArgs = args;
				return Promise.resolve(payloads.ingressStatus ?? INGRESS);
			},
			getSecret: (...args: [string]) => {
				calls.getSecret += 1;
				calls.getSecretArgs = args;
				return Promise.resolve(payloads.getSecret);
			},
			setSecret: (...args: [{ id: string; secret?: string }]) => {
				calls.setSecret += 1;
				calls.setSecretArgs = args;
				return Promise.resolve(payloads.setSecret);
			},
		},
	};
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: { ryu: bridge },
		writable: true,
	});
	return calls;
}

afterEach(() => {
	// Reset the global between tests so the "missing bridge" cases are honest.
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: undefined,
		writable: true,
	});
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
		expect(calls.getSecret).toBe(0);
		expect(calls.setSecret).toBe(0);
		expect(calls.listArgs).toEqual([]);
	});

	it("ignores the ApiTarget argument (the host owns the token)", async () => {
		const calls = installBridge({ list: REGISTRY });
		// A non-null target must NOT be forwarded to the bridge method — the
		// recorded arguments prove it is dropped.
		await fetchWebhooks({ url: "https://ignored.example", token: "secret" });
		expect(calls.list).toBe(1);
		expect(calls.listArgs).toEqual([]);
	});

	it("throws a grant-webhooks:crud error when no bridge is installed", () => {
		// window exists but has no `ryu` — the host port never arrived. The guard
		// throws SYNCHRONOUSLY (before any promise), so assert on the call itself.
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {},
			writable: true,
		});
		expect(() => fetchWebhooks()).toThrow(/grant webhooks:crud/);
	});

	it("throws when window itself is undefined (server-side / pre-bootstrap)", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: undefined,
			writable: true,
		});
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
		expect(calls.getSecret).toBe(0);
		expect(calls.setSecret).toBe(0);
		expect(calls.ingressStatusArgs).toEqual([]);
	});

	it("ignores the ApiTarget argument", async () => {
		const calls = installBridge({ ingressStatus: INGRESS });
		await fetchWebhookIngressStatus({ url: "https://x.example", token: null });
		expect(calls.ingressStatus).toBe(1);
	});

	it("throws the capability error when the bridge is absent", () => {
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: {},
			writable: true,
		});
		expect(() => fetchWebhookIngressStatus()).toThrow(/grant webhooks:crud/);
	});
});

describe("webhook secret bridge", () => {
	it("delegates an explicit secret read", async () => {
		const calls = installBridge({ getSecret: { secret: "server-secret" } });
		expect(await fetchWebhookSecret("composio")).toBe("server-secret");
		expect(calls.getSecret).toBe(1);
		expect(calls.getSecretArgs).toEqual(["composio"]);
	});

	it("delegates an explicit secret write", async () => {
		const calls = installBridge({ setSecret: { secret: "saved-secret" } });
		expect(await setWebhookSecret("composio", "custom secret")).toBe(
			"saved-secret"
		);
		expect(calls.setSecret).toBe(1);
		expect(calls.setSecretArgs).toEqual([
			{ id: "composio", secret: "custom secret" },
		]);
	});
});

it("preserves nullable secret reads and rejects malformed secret writes", async () => {
	const replies: WebhookSecretPayload[] = [
		null,
		{},
		{ secret: 42 },
		{ secret: null },
	];
	for (const reply of replies) {
		installBridge({ getSecret: reply, setSecret: reply });
		expect(await fetchWebhookSecret("workflow-orders")).toBeNull();
		await expect(setWebhookSecret("workflow-orders")).rejects.toThrow(
			"webhook secret response was empty"
		);
	}
	installBridge({ getSecret: { secret: "" }, setSecret: { secret: "" } });
	expect(await fetchWebhookSecret("workflow-orders")).toBe("");
	await expect(setWebhookSecret("workflow-orders")).rejects.toThrow(
		"webhook secret response was empty"
	);
});
