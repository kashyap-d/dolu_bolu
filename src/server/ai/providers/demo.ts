import "server-only";

import type {
  ActionProposalInput,
  ActionProposalProvider,
  ActionProposalResult,
} from "../action-proposal-provider";

const destructiveInstruction = /\b(delete|submit|send|email|apply automatically)\b/i;

function cleanPhrase(value: string): string {
  return value
    .replace(/\s+(?:role|position)$/i, "")
    .replace(/[.!?]+$/, "")
    .trim();
}

function proposedAt(input: ActionProposalInput, relativeDate: string | null) {
  const date = new Date(input.now);

  if (relativeDate?.toLowerCase() === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date.toISOString();
}

export class DemoActionProposalProvider implements ActionProposalProvider {
  readonly name = "demo";
  readonly model = "deterministic-v1";
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
        isDemo: this.isDemo,
      },
    };
  }

  private interpret(input: ActionProposalInput): ActionProposalResult["decision"] {
    const message = input.message.trim();

    if (destructiveInstruction.test(message)) {
      return {
        kind: "unsupported",
        message:
          "dolu bolu can prepare records for review, but it cannot delete data, send messages, or submit applications autonomously.",
      };
    }

    const relativeDate = message.match(/\b(yesterday|today)\b/i)?.[1] ?? null;
    const applicationText = message
      .replace(/\s+\b(?:yesterday|today)\b[.!?]*$/i, "")
      .trim();
    const applicationMatch = applicationText.match(
      /\bapplied\s+(?:to|at)\s+(.+?)\s+(?:for|as)\s+(?:an?\s+|the\s+)?(.+)$/i,
    );

    if (applicationMatch) {
      const companyName = cleanPhrase(applicationMatch[1]);
      const roleTitle = cleanPhrase(applicationMatch[2]);

      return {
        kind: "proposals",
        batchId: crypto.randomUUID(),
        proposals: [
          {
            id: crypto.randomUUID(),
            ref: "draft:1",
            kind: "create_application",
            summary: `Record ${roleTitle} application at ${companyName}`,
            evidence: [
              { fieldPath: "companyName", quote: companyName },
              { fieldPath: "roleTitle", quote: roleTitle },
            ],
            assumptions: relativeDate
              ? [`“${relativeDate}” is resolved from the current server time.`]
              : ["No application date was stated, so the current date is proposed."],
            payload: {
              companyName,
              roleTitle,
              status: "applied",
              appliedAt: proposedAt(input, relativeDate),
              sourceUrl: null,
              notes: null,
            },
          },
        ],
      };
    }

    if (/\binterview\b/i.test(message)) {
      return {
        kind: "needs_clarification",
        question:
          "What exact date, time, and company should I use for this interview? The demo parser will not guess relative dates.",
        missingFields: ["companyName", "startsAt"],
      };
    }

    const taskMatch = message.match(
      /\b(?:add|create)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i,
    );

    if (taskMatch) {
      const title = cleanPhrase(taskMatch[1]);

      return {
        kind: "proposals",
        batchId: crypto.randomUUID(),
        proposals: [
          {
            id: crypto.randomUUID(),
            ref: "draft:1",
            kind: "create_task",
            summary: `Create task: ${title}`,
            evidence: [{ fieldPath: "title", quote: title }],
            assumptions: ["No deadline was added because none was stated."],
            payload: {
              title,
              dueAt: null,
              priority: "medium",
              reminderRequested: false,
              notes: null,
            },
          },
        ],
      };
    }

    return {
      kind: "needs_clarification",
      question:
        "Should I record this as an application, an interview, or a task?",
      missingFields: ["actionKind"],
    };
  }
}
