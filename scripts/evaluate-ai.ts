import "server-only";

import { readFile } from "node:fs/promises";

import { z } from "zod";

import { validateProposalEvidence } from "@/features/assistant/validate-proposal";
import {
  AiProviderError,
  type ActionProposalInput,
  type ActionProposalProvider,
} from "@/server/ai/action-proposal-provider";
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
      context: z
        .array(
          z.object({
            ref: z.string(),
            companyName: z.string(),
            roleTitle: z.string(),
            stage: z.string(),
            location: z.string().nullable(),
            sourceUrl: z.string().nullable(),
            updatedAt: z.string(),
          }).strict(),
        )
        .optional(),
      expected: z
        .object({
          decisionKind: z.enum([
            "proposal",
            "needs_clarification",
            "unsupported",
          ]),
          companyName: z.string().optional(),
          roleTitle: z.string().optional(),
          stage: z.enum(["planned", "applied", "assessment", "interview", "offer", "accepted", "rejected", "withdrawn"]).optional(),
          jobDriveRef: z.string().optional(),
          isCorrection: z.boolean().optional(),
          appliedAtMustBeNull: z.boolean().optional(),
          hasAssessment: z.boolean().optional(),
          hasInterview: z.boolean().optional(),
        })
        .strict(),
    })
    .strict(),
);

async function main() {
  const fixtureUrl = new URL(
    "../evals/job-drive-progress.json",
    import.meta.url,
  );
  const allFixtures = fixtureSchema.parse(
    JSON.parse(await readFile(fixtureUrl, "utf8")),
  );
  const selectedCase = process.argv[2];
  const fixtures = selectedCase
    ? allFixtures.filter((fixture) => fixture.id === selectedCase)
    : allFixtures;
  if (fixtures.length === 0) throw new Error(`Unknown evaluation case: ${selectedCase}`);
  const provider = getActionProposalProvider({ allowHosted: true });
  let passed = 0;

  for (const fixture of fixtures) {
    const result = await proposeWithRetry(provider, {
      message: fixture.message,
      now: "2026-09-15T12:00:00.000Z",
      timeZone: "Asia/Kolkata",
      locale: "en-IN",
      context: { jobDrives: fixture.context ?? [] },
    });
    const failures: string[] = [];

    if (result.decision.kind !== fixture.expected.decisionKind) {
      failures.push(
        `expected ${fixture.expected.decisionKind}, received ${result.decision.kind}`,
      );
    }

    if (result.decision.kind === "proposal") {
      const proposal = result.decision.proposal;

      if (proposal?.kind !== "record_job_drive_progress") {
        failures.push("expected one record_job_drive_progress proposal");
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
          fixture.expected.stage &&
          proposal.payload.stage !== fixture.expected.stage
        ) {
          failures.push("stage mismatch");
        }

        if (fixture.expected.jobDriveRef && proposal.payload.jobDriveRef !== fixture.expected.jobDriveRef) failures.push("jobDriveRef mismatch");
        if (fixture.expected.isCorrection !== undefined && proposal.payload.isCorrection !== fixture.expected.isCorrection) failures.push("isCorrection mismatch");
        if (fixture.expected.appliedAtMustBeNull && proposal.payload.appliedAt !== null) failures.push("appliedAt was invented");
        if (fixture.expected.hasAssessment !== undefined && Boolean(proposal.payload.assessment) !== fixture.expected.hasAssessment) failures.push("assessment detail mismatch");
        if (fixture.expected.hasInterview !== undefined && Boolean(proposal.payload.interview) !== fixture.expected.hasInterview) failures.push("interview detail mismatch");

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

async function proposeWithRetry(
  provider: ActionProposalProvider,
  input: ActionProposalInput,
) {
  try {
    return await provider.propose(input);
  } catch (error) {
    if (error instanceof AiProviderError && error.retryable) {
      return provider.propose(input);
    }
    throw error;
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown evaluation error";
  process.stderr.write(`AI evaluation failed: ${message}\n`);
  process.exitCode = 1;
});
