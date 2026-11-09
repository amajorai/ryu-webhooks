import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

const mapUrl = new URL("./companion-interactions.json", import.meta.url);
const specUrl = new URL("./webhooks-companion.spec.ts", import.meta.url);

describe("Webhooks companion interaction map", () => {
	it("maps every inventoried Webhooks control to a named rendered assertion", async () => {
		const [mapSource, specSource] = await Promise.all([
			readFile(mapUrl, "utf8"),
			readFile(specUrl, "utf8"),
		]);
		const map = JSON.parse(mapSource);

		expect(map.package).toBe("webhooks");
		expect(map.scope).toBe("complete");
		expect(map.expectedRows).toBe(9);
		expect(map.assertions).toHaveLength(9);
		expect(
			new Set(map.assertions.map(({ row }) => `${row.component}:${row.line}`))
				.size
		).toBe(9);
		for (const assertion of map.assertions) {
			expect(specSource).toContain(assertion.testTitle);
			expect(specSource).toContain(assertion.assertionMarker);
		}
	});
});
