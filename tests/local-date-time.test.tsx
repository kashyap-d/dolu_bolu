import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderToString } from "react-dom/server";

import { LocalDate, LocalDateTime } from "../src/components/ui/local-date-time";

// The server cannot know the viewer's locale or time zone, so anything it
// renders for a date must be locale-independent; otherwise hydration fails
// whenever the two differ (e.g. an en-IN browser and an en-US server).
/** Visible text only: the machine-readable dateTime attribute may contain anything. */
const text = (html: string) => html.replace(/<[^>]*>/g, "");

describe("date rendering on the server", () => {
  it("renders a calendar date as its ISO form, not in the server's locale", () => {
    assert.equal(text(renderToString(<LocalDate value="2026-09-17" />)), "2026-09-17");
  });

  it("renders a timestamp as a placeholder", () => {
    assert.equal(text(renderToString(<LocalDateTime value="2026-09-17T05:30:00Z" />)), "…");
  });
});
