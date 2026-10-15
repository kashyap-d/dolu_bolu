"use client";

import { LoaderCircle, Save, ShieldAlert, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/card";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { useWorkspaceNavigation } from "@/features/workspace/navigation";

import {
  jobDriveProgressPayloadSchema,
  type AssessmentDetails,
  type ConfirmJobDriveResponse,
  type InterviewSummary,
  type JobDriveProgressPayload,
  type JobDriveStage,
  type SaveJobDriveResponse,
} from "../contracts";
import { isBackwardStageChange } from "../stage-rules";
import { StageBar } from "./stage-bar";

interface JobDriveEditorProps {
  mode: "create" | "edit" | "review";
  initial: JobDriveProgressPayload;
  /** The stored stage, used to detect corrections. Absent for new drives. */
  existingStage?: JobDriveStage;
  title?: string;
  description?: string;
  evidence?: Array<{ fieldPath: string; quote: string }>;
  assumptions?: string[];
  onCancel?: () => void;
  onDiscard?: () => Promise<void>;
  onSave: (
    drive: JobDriveProgressPayload,
    options: { allowPossibleDuplicate: boolean; isCorrection: boolean },
  ) => Promise<SaveJobDriveResponse | ConfirmJobDriveResponse>;
}

type DuplicateCandidate = Extract<SaveJobDriveResponse, { outcome: "possible_duplicate" }>["candidates"][number];

const emptyAssessment: AssessmentDetails = {
  status: "invited",
  availableFrom: null,
  dueAt: null,
  durationMinutes: null,
  assessmentUrl: null,
  notes: null,
};

const emptyInterview: InterviewSummary = {
  nextScheduledAt: null,
  timeZone: null,
  mode: "unknown",
  location: null,
  meetingUrl: null,
  roundSummary: null,
  notes: null,
};

const assessmentStatuses: AssessmentDetails["status"][] = [
  "invited",
  "scheduled",
  "completed",
  "passed",
  "failed",
  "cancelled",
];
const interviewModes: InterviewSummary["mode"][] = ["unknown", "virtual", "phone", "onsite"];

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** ISO timestamp → value for <input type="datetime-local"> in the browser's zone. */
function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** datetime-local value → ISO timestamp; "invalid" lets schema validation flag it. */
function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString();
}

const trimmedOrNull = (value: string | null | undefined) => value?.trim() || null;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-line bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">{title}</legend>
      {children}
    </fieldset>
  );
}

