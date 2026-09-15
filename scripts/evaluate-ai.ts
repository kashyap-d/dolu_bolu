import "server-only";

import { readFile } from "node:fs/promises";

import { z } from "zod";

import { validateProposalEvidence } from "@/features/assistant/validate-proposal";
import { getActionProposalProvider } from "@/server/ai/get-provider";

const processWithEnvLoader = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void;
};

try {
  processWithEnvLoader.loadEnvFile?.(".env.local");
} catch (error) {
  const missingFile =
    error instanceof Error && "code" in error && error.code === "ENOENT";

  if (!missingFile) throw error;
}

const fixtureSchema = z.array(
  z
    .object({
      id: z.string().min(1),
      message: z.string().min(1).max(2_000),
      expected: z
        .object({
          decisionKind: z.enum([
            "proposals",
            "needs_clarification",
            "unsupported",
          ]),
          companyName: z.string().optional(),
          roleTitle: z.string().optional(),
          status: z.enum(["saved", "applied"]).optional(),
        })
        .strict(),
    })
    .strict(),
);

async function main() {
  const fixtureUrl = new URL(
    "../evals/application-capture.json",
    import.meta.url,
  );
  const fixtures = fixtureSchema.parse(
    JSON.parse(await readFile(fixtureUrl, "utf8")),
  );
  const provider = getActionProposalProvider();
  let passed = 0;

  for (const fixture of fixtures) {
    const result = await provider.propose({
      message: fixture.message,
      now: "2026-09-15T12:00:00.000Z",
      timeZone: "Asia/Kolkata",
      locale: "en-IN",
      context: { applications: [] },
    });
    const failures: string[] = [];

    if (result.decision.kind !== fixture.expected.decisionKind) {
      failures.push(
        `expected ${fixture.expected.decisionKind}, received ${result.decision.kind}`,
      );
    }

    if (result.decision.kind === "proposals") {
      const proposal = result.decision.proposals[0];

      if (proposal?.kind !== "create_application") {
        failures.push("expected one create_application proposal");
      } else {
        if (
          fixture.expected.companyName &&
          proposal.payload.companyName !== fixture.expected.companyName
        ) {
          failures.push("companyName mismatch");
        }

        if (
          fixture.expected.roleTitle &&
          proposal.payload.roleTitle !== fixture.expected.roleTitle
        ) {
          failures.push("roleTitle mismatch");
        }

        if (
          fixture.expected.status &&
          proposal.payload.status !== fixture.expected.status
        ) {
          failures.push("status mismatch");
        }

        if (validateProposalEvidence(fixture.message, proposal).length > 0) {
          failures.push("evidence was not copied exactly from the source message");
        }
      }
    }

    if (failures.length === 0) {
      passed += 1;
      process.stdout.write(`PASS ${fixture.id}\n`);
    } else {
      process.stdout.write(`FAIL ${fixture.id}: ${failures.join("; ")}\n`);
    }
  }

  process.stdout.write(
    `\n${provider.name}/${provider.model}: ${passed}/${fixtures.length} cases passed\n`,
  );

  if (passed !== fixtures.length) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown evaluation error";
  process.stderr.write(`AI evaluation failed: ${message}\n`);
  process.exitCode = 1;
});
