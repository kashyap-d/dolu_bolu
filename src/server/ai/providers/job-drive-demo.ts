import "server-only";

import type {
  ActionProposalInput,
  ActionProposalProvider,
  ActionProposalResult,
} from "../action-proposal-provider";

const destructiveInstruction =
  /\b(delete|submit|send|email|apply automatically)\b/i;

function clean(value: string) {
  return value.replace(/[.!?]+$/, "").trim();
}

function relativeDate(input: ActionProposalInput, value: string | null) {
  if (!value) return null;
  const date = new Date(input.now);
  if (value.toLowerCase() === "yesterday") date.setUTCDate(date.getUTCDate() - 1);
  if (value.toLowerCase() === "tomorrow") date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function matchingRef(input: ActionProposalInput, company: string, role: string) {
  const normalizedCompany = company.toLowerCase();
  const normalizedRole = role.toLowerCase();
  const matches = input.context.jobDrives.filter(
    (drive) =>
      drive.companyName.toLowerCase() === normalizedCompany &&
      drive.roleTitle.toLowerCase() === normalizedRole,
  );
  return matches.length === 1 ? matches[0].ref : null;
}

function emptyDetails() {
  return {
    stageOccurredAt: null,
    appliedAt: null,
    applyBy: null,
    location: null,
    sourceUrl: null,
    notes: null,
    assessment: null,
    interview: null,
  };
}

export class JobDriveDemoProvider implements ActionProposalProvider {
  readonly name = "demo";
  readonly model = "job-drive-deterministic-v1";
  readonly isDemo = true;

  async propose(input: ActionProposalInput): Promise<ActionProposalResult> {
    const startedAt = performance.now();
    const decision = this.interpret(input);
    return {
      decision,
      metadata: {
        provider: this.name,
        model: this.model,
        latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
        isDemo: true,
      },
    };
  }

  private interpret(input: ActionProposalInput): ActionProposalResult["decision"] {
    const message = input.message.trim();
    if (destructiveInstruction.test(message)) {
      return {
        kind: "unsupported",
        message:
          "dolu bolu can prepare drive updates for review, but it cannot delete data, send messages, or apply autonomously.",
      };
    }

    const dateWord = message.match(/\b(yesterday|today|tomorrow)\b/i)?.[1] ?? null;
    const withoutDate = clean(
      message.replace(/\s+\b(?:yesterday|today|tomorrow)\b[.!?]*$/i, ""),
    );
    const applied = withoutDate.match(
      /\bapplied\s+(?:to|at)\s+(.+?)\s+(?:for|as)\s+(?:an?\s+|the\s+)?(.+)$/i,
    );

    if (applied) {
      const companyName = clean(applied[1]);
      const roleTitle = clean(applied[2]);
      const appliedAt = relativeDate(input, dateWord);
      return {
        kind: "proposals",
        proposals: [
          {
            ref: "draft:1",
            kind: "record_job_drive_progress",
            summary: `Move ${companyName} · ${roleTitle} to Applied`,
            evidence: [
              { fieldPath: "companyName", quote: companyName },
              { fieldPath: "roleTitle", quote: roleTitle },
            ],
            assumptions: appliedAt
              ? [`“${dateWord}” is resolved from the supplied current time.`]
              : ["The application date stays unknown because none was stated."],
            payload: {
              jobDriveRef: matchingRef(input, companyName, roleTitle),
              isCorrection: false,
              companyName,
              roleTitle,
              stage: "applied",
              ...emptyDetails(),
              appliedAt,
            },
          },
        ],
      };
    }

    const planned = withoutDate.match(
      /\b(?:track|save)\s+(.+?)\s+for\s+(?:an?\s+|the\s+)?(.+)$/i,
    );
    if (planned) {
      const companyName = clean(planned[1]);
      const roleTitle = clean(planned[2]);
      return {
        kind: "proposals",
        proposals: [{
          ref: "draft:1",
          kind: "record_job_drive_progress",
          summary: `Plan ${companyName} · ${roleTitle}`,
          evidence: [
            { fieldPath: "companyName", quote: companyName },
            { fieldPath: "roleTitle", quote: roleTitle },
          ],
          assumptions: ["No application has been submitted yet."],
          payload: {
            jobDriveRef: matchingRef(input, companyName, roleTitle),
            isCorrection: false,
            companyName,
            roleTitle,
            stage: "planned",
            ...emptyDetails(),
          },
        }],
      };
    }

    const stageMatch = withoutDate.match(
      /\b(?:oa|online assessment|interview|offer|accepted|rejected|withdrawn)\s+(?:at|from|for)\s+(.+?)\s+(?:for|as)\s+(?:an?\s+|the\s+)?(.+)$/i,
    );

    if (stageMatch) {
      const phrase = withoutDate.match(
        /\b(oa|online assessment|interview|offer|accepted|rejected|withdrawn)\b/i,
      )?.[1].toLowerCase();
      const companyName = clean(stageMatch[1]);
      const roleTitle = clean(stageMatch[2]);
      const eventAt = relativeDate(input, dateWord);
      const stage = phrase === "oa" || phrase === "online assessment"
        ? "assessment"
        : phrase === "interview"
          ? "interview"
          : phrase === "offer"
            ? "offer"
            : phrase === "accepted"
              ? "accepted"
            : phrase === "rejected"
              ? "rejected"
              : "withdrawn";
      const assessment = stage === "assessment"
        ? {
          status: eventAt ? "scheduled" : "invited",
          availableFrom: eventAt,
          dueAt: null,
          durationMinutes: null,
          assessmentUrl: null,
          notes: null,
        } as const
        : null;
      const interview = stage === "interview"
        ? {
          nextScheduledAt: eventAt,
          timeZone: eventAt ? input.timeZone : null,
          mode: "unknown",
          location: null,
          meetingUrl: null,
          roundSummary: null,
          notes: null,
        } as const
        : null;

      return {
        kind: "proposals",
        proposals: [
          {
            ref: "draft:1",
            kind: "record_job_drive_progress",
            summary: `Move ${companyName} · ${roleTitle} to ${stage}`,
            evidence: [
              { fieldPath: "companyName", quote: companyName },
              { fieldPath: "roleTitle", quote: roleTitle },
              { fieldPath: "stage", quote: stageMatch[0].split(/\s+/)[0] },
            ],
            assumptions: eventAt
              ? [`“${dateWord}” is resolved from the supplied current time.`]
              : ["No event date was supplied, so it stays unknown."],
            payload: {
              jobDriveRef: matchingRef(input, companyName, roleTitle),
              isCorrection: /\b(?:correction|correct|mistake|wrong|reopen)\b/i.test(message),
              companyName,
              roleTitle,
              stage,
              ...emptyDetails(),
              assessment,
              interview,
              stageOccurredAt: eventAt,
            },
          },
        ],
      };
    }

    return {
      kind: "needs_clarification",
      question:
        "Which company and role is this Job Drive update for, and what stage did you reach?",
      missingFields: ["companyName", "roleTitle", "stage"],
    };
  }
}
