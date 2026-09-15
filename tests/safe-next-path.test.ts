import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { safeNextPath } from "../src/lib/safe-next-path";

describe("safeNextPath", () => {
  it("allows the protected app root", () => {
    assert.equal(safeNextPath("/app"), "/app");
  });

  it("allows descendants within the protected app", () => {
    assert.equal(
      safeNextPath("/app/applications?status=applied#recent"),
      "/app/applications?status=applied#recent",
    );
  });

  it("rejects absolute and protocol-relative external URLs", () => {
    assert.equal(safeNextPath("https://evil.example"), "/app");
    assert.equal(safeNextPath("//evil.example/app"), "/app");
  });

  it("rejects paths outside the app namespace", () => {
    assert.equal(safeNextPath("/login"), "/app");
    assert.equal(safeNextPath("/application"), "/app");
  });

  it("uses the provided fallback for missing or unsafe values", () => {
    assert.equal(safeNextPath(null, "/app/applications"), "/app/applications");
    assert.equal(
      safeNextPath("https://evil.example", "/app/applications"),
      "/app/applications",
    );
  });
});