export function JobDriveEditor({
  mode,
  initial,
  existingStage,
  title,
  description,
  evidence = [],
  assumptions = [],
  onCancel,
  onDiscard,
  onSave,
}: JobDriveEditorProps) {
  const navigation = useWorkspaceNavigation();
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [roleTitle, setRoleTitle] = useState(initial.roleTitle);
  const [stage, setStage] = useState(initial.stage);
  const [stageOccurredAt, setStageOccurredAt] = useState(toLocalDateTime(initial.stageOccurredAt));
  const [appliedAt, setAppliedAt] = useState(initial.appliedAt ?? "");
  const [applyBy, setApplyBy] = useState(initial.applyBy ?? "");
  const [location, setLocation] = useState(initial.location ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [assessment, setAssessment] = useState<AssessmentDetails | null>(initial.assessment);
  const [interview, setInterview] = useState<InterviewSummary | null>(initial.interview);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "discard" | null>(null);

  const correction = Boolean(existingStage && isBackwardStageChange(existingStage, stage));
  const assessmentValue = assessment ?? emptyAssessment;
  const interviewValue = interview ?? emptyInterview;
  const busy = Boolean(pendingAction);

  function selectStage(next: JobDriveStage) {
    if (next === stage) return;
    setStage(next);
    setStageOccurredAt("");
    if (next === "assessment" && !assessment) setAssessment(emptyAssessment);
    if (next === "interview" && !interview) {
      setInterview({
        ...emptyInterview,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
    }
  }

  function candidate() {
    return jobDriveProgressPayloadSchema.safeParse({
      companyName,
      roleTitle,
      stage,
      stageOccurredAt: toIsoOrNull(stageOccurredAt),
      // <input type="date"> already yields YYYY-MM-DD.
      appliedAt: appliedAt || null,
      applyBy: applyBy || null,
      location: trimmedOrNull(location),
      sourceUrl: trimmedOrNull(sourceUrl),
      notes: trimmedOrNull(notes),
      assessment: assessment
        ? {
            ...assessment,
            assessmentUrl: trimmedOrNull(assessment.assessmentUrl),
            notes: trimmedOrNull(assessment.notes),
          }
        : null,
      interview: interview
        ? {
            ...interview,
            timeZone: trimmedOrNull(interview.timeZone),
            location: trimmedOrNull(interview.location),
            meetingUrl: trimmedOrNull(interview.meetingUrl),
            roundSummary: trimmedOrNull(interview.roundSummary),
            notes: trimmedOrNull(interview.notes),
          }
        : null,
    });
  }

  async function submit(event?: FormEvent<HTMLFormElement>, allowPossibleDuplicate = false) {
    event?.preventDefault();
    if (busy) return;
    const parsed = candidate();
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
      setFieldErrors(errors);
      setRequestError("Please correct the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    setPendingAction("save");
    try {
      const response = await onSave(parsed.data, { allowPossibleDuplicate, isCorrection: correction });
      if (response.outcome === "possible_duplicate") {
        setDuplicates(response.candidates);
        setRequestError(
          "This looks like a drive you already track. Open that one, or confirm this is a separate hiring process.",
        );
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The Job Drive could not be saved.");
    } finally {
      setPendingAction(null);
    }
  }

  async function discard() {
    if (!onDiscard || busy) return;
    setPendingAction("discard");
    setRequestError(null);
    try {
      await onDiscard();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The proposal could not be discarded.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="animate-enter overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-raised">
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <Eyebrow>{mode === "review" ? "AI proposal · review required" : "Direct, audited update"}</Eyebrow>
          <h2 className="mt-1 font-display text-lg font-semibold tracking-[-0.025em] text-ink">
            {title ?? (mode === "create" ? "Add a Job Drive" : "Update Job Drive")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            {description ?? "Dates are optional. Unknown information stays unknown."}
          </p>
        </div>
        {onCancel ? (
          <Button aria-label="Close editor" disabled={busy} onClick={onCancel} size="icon" variant="secondary">
            <X size={16} />
          </Button>
        ) : null}
      </div>

      <form noValidate onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <Field error={fieldErrors.companyName} label="Company">
            <TextInput
              autoFocus={mode !== "review"}
              invalid={Boolean(fieldErrors.companyName)}
              maxLength={120}
              onChange={(event) => setCompanyName(event.target.value)}
              value={companyName}
            />
          </Field>
          <Field error={fieldErrors.roleTitle} label="Role">
            <TextInput
              invalid={Boolean(fieldErrors.roleTitle)}
              maxLength={160}
              onChange={(event) => setRoleTitle(event.target.value)}
              value={roleTitle}
            />
          </Field>

          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold text-muted">Hiring stage</p>
            <StageBar disabled={busy} onSelect={selectStage} value={stage} />
            {correction ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-danger-ink">
                <ShieldAlert aria-hidden="true" size={14} /> This will be recorded as an explicit correction.
              </p>
            ) : null}
          </div>

          <Field error={fieldErrors.stageOccurredAt} label="When this stage happened" optional>
            <TextInput
              invalid={Boolean(fieldErrors.stageOccurredAt)}
              onChange={(event) => setStageOccurredAt(event.target.value)}
              type="datetime-local"
              value={stageOccurredAt}
            />
          </Field>
          <Field error={fieldErrors.appliedAt} label="Applied on" optional>
            <TextInput
              invalid={Boolean(fieldErrors.appliedAt)}
              onChange={(event) => setAppliedAt(event.target.value)}
              type="date"
              value={appliedAt}
            />
          </Field>
          <Field error={fieldErrors.applyBy} label="Apply by" optional>
            <TextInput
              invalid={Boolean(fieldErrors.applyBy)}
              onChange={(event) => setApplyBy(event.target.value)}
              type="date"
              value={applyBy}
            />
          </Field>
          <Field error={fieldErrors.location} label="Location" optional>
            <TextInput
              invalid={Boolean(fieldErrors.location)}
              maxLength={240}
              onChange={(event) => setLocation(event.target.value)}
              value={location}
            />
          </Field>
          <Field className="sm:col-span-2" error={fieldErrors.sourceUrl} label="Job posting URL" optional>
            <TextInput
              invalid={Boolean(fieldErrors.sourceUrl)}
              maxLength={2048}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://company.com/jobs/…"
              type="url"
              value={sourceUrl}
            />
          </Field>

          {stage === "assessment" ? (
            <Section title="Assessment / OA details">
              <Field label="Status">
                <Select
                  onChange={(event) =>
                    setAssessment({ ...assessmentValue, status: event.target.value as AssessmentDetails["status"] })
                  }
                  value={assessmentValue.status}
                >
                  {assessmentStatuses.map((value) => (
                    <option key={value} value={value}>{capitalize(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field error={fieldErrors["assessment.durationMinutes"]} label="Duration in minutes" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["assessment.durationMinutes"])}
                  max={1440}
                  min={1}
                  onChange={(event) =>
                    setAssessment({
                      ...assessmentValue,
                      durationMinutes: event.target.value ? Number(event.target.value) : null,
                    })
                  }
                  type="number"
                  value={assessmentValue.durationMinutes ?? ""}
                />
              </Field>
              <Field error={fieldErrors["assessment.availableFrom"]} label="Opens" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["assessment.availableFrom"])}
                  onChange={(event) =>
                    setAssessment({ ...assessmentValue, availableFrom: toIsoOrNull(event.target.value) })
                  }
                  type="datetime-local"
                  value={toLocalDateTime(assessmentValue.availableFrom)}
                />
              </Field>
              <Field error={fieldErrors["assessment.dueAt"]} label="Deadline" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["assessment.dueAt"])}
                  onChange={(event) => setAssessment({ ...assessmentValue, dueAt: toIsoOrNull(event.target.value) })}
                  type="datetime-local"
                  value={toLocalDateTime(assessmentValue.dueAt)}
                />
              </Field>
              <Field className="sm:col-span-2" error={fieldErrors["assessment.assessmentUrl"]} label="Assessment link" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["assessment.assessmentUrl"])}
                  onChange={(event) => setAssessment({ ...assessmentValue, assessmentUrl: event.target.value || null })}
                  type="url"
                  value={assessmentValue.assessmentUrl ?? ""}
                />
              </Field>
              <Field className="sm:col-span-2" label="Assessment notes" optional>
                <TextArea
                  maxLength={2000}
                  onChange={(event) => setAssessment({ ...assessmentValue, notes: event.target.value || null })}
                  value={assessmentValue.notes ?? ""}
                />
              </Field>
            </Section>
          ) : null}

          {stage === "interview" ? (
            <Section title="Interview phase">
              <Field error={fieldErrors["interview.nextScheduledAt"]} label="Next interview" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["interview.nextScheduledAt"])}
                  onChange={(event) =>
                    setInterview({ ...interviewValue, nextScheduledAt: toIsoOrNull(event.target.value) })
                  }
                  type="datetime-local"
                  value={toLocalDateTime(interviewValue.nextScheduledAt)}
                />
              </Field>
              <Field error={fieldErrors["interview.timeZone"]} label="Time zone" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["interview.timeZone"])}
                  maxLength={80}
                  onChange={(event) => setInterview({ ...interviewValue, timeZone: event.target.value || null })}
                  placeholder="Asia/Kolkata"
                  value={interviewValue.timeZone ?? ""}
                />
              </Field>
              <Field label="Mode">
                <Select
                  onChange={(event) =>
                    setInterview({ ...interviewValue, mode: event.target.value as InterviewSummary["mode"] })
                  }
                  value={interviewValue.mode}
                >
                  {interviewModes.map((value) => (
                    <option key={value} value={value}>{capitalize(value)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Location" optional>
                <TextInput
                  onChange={(event) => setInterview({ ...interviewValue, location: event.target.value || null })}
                  value={interviewValue.location ?? ""}
                />
              </Field>
              <Field className="sm:col-span-2" error={fieldErrors["interview.meetingUrl"]} label="Meeting link" optional>
                <TextInput
                  invalid={Boolean(fieldErrors["interview.meetingUrl"])}
                  onChange={(event) => setInterview({ ...interviewValue, meetingUrl: event.target.value || null })}
                  type="url"
                  value={interviewValue.meetingUrl ?? ""}
                />
              </Field>
              <Field className="sm:col-span-2" label="Rounds so far" optional>
                <TextArea
                  maxLength={1000}
                  onChange={(event) => setInterview({ ...interviewValue, roundSummary: event.target.value || null })}
                  value={interviewValue.roundSummary ?? ""}
                />
              </Field>
              <Field className="sm:col-span-2" label="Interview notes" optional>
                <TextArea
                  maxLength={2000}
                  onChange={(event) => setInterview({ ...interviewValue, notes: event.target.value || null })}
                  value={interviewValue.notes ?? ""}
                />
              </Field>
            </Section>
          ) : null}

          <Field className="sm:col-span-2" label="Notes" optional>
            <TextArea className="min-h-24" maxLength={2000} onChange={(event) => setNotes(event.target.value)} value={notes} />
          </Field>
        </div>

        {evidence.length ? (
          <div className="border-t border-line bg-surface-muted px-5 py-3.5 sm:px-6">
            <Eyebrow>Grounded in your message</Eyebrow>
            <ul className="mt-2 space-y-1">
              {evidence.map((item) => (
                <li className="text-xs text-muted" key={`${item.fieldPath}-${item.quote}`}>“{item.quote}”</li>
              ))}
            </ul>
          </div>
        ) : null}
        {assumptions.length ? (
          <div className="border-t border-line bg-accent-soft px-5 py-3.5 text-xs leading-5 text-accent-ink sm:px-6">
            <strong>Please verify: </strong>
            {assumptions.join(" ")}
          </div>
        ) : null}

        <div className="border-t border-line px-5 py-4 sm:px-6">
          <div aria-live="polite">
            {requestError ? <p className="mb-3 text-xs leading-5 text-danger-ink">{requestError}</p> : null}
          </div>
          {duplicates ? (
            <ul className="mb-3 space-y-1 rounded-xl border border-accent-line bg-accent-soft p-3 text-xs text-accent-ink">
              {duplicates.map((drive) => (
                <li className="flex items-center justify-between gap-3" key={drive.id}>
                  <span>{drive.companyName} · {drive.roleTitle}</span>
                  <button
                    className="font-semibold underline"
                    onClick={() => navigation.navigate({ view: "drive", driveId: drive.id })}
                    type="button"
                  >
                    Open existing
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {onDiscard ? (
              <Button disabled={busy} onClick={() => void discard()} variant="secondary">
                {pendingAction === "discard" ? <LoaderCircle className="animate-spin" size={15} /> : <Trash2 size={15} />}
                Discard
              </Button>
            ) : null}
            {duplicates ? (
              <Button disabled={busy} onClick={() => void submit(undefined, true)} variant="caution">
                Create separately
              </Button>
            ) : null}
            <Button disabled={busy} type="submit">
              {pendingAction === "save" ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}
              {correction ? "Save audited correction" : mode === "review" ? "Confirm update" : "Save Job Drive"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
