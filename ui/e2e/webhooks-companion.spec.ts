import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	expect,
	test,
} from "../../../../apps/desktop/node_modules/@playwright/test/index.mjs";
import "./fixture-types.ts";

// The package reuses the desktop-pinned runner; the companion inventory recognizes
// browser specs that import from "@playwright/test".

const evidenceDirectory = path.resolve(import.meta.dirname, "evidence");
const baseURL = "http://127.0.0.1:4518";

function appFrame(page: import("@playwright/test").Page) {
	return page.frameLocator('iframe[title="Webhooks companion"]');
}

async function calls(page: import("@playwright/test").Page) {
	return page.evaluate(() => window.__webhooksHostFixture?.calls ?? []);
}

async function saveProductScreenshot(
	page: import("@playwright/test").Page,
	name: string
) {
	await mkdir(evidenceDirectory, { recursive: true });
	await appFrame(page)
		.locator("body")
		.screenshot({
			animations: "disabled",
			path: path.join(evidenceDirectory, name),
		});
}

test.beforeEach(async ({ context }) => {
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: baseURL,
	});
});

test("the registry exposes resolved public URLs and copies the exact endpoint or ingress URL", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	await expect(app.getByRole("heading", { name: "Webhooks" })).toBeVisible();
	await expect(app.getByText("Ingress ready")).toBeVisible();
	await expect(app.getByText("Order webhook", { exact: true })).toBeVisible();
	await expect(
		app.getByText("Composio triggers", { exact: true })
	).toBeVisible();
	await expect(
		app.getByText("No reachable URL yet", { exact: false })
	).toBeVisible();
	await expect(
		app.getByRole("button", { name: "Copy public URL" })
	).toHaveCount(2);
	await expect(
		app.getByRole("button", { name: "Copy public URL" }).nth(0)
	).toBeEnabled();
	await expect(
		app.getByRole("button", { name: "Copy public URL" }).nth(1)
	).toBeEnabled();
	await expect(app.getByText("2 subscriptions", { exact: true })).toBeVisible();
	await saveProductScreenshot(page, "webhooks-registry-and-public-urls.png");

	const copyButtons = app.getByRole("button", { name: "Copy public URL" });
	await copyButtons.nth(0).click();
	await expect(
		app.getByRole("status").getByText("Public URL copied")
	).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe("https://node.example.test");

	await copyButtons.nth(1).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe("https://node.example.test/api/composio/webhook");

	const recordedCalls = await calls(page);
	expect(recordedCalls).toContainEqual({ method: "webhooks.list", input: {} });
	expect(recordedCalls).toContainEqual({
		method: "webhooks.ingressStatus",
		input: {},
	});
});

test("refresh and retry recover the registry and render the newly returned state", async ({
	page,
}) => {
	await page.goto("/?registry=offline");
	const app = appFrame(page);
	await expect(app.getByText("Ingress ready")).toBeVisible();
	await expect(app.getByText("Couldn't load webhooks")).toBeVisible();
	await expect(app.getByText("Order webhook", { exact: true })).toHaveCount(0);

	await page.evaluate(() => {
		if (window.__webhooksHostFixture) {
			window.__webhooksHostFixture.registryUnavailable = false;
		}
	});
	await app.getByRole("button", { name: "Retry" }).click();
	await expect(app.getByText("Order webhook", { exact: true })).toBeVisible();
	await expect(app.getByText("Couldn't load webhooks")).toHaveCount(0);

	const beforeRefresh = await calls(page);
	await page.evaluate(() => {
		if (window.__webhooksHostFixture) {
			window.__webhooksHostFixture.orderLabel = "Order webhook refreshed";
		}
	});
	const refresh = app.getByRole("button", { name: "Refresh" });
	await expect(refresh).toBeEnabled();
	await refresh.click();
	await expect(
		app.getByText("Order webhook refreshed", { exact: true })
	).toBeVisible();
	const afterRefresh = await calls(page);
	expect(
		afterRefresh.filter((call) => call.method === "webhooks.list").length -
			beforeRefresh.filter((call) => call.method === "webhooks.list").length
	).toBe(1);
	expect(
		afterRefresh.filter((call) => call.method === "webhooks.ingressStatus")
			.length -
			beforeRefresh.filter((call) => call.method === "webhooks.ingressStatus")
				.length
	).toBe(1);
	await saveProductScreenshot(page, "webhooks-retried-registry-refresh.png");
});

test("a missing webhooks grant remains refused across an explicit retry", async ({
	page,
}) => {
	await page.goto("/?deny");
	const app = appFrame(page);
	await expect(app.getByText("Couldn't load webhooks")).toBeVisible();
	await expect(app.getByText("Order webhook", { exact: true })).toHaveCount(0);
	await app.getByRole("button", { name: "Retry" }).click();
	await expect(app.getByText("Couldn't load webhooks")).toBeVisible();
	await expect(app.getByText("Order webhook", { exact: true })).toHaveCount(0);
	expect(await calls(page)).toEqual([]);
});

