import "server-only";

import type { JobDriveStage } from "@/features/job-drives/contracts";
import { stageLabel } from "@/features/job-drives/stage-rules";
import { addDays, calendarDate } from "@/lib/dates";

import type {
  ActionProposalInput,
  ActionProposalProvider,
  ActionProposalResult,
} from "../action-proposal-provider";

type Decision = ActionProposalResult["decision"];
type DraftPayload = Extract<Decision, { kind: "proposal" }>["proposal"]["payload"];

const destructiveInstruction = /\b(delete|submit|send|email|apply automatically)\b/i;
const correctionInstruction = /\b(?:correction|correct|mistake|wrong|reopen)\b/i;

const stagePhrases: Record<string, JobDriveStage> = {
  oa: "assessment",
  "online assessment": "assessment",
  interview: "interview",
  offer: "offer",
  accepted: "accepted",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

function clean(value: string) {
  return value.replace(/[.!?]+$/, "").trim();
}

const dayOffsets: Record<string, number> = { yesterday: -1, today: 0, tomorrow: 1 };

/** A relative day word as an instant (for events) and as the user's calendar date (for day-only facts). */
function relativeDay(input: ActionProposalInput, word: string | null) {
  if (!word) return { instant: null, date: null };
  const offset = dayOffsets[word.toLowerCase()] ?? 0;
  const instant = new Date(new Date(input.now).getTime() + offset * 86_400_000).toISOString();
  return { instant, date: addDays(calendarDate(new Date(input.now), input.timeZone), offset) };
}

function matchingRef(input: ActionProposalInput, company: string, role: string) {
  const matches = input.context.jobDrives.filter(
    (drive) =>
      drive.companyName.toLowerCase() === company.toLowerCase() &&
      drive.roleTitle.toLowerCase() === role.toLowerCase(),
  );
  return matches.length === 1 ? matches[0].ref : null;
}

function proposal(
  input: ActionProposalInput,
  details: {
    companyName: string;
    roleTitle: string;
    stage: JobDriveStage;
    summary: string;
    extraEvidence?: Array<{ fieldPath: string; quote: string }>;
    assumptions: string[];
    payload?: Partial<DraftPayload>;
  },
): Decision {
  return {
    kind: "proposal",
    proposal: {
      kind: "record_job_drive_progress",
      summary: details.summary,
      evidence: [
        { fieldPath: "companyName", quote: details.companyName },
        { fieldPath: "roleTitle", quote: details.roleTitle },
        ...(details.extraEvidence ?? []),
      ],
      assumptions: details.assumptions,
      payload: {
        jobDriveRef: matchingRef(input, details.companyName, details.roleTitle),
        isCorrection: false,
        companyName: details.companyName,
        roleTitle: details.roleTitle,
        stage: details.stage,
        stageOccurredAt: null,
        appliedAt: null,
        applyBy: null,
        location: null,
        sourceUrl: null,
        notes: null,
        assessment: null,
        interview: null,
        ...details.payload,
      },
    },
  };
}

/**
 * A deterministic, key-free stand-in for a hosted model. It understands a few
 * sentence templates and exists for tests, evals, and the offline preview —
 * not as the product's demonstration of AI quality (docs/decisions/0007).
 */
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

  private interpret(input: ActionProposalInput): Decision {
    const message = input.message.trim();
    if (destructiveInstruction.test(message)) {
      return {
        kind: "unsupported",
        message:
          "dolu bolu can prepare drive updates for review, but it cannot delete data, send messages, or apply autonomously.",
      };
    }

    const dateWord = message.match(/\b(yesterday|today|tomorrow)\b/i)?.[1] ?? null;
    const { instant: eventAt, date: eventDate } = relativeDay(input, dateWord);
    const dateAssumption = eventAt
      ? [`“${dateWord}” is resolved in your time zone (${input.timeZone}).`]
      : null;
    const body = clean(message.replace(/\s+\b(?:yesterday|today|tomorrow)\b[.!?]*$/i, ""));

    const applied = body.match(
      /\bapplied\s+(?:to|at)\s+(.+?)\s+(?:for|as)\s+(?:an?\s+|the\s+)?(.+)$/i,
    );
    if (applied) {
      const companyName = clean(applied[1]);
      const roleTitle = clean(applied[2]);
      return proposal(input, {
        companyName,
        roleTitle,
        stage: "applied",
        summary: `Move ${companyName} · ${roleTitle} to Applied`,
        assumptions: dateAssumption ?? ["The application date stays unknown because none was stated."],
        payload: { appliedAt: eventDate },
      });
    }

    const planned = body.match(/\b(?:track|save)\s+(.+?)\s+for\s+(?:an?\s+|the\s+)?(.+)$/i);
    if (planned) {
      const companyName = clean(planned[1]);
      const roleTitle = clean(planned[2]);
      return proposal(input, {
        companyName,
        roleTitle,
        stage: "planned",
        summary: `Plan ${companyName} · ${roleTitle}`,
        assumptions: ["No application has been submitted yet."],
      });
    }

    const progressed = body.match(
      /\b(oa|online assessment|interview|offer|accepted|rejected|withdrawn)\s+(?:at|from|for)\s+(.+?)\s+(?:for|as)\s+(?:an?\s+|the\s+)?(.+)$/i,
    );
    if (progressed) {
      const stage = stagePhrases[progressed[1].toLowerCase()];
      const companyName = clean(progressed[2]);
      const roleTitle = clean(progressed[3]);
      return proposal(input, {
        companyName,
        roleTitle,
        stage,
        summary: `Move ${companyName} · ${roleTitle} to ${stageLabel(stage)}`,
        extraEvidence: [{ fieldPath: "stage", quote: progressed[1] }],
        assumptions: dateAssumption ?? ["No event date was supplied, so it stays unknown."],
        payload: {
          isCorrection: correctionInstruction.test(message),
          stageOccurredAt: eventAt,
          assessment:
            stage === "assessment"
              ? {
                  status: eventAt ? "scheduled" : "invited",
                  availableFrom: eventAt,
                  dueAt: null,
                  durationMinutes: null,
                  assessmentUrl: null,
                  notes: null,
                }
              : null,
          interview:
            stage === "interview"
              ? {
                  nextScheduledAt: eventAt,
                  timeZone: eventAt ? input.timeZone : null,
                  mode: "unknown",
                  location: null,
                  meetingUrl: null,
                  roundSummary: null,
                  notes: null,
                }
              : null,
        },
      });
    }

    return {
      kind: "needs_clarification",
      question:
        "Which company and role is this Job Drive update for, and what stage did you reach?",
      missingFields: ["companyName", "roleTitle", "stage"],
    };
  }
}
