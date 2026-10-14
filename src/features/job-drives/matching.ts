import type { JobDrive, JobDriveStage } from "./contracts";
import { isTerminalStage } from "./stage-rules";

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? null;
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

  const company = normalized(candidate.companyName);
  const role = normalized(candidate.roleTitle);
  if (!company || !role) return [];

  let matches = drives.filter(
    (drive) =>
      normalized(drive.companyName) === company &&
      normalized(drive.roleTitle) === role,
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
