import { describe, expect, it } from "vitest";
import { resolveUniqueServerName } from "../src/lib/server-name.js";

describe("resolveUniqueServerName", () => {
  it("returns original name when unused", () => {
    const resolved = resolveUniqueServerName("My Server", ["Another Server"]);
    expect(resolved).toBe("My Server");
  });

  it("appends a numeric suffix when name already exists", () => {
    const resolved = resolveUniqueServerName("My Server", ["My Server", "My Server-2"]);
    expect(resolved).toBe("My Server-3");
  });

  it("truncates long base names before adding suffix", () => {
    const longName = "A".repeat(40);
    const resolved = resolveUniqueServerName(longName, [longName]);
    expect(resolved).toBe(`${"A".repeat(38)}-2`);
    expect(resolved.length).toBeLessThanOrEqual(40);
  });
});
