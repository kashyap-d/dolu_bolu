import type { JobDrive } from "@/features/job-drives/contracts";
import { normalizeCompanyName } from "@/features/job-drives/normalize";
import { isTerminalStage } from "@/features/job-drives/stage-rules";

export const MODEL_CONTEXT_LIMIT = 10;

function words(value: string) {
  return ` ${value.toLowerCase().replaceAll("&", " and ").replace(/[^a-z0-9]+/g, " ").trim()} `;
}

function mentions(message: string, companyName: string) {
  const company = normalizeCompanyName(companyName);
  // Non-ASCII names normalise to themselves; match them as plain text.
  return /^[a-z0-9 ]+$/.test(company)
    ? words(message).includes(` ${company} `)
    : message.toLowerCase().includes(company);
}

/**
 * The smallest useful slice of the user's drives to send to a model
 * (AGENTS.md: "never send an entire job-search history"). If the message
 * names companies, only drives at those companies are sent; otherwise a few
 * recent active drives, so a vague update can still be matched or clarified.
 * `drives` must be ordered most recently updated first.
 */
export function selectModelContext(message: string, drives: readonly JobDrive[]) {
  const mentioned = drives.filter((drive) => mentions(message, drive.companyName));
  const selected = mentioned.length
    ? mentioned
    : drives.filter((drive) => !isTerminalStage(drive.stage));
  return selected.slice(0, MODEL_CONTEXT_LIMIT).map((drive) => ({
    ref: `job-drive:${drive.id}`,
    companyName: drive.companyName,
    roleTitle: drive.roleTitle,
    stage: drive.stage,
    location: drive.location,
    sourceUrl: drive.sourceUrl,
    updatedAt: drive.updatedAt,
  }));
}
