import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	defineConfig,
	devices,
} from "../../../../apps/desktop/node_modules/@playwright/test/index.mjs";

const e2eDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(e2eDirectory, "..");
const baseURL = "http://127.0.0.1:4518";

export default defineConfig({
	testDir: e2eDirectory,
	testMatch: "webhooks-companion.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	outputDir: "/private/tmp/ryu-webhooks-playwright-results",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		viewport: { width: 1440, height: 1100 },
	},
	webServer: {
		command:
			"bun run build && bun run vite --config e2e/vite.config.ts --host 127.0.0.1 --port 4518 --strictPort",
		cwd: appRoot,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
