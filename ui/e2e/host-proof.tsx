import { ExtensionHost } from "@ryu/app-host/ExtensionHost";
import { capabilitiesFromGrants, type HostServices } from "@ryu/app-host/rpc";
import { htmlCompanionSrcdoc } from "@ryu/app-host/third-party-plugin";
import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import manifest from "../../manifest.json" with { type: "json" };
import appHtml from "../dist/index.html?raw";
import type { WebhooksHostCall, WebhooksHostFixture } from "./fixture-types.ts";
import styles from "./host-proof.module.css";

const STORAGE_KEY = "ryu-webhooks-extension-host-fixture";
const INITIAL_SECRET = "initial-workflow-signing-secret";

function readPersistedSecret(): string {
	try {
		return sessionStorage.getItem(STORAGE_KEY) ?? INITIAL_SECRET;
	} catch {
		return INITIAL_SECRET;
	}
}

const fixture: WebhooksHostFixture = {
	calls: [],
	failNextSecretSave: false,
	registryUnavailable:
		new URLSearchParams(location.search).get("registry") === "offline",
	generatedCount: 0,
	holdNextSecretSave: false,
	orderLabel: "Order webhook",
	releaseSecretSave: () => {},
	secret: readPersistedSecret(),
};

let releaseHeldSecretSave: (() => void) | undefined;
fixture.releaseSecretSave = () => {
	releaseHeldSecretSave?.();
	releaseHeldSecretSave = undefined;
};

function record(method: string, input: WebhooksHostCall["input"]): void {
	fixture.calls.push({ input: structuredClone(input), method });
}

const services: HostServices = {
	listAgents: async () => {
		throw new Error("Unexpected core.listAgents in Webhooks proof");
	},
	registerRoute: async () => {
		throw new Error("Unexpected ui.registerRoute in Webhooks proof");
	},
	webhooksIngressStatus: async () => {
		record("webhooks.ingressStatus", {});
		return {
			kind: "cloudflared",
			publicUrl: "https://node.example.test",
			up: true,
		};
	},
	webhooksList: async () => {
		record("webhooks.list", {});
		if (fixture.registryUnavailable) {
			throw new Error("fixture registry temporarily unavailable");
		}
		return {
			endpoints: [
				{
					hasSecret: true,
					id: "workflow-orders",
					kind: "workflow",
					label: fixture.orderLabel,
					lastDelivery: 1_790_000_000,
					path: "/api/webhooks/workflow-orders",
					publicUrl: null,
					subscriptionCount: null,
					workflowId: "workflow-orders",
					workflowName: fixture.orderLabel,
				},
				{
					hasSecret: true,
					id: "composio",
					kind: "composio",
					label: "Composio triggers",
					lastDelivery: null,
					path: "/api/composio/webhook",
					publicUrl: "https://node.example.test/api/composio/webhook",
					subscriptionCount: 2,
					workflowId: null,
					workflowName: null,
				},
			],
			ingressKind: "cloudflared",
			publicBaseUrl: "https://node.example.test",
			up: true,
		};
	},
	webhooksSecretGet: async ({ id }) => {
		record("webhooks.secretGet", { id });
		if (id !== "workflow-orders") {
			throw new Error(`unknown workflow secret: ${id}`);
		}
		return { secret: fixture.secret };
	},
	webhooksSecretSet: async ({ id, secret }) => {
		record(
			"webhooks.secretSet",
			secret === undefined ? { id } : { id, secret }
		);
		if (id !== "workflow-orders") {
			throw new Error(`unknown workflow secret: ${id}`);
		}
		if (fixture.holdNextSecretSave) {
			fixture.holdNextSecretSave = false;
			await new Promise<void>((resolve) => {
				releaseHeldSecretSave = resolve;
			});
		}
		if (fixture.failNextSecretSave) {
			fixture.failNextSecretSave = false;
			throw new Error("fixture secret store temporarily unavailable");
		}
		if (secret !== undefined && (secret.length < 16 || secret.length > 512)) {
			throw new Error("webhook secret must contain 16 to 512 characters");
		}
		fixture.generatedCount += secret === undefined ? 1 : 0;
		fixture.secret =
			secret ?? `generated-workflow-secret-${fixture.generatedCount}-safe`;
		try {
			sessionStorage.setItem(STORAGE_KEY, fixture.secret);
		} catch {
			// The host fixture can still return the value when browser storage is disabled.
		}
		return { secret: fixture.secret };
	},
};

Object.assign(window, { __webhooksHostFixture: fixture });

function WebhooksHostProof() {
	const nonce = useMemo(() => crypto.randomUUID(), []);
	const srcdoc = useMemo(
		() => htmlCompanionSrcdoc(nonce, appHtml, manifest.id),
		[nonce]
	);
	const grants = new URLSearchParams(location.search).has("deny")
		? []
		: manifest.permission_grants;
	const granted = useMemo(() => capabilitiesFromGrants(grants), [grants]);

	return (
		<main className={styles.proof}>
			<ExtensionHost
				granted={granted}
				nonce={nonce}
				services={services}
				srcdoc={srcdoc}
				title="Webhooks companion"
			/>
		</main>
	);
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<WebhooksHostProof />);
}
