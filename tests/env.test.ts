import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { isSupabaseConfigured } from "../src/server/env";

const original = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("Supabase environment detection", () => {
  afterEach(() => {
    restore("NEXT_PUBLIC_SUPABASE_URL", original.url);
    restore("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", original.key);
  });

  it("treats the empty values from .env.example as not configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    assert.equal(isSupabaseConfigured(), false);
  });

  it("accepts a project base URL with a key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    assert.equal(isSupabaseConfigured(), true);
  });
});
