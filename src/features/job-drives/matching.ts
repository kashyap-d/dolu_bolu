import type { JobDrive, JobDriveStage } from "./contracts";
import { normalizeCompanyName, normalizeRoleTitle } from "./normalize";
import { isTerminalStage } from "./stage-rules";

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() || null;
}

export function matchingJobDrives(
  candidate: {
    companyName: string | null;
    roleTitle: string | null;
    sourceUrl: string | null;
    location: string | null;
    stage: JobDriveStage;
  },
  drives: readonly JobDrive[],
) {
  const sourceUrl = normalized(candidate.sourceUrl);
  if (sourceUrl) {
    const exactSource = drives.filter(
      (drive) => normalized(drive.sourceUrl) === sourceUrl,
    );
    if (exactSource.length) return exactSource;
  }

  if (!candidate.companyName?.trim() || !candidate.roleTitle?.trim()) return [];
  const company = normalizeCompanyName(candidate.companyName);
  const role = normalizeRoleTitle(candidate.roleTitle);

  let matches = drives.filter(
    (drive) =>
      normalizeCompanyName(drive.companyName) === company &&
      normalizeRoleTitle(drive.roleTitle) === role,
  );
  const location = normalized(candidate.location);
  if (location) {
    const sameLocation = matches.filter(
      (drive) => normalized(drive.location) === location,
    );
    if (sameLocation.length) matches = sameLocation;
  }

  const active = matches.filter((drive) => !isTerminalStage(drive.stage));
  if (active.length) return active;

  // A new active update after only closed processes is a legitimate repeat application.
  return isTerminalStage(candidate.stage) ? matches : [];
}