test("secret editing validates through Core, saves, rotates, copies, and reads back after reload", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	const signingSecret = app.getByRole("textbox", {
		name: "Signing secret for Order webhook",
	});
	await expect(signingSecret).toHaveValue("initial-workflow-signing-secret");
	await expect(
		app.getByRole("button", { name: "Copy signing secret" })
	).toBeEnabled();

	const initialCalls = await calls(page);
	expect(initialCalls).toContainEqual({
		method: "webhooks.secretGet",
		input: { id: "workflow-orders" },
	});

	await signingSecret.fill("too-short");
	const save = app.getByRole("button", { name: "Save", exact: true });
	await expect(save).toBeEnabled();
	await save.click();
	const saveError = app
		.getByRole("alert")
		.filter({ hasText: "Couldn't save webhook secret" })
		.first();
	await expect(saveError).toBeVisible();
	await expect(signingSecret).toHaveValue("too-short");
	let recordedCalls = await calls(page);
	expect(recordedCalls).toContainEqual({
		method: "webhooks.secretSet",
		input: { id: "workflow-orders", secret: "too-short" },
	});
	await expect
		.poll(() => page.evaluate(() => window.__webhooksHostFixture?.secret))
		.toBe("initial-workflow-signing-secret");

	const tooLongSecret = "x".repeat(513);
	await signingSecret.fill(tooLongSecret);
	await save.click();
	await expect(saveError).toBeVisible();
	recordedCalls = await calls(page);
	expect(recordedCalls).toContainEqual({
		method: "webhooks.secretSet",
		input: { id: "workflow-orders", secret: tooLongSecret },
	});
	await expect
		.poll(() => page.evaluate(() => window.__webhooksHostFixture?.secret))
		.toBe("initial-workflow-signing-secret");

	const customSecret = "custom-order-signing-secret-2026";
	await signingSecret.fill(`  ${customSecret}  `);
	await save.click();
	await expect(
		app.getByRole("status").getByText("Webhook secret saved")
	).toBeVisible();
	await expect(signingSecret).toHaveValue(customSecret);
	await expect
		.poll(() => page.evaluate(() => window.__webhooksHostFixture?.secret))
		.toBe(customSecret);

	const generate = app.getByRole("button", { name: "Generate new" });
	await generate.click();
	await expect(
		app.getByRole("status").getByText("New webhook secret generated")
	).toBeVisible();
	const generatedSecret = await page.evaluate(
		() => window.__webhooksHostFixture?.secret
	);
	expect(generatedSecret).toMatch(/^generated-workflow-secret-1-safe$/);
	await expect(signingSecret).toHaveValue(generatedSecret ?? "");

	recordedCalls = await calls(page);
	expect(recordedCalls).toContainEqual({
		method: "webhooks.secretSet",
		input: { id: "workflow-orders", secret: customSecret },
	});
	expect(recordedCalls).toContainEqual({
		method: "webhooks.secretSet",
		input: { id: "workflow-orders" },
	});

	await app.getByRole("button", { name: "Copy signing secret" }).click();
	await expect
		.poll(() => page.evaluate(() => navigator.clipboard.readText()))
		.toBe(generatedSecret);

	await page.reload();
	const reloadedApp = appFrame(page);
	const reloadedSecret = reloadedApp.getByRole("textbox", {
		name: "Signing secret for Order webhook",
	});
	await expect(reloadedSecret).toHaveValue(generatedSecret ?? "");
	await saveProductScreenshot(page, "webhooks-secret-rotated-and-restored.png");
});

test("a refused secret save retains the exact value for one retry and serializes an in-flight mutation", async ({
	page,
}) => {
	await page.goto("/");
	const app = appFrame(page);
	const signingSecret = app.getByRole("textbox", {
		name: "Signing secret for Order webhook",
	});
	const save = app.getByRole("button", { name: "Save", exact: true });
	const generate = app.getByRole("button", { name: "Generate new" });
	const retrySecret = "exact-retry-signing-secret-2026";
	await signingSecret.fill(retrySecret);
	await page.evaluate(() => {
		if (window.__webhooksHostFixture) {
			window.__webhooksHostFixture.failNextSecretSave = true;
		}
	});
	await save.click();
	await expect(
		app
			.getByRole("alert")
			.filter({ hasText: "Couldn't save webhook secret" })
			.first()
	).toBeVisible();
	await expect(signingSecret).toHaveValue(retrySecret);
	await save.click();
	await expect(
		app.getByRole("status").getByText("Webhook secret saved")
	).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => window.__webhooksHostFixture?.secret))
		.toBe(retrySecret);

	const retryCalls = (await calls(page)).filter(
		(call) => call.method === "webhooks.secretSet"
	);
	expect(retryCalls).toEqual([
		{
			method: "webhooks.secretSet",
			input: { id: "workflow-orders", secret: retrySecret },
		},
		{
			method: "webhooks.secretSet",
			input: { id: "workflow-orders", secret: retrySecret },
		},
	]);

	await page.evaluate(() => {
		if (window.__webhooksHostFixture) {
			window.__webhooksHostFixture.holdNextSecretSave = true;
		}
	});
	await generate.click();
	await expect(generate).toBeDisabled();
	await expect(save).toBeDisabled();
	await expect(signingSecret).toBeDisabled();
	const callsWhileHeld = (await calls(page)).filter(
		(call) => call.method === "webhooks.secretSet"
	);
	expect(callsWhileHeld).toHaveLength(3);
	await page.evaluate(() => window.__webhooksHostFixture?.releaseSecretSave());
	await expect(
		app.getByRole("status").getByText("New webhook secret generated")
	).toBeVisible();
	await expect(generate).toBeEnabled();
	expect(
		(await calls(page)).filter((call) => call.method === "webhooks.secretSet")
	).toHaveLength(3);
});
