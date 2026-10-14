"use client";

import { LoaderCircle, Save, ShieldAlert, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import type {
  AssessmentDetails,
  InterviewSummary,
  JobDrive,
  JobDriveProgressPayload,
  JobDriveStage,
  SaveJobDriveResponse,
} from "@/features/job-drives/contracts";
import { jobDriveProgressPayloadSchema } from "@/features/job-drives/contracts";
import { isBackwardStageChange } from "@/features/job-drives/stage-rules";
import { StageBar } from "@/features/job-drives/stage-bar";

type SaveLikeResponse =
  | SaveJobDriveResponse
  | {
      outcome: "executed" | "already_executed";
      proposalId: string;
      jobDrive: JobDrive;
    };

interface JobDriveEditorProps {
  mode: "create" | "edit" | "review";
  initial: JobDriveProgressPayload;
  existingStage?: JobDriveStage;
  title?: string;
  description?: string;
  evidence?: Array<{ fieldPath: string; quote: string }>;
  assumptions?: string[];
  onCancel: () => void;
  onDiscard?: () => Promise<void>;
  onUseExisting?: (jobDriveId: string) => void;
  onSave: (
    drive: JobDriveProgressPayload,
    options: { allowPossibleDuplicate: boolean; isCorrection: boolean },
  ) => Promise<SaveLikeResponse>;
}

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

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString();
}

function inputClass(hasError = false) {
  return `mt-1.5 h-11 w-full rounded-xl border bg-white px-3 text-sm text-[#30372f] outline-none transition focus:ring-2 focus:ring-[#cbdacb] ${
    hasError ? "border-[#c88474]" : "border-[#dce3d9] focus:border-[#78907d]"
  }`;
}

function FieldError({ value }: { value?: string }) {
  return value ? (
    <span className="mt-1 block text-[11px] text-[#9a574a]">{value}</span>
  ) : null;
}

function Optional() {
  return <span className="font-normal text-[#949b92]">(optional)</span>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 rounded-2xl border border-[#e5e9e2] bg-[#fafbf9] p-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#718071]">
        {title}
      </legend>
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
  onUseExisting,
  onSave,
}: JobDriveEditorProps) {
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [roleTitle, setRoleTitle] = useState(initial.roleTitle);
  const [stage, setStage] = useState(initial.stage);
  const [stageOccurredAt, setStageOccurredAt] = useState(toLocalDateTime(initial.stageOccurredAt));
  const [appliedAt, setAppliedAt] = useState(toLocalDateTime(initial.appliedAt));
  const [applyBy, setApplyBy] = useState(toLocalDateTime(initial.applyBy));
  const [location, setLocation] = useState(initial.location ?? "");
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl ?? "");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [assessment, setAssessment] = useState<AssessmentDetails | null>(initial.assessment);
  const [interview, setInterview] = useState<InterviewSummary | null>(initial.interview);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; companyName: string; roleTitle: string; stage: JobDriveStage }> | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "discard" | null>(null);

  function selectStage(next: JobDriveStage) {
    if (next === stage) return;
    setStage(next);
    setStageOccurredAt("");
    if (next === "assessment" && !assessment) setAssessment(emptyAssessment);
    if (next === "interview" && !interview) {
      setInterview({ ...emptyInterview, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
    }
  }

  function candidate() {
    const result = {
      companyName,
      roleTitle,
      stage,
      stageOccurredAt: toIsoOrNull(stageOccurredAt),
      appliedAt: toIsoOrNull(appliedAt),
      applyBy: toIsoOrNull(applyBy),
      location: location.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim() || null,
      assessment: assessment
        ? {
            ...assessment,
            availableFrom: toIsoOrNull(toLocalDateTime(assessment.availableFrom)),
            dueAt: toIsoOrNull(toLocalDateTime(assessment.dueAt)),
            assessmentUrl: assessment.assessmentUrl?.trim() || null,
            notes: assessment.notes?.trim() || null,
          }
        : null,
      interview: interview
        ? {
            ...interview,
            nextScheduledAt: toIsoOrNull(toLocalDateTime(interview.nextScheduledAt)),
            timeZone: interview.timeZone?.trim() || null,
            location: interview.location?.trim() || null,
            meetingUrl: interview.meetingUrl?.trim() || null,
            roundSummary: interview.roundSummary?.trim() || null,
            notes: interview.notes?.trim() || null,
          }
        : null,
    };
    return jobDriveProgressPayloadSchema.safeParse(result);
  }

  async function submit(event?: FormEvent<HTMLFormElement>, allowPossibleDuplicate = false) {
    event?.preventDefault();
    if (pendingAction) return;
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
      const isCorrection = Boolean(existingStage && isBackwardStageChange(existingStage, stage));
      const response = await onSave(parsed.data, { allowPossibleDuplicate, isCorrection });
      if (response.outcome === "possible_duplicate") {
        setDuplicates(response.candidates);
        setRequestError("This looks similar to an existing drive. Use that record, or confirm that this is a separate hiring process.");
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The Job Drive could not be saved.");
    } finally {
      setPendingAction(null);
    }
  }

  async function discard() {
    if (!onDiscard || pendingAction) return;
    setPendingAction("discard");
    setRequestError(null);
    try {
      await onDiscard();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The proposal could not be discarded.");
      setPendingAction(null);
    }
  }

  const correction = Boolean(existingStage && isBackwardStageChange(existingStage, stage));
  const assessmentValue = assessment ?? emptyAssessment;
  const interviewValue = interview ?? emptyInterview;

  return (
    <section className="animate-enter overflow-hidden rounded-[24px] border border-[#dce3d9] bg-white shadow-[0_18px_50px_rgba(52,72,57,0.08)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#edf0eb] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#748173]">
            {mode === "review" ? "AI proposal · review required" : "Direct, audited update"}
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-manrope)] text-lg font-semibold tracking-[-0.025em] text-[#253028]">
            {title ?? (mode === "create" ? "Add a Job Drive" : "Update Job Drive")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#7e877c]">
            {description ?? "Dates are optional. Unknown information stays unknown."}
          </p>
        </div>
        {mode !== "review" ? (
          <button aria-label="Close editor" className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#e0e5de] text-[#717a70]" disabled={Boolean(pendingAction)} onClick={onCancel} type="button">
            <X size={16} />
          </button>
        ) : null}
      </div>

      <form onSubmit={(event) => void submit(event)}>
        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <label className="text-xs font-semibold text-[#616a60]">
            Company
            <input autoFocus aria-invalid={Boolean(fieldErrors.companyName)} className={inputClass(Boolean(fieldErrors.companyName))} maxLength={120} onChange={(event) => setCompanyName(event.target.value)} value={companyName} />
            <FieldError value={fieldErrors.companyName} />
          </label>
          <label className="text-xs font-semibold text-[#616a60]">
            Role
            <input aria-invalid={Boolean(fieldErrors.roleTitle)} className={inputClass(Boolean(fieldErrors.roleTitle))} maxLength={160} onChange={(event) => setRoleTitle(event.target.value)} value={roleTitle} />
            <FieldError value={fieldErrors.roleTitle} />
          </label>

          <div className="sm:col-span-2">
            <p className="mb-2 text-xs font-semibold text-[#616a60]">Hiring stage</p>
            <StageBar onSelect={selectStage} value={stage} />
            {correction ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8a5f55]">
                <ShieldAlert size={14} /> This will be recorded as an explicit correction.
              </p>
            ) : null}
          </div>

          <label className="text-xs font-semibold text-[#616a60]">
            When this stage happened <Optional />
            <input className={inputClass(Boolean(fieldErrors.stageOccurredAt))} onChange={(event) => setStageOccurredAt(event.target.value)} type="datetime-local" value={stageOccurredAt} />
            <FieldError value={fieldErrors.stageOccurredAt} />
          </label>
          <label className="text-xs font-semibold text-[#616a60]">
            Applied date <Optional />
            <input className={inputClass(Boolean(fieldErrors.appliedAt))} onChange={(event) => setAppliedAt(event.target.value)} type="datetime-local" value={appliedAt} />
            <FieldError value={fieldErrors.appliedAt} />
          </label>
          <label className="text-xs font-semibold text-[#616a60]">
            Apply by / target date <Optional />
            <input className={inputClass(Boolean(fieldErrors.applyBy))} onChange={(event) => setApplyBy(event.target.value)} type="datetime-local" value={applyBy} />
            <FieldError value={fieldErrors.applyBy} />
          </label>
          <label className="text-xs font-semibold text-[#616a60]">
            Location <Optional />
            <input className={inputClass(Boolean(fieldErrors.location))} maxLength={240} onChange={(event) => setLocation(event.target.value)} value={location} />
            <FieldError value={fieldErrors.location} />
          </label>
          <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
            Source URL <Optional />
            <input className={inputClass(Boolean(fieldErrors.sourceUrl))} maxLength={2048} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://company.com/jobs/..." type="url" value={sourceUrl} />
            <FieldError value={fieldErrors.sourceUrl} />
          </label>

          {stage === "assessment" ? (
            <Section title="Assessment / OA details">
              <label className="text-xs font-semibold text-[#616a60]">
                Status
                <select className={inputClass()} onChange={(event) => setAssessment({ ...assessmentValue, status: event.target.value as AssessmentDetails["status"] })} value={assessmentValue.status}>
                  {['invited', 'scheduled', 'completed', 'passed', 'failed', 'cancelled'].map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Duration in minutes <Optional />
                <input className={inputClass(Boolean(fieldErrors["assessment.durationMinutes"]))} min={1} max={1440} onChange={(event) => setAssessment({ ...assessmentValue, durationMinutes: event.target.value ? Number(event.target.value) : null })} type="number" value={assessmentValue.durationMinutes ?? ""} />
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Available from <Optional />
                <input className={inputClass(Boolean(fieldErrors["assessment.availableFrom"]))} onChange={(event) => setAssessment({ ...assessmentValue, availableFrom: toIsoOrNull(event.target.value) })} type="datetime-local" value={toLocalDateTime(assessmentValue.availableFrom)} />
                <FieldError value={fieldErrors["assessment.availableFrom"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Deadline <Optional />
                <input className={inputClass(Boolean(fieldErrors["assessment.dueAt"]))} onChange={(event) => setAssessment({ ...assessmentValue, dueAt: toIsoOrNull(event.target.value) })} type="datetime-local" value={toLocalDateTime(assessmentValue.dueAt)} />
                <FieldError value={fieldErrors["assessment.dueAt"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
                Assessment URL <Optional />
                <input className={inputClass(Boolean(fieldErrors["assessment.assessmentUrl"]))} onChange={(event) => setAssessment({ ...assessmentValue, assessmentUrl: event.target.value || null })} type="url" value={assessmentValue.assessmentUrl ?? ""} />
                <FieldError value={fieldErrors["assessment.assessmentUrl"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
                Assessment notes <Optional />
                <textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm" maxLength={2000} onChange={(event) => setAssessment({ ...assessmentValue, notes: event.target.value || null })} value={assessmentValue.notes ?? ""} />
              </label>
            </Section>
          ) : null}

          {stage === "interview" ? (
            <Section title="Interview phase">
              <label className="text-xs font-semibold text-[#616a60]">
                Next interview <Optional />
                <input className={inputClass(Boolean(fieldErrors["interview.nextScheduledAt"]))} onChange={(event) => setInterview({ ...interviewValue, nextScheduledAt: toIsoOrNull(event.target.value) })} type="datetime-local" value={toLocalDateTime(interviewValue.nextScheduledAt)} />
                <FieldError value={fieldErrors["interview.nextScheduledAt"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Timezone <Optional />
                <input className={inputClass(Boolean(fieldErrors["interview.timeZone"]))} maxLength={80} onChange={(event) => setInterview({ ...interviewValue, timeZone: event.target.value || null })} placeholder="Asia/Kolkata" value={interviewValue.timeZone ?? ""} />
                <FieldError value={fieldErrors["interview.timeZone"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Mode
                <select className={inputClass()} onChange={(event) => setInterview({ ...interviewValue, mode: event.target.value as NonNullable<JobDriveProgressPayload["interview"]>["mode"] })} value={interviewValue.mode}>
                  {['unknown', 'virtual', 'phone', 'onsite'].map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-[#616a60]">
                Location <Optional />
                <input className={inputClass()} onChange={(event) => setInterview({ ...interviewValue, location: event.target.value || null })} value={interviewValue.location ?? ""} />
              </label>
              <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
                Meeting URL <Optional />
                <input className={inputClass(Boolean(fieldErrors["interview.meetingUrl"]))} onChange={(event) => setInterview({ ...interviewValue, meetingUrl: event.target.value || null })} type="url" value={interviewValue.meetingUrl ?? ""} />
                <FieldError value={fieldErrors["interview.meetingUrl"]} />
              </label>
              <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
                Round summary <Optional />
                <textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm" maxLength={1000} onChange={(event) => setInterview({ ...interviewValue, roundSummary: event.target.value || null })} value={interviewValue.roundSummary ?? ""} />
              </label>
              <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
                Interview notes <Optional />
                <textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm" maxLength={2000} onChange={(event) => setInterview({ ...interviewValue, notes: event.target.value || null })} value={interviewValue.notes ?? ""} />
              </label>
            </Section>
          ) : null}

          <label className="text-xs font-semibold text-[#616a60] sm:col-span-2">
            Notes <Optional />
            <textarea className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-[#dce3d9] bg-white px-3 py-2.5 text-sm leading-5 text-[#30372f] outline-none focus:border-[#78907d] focus:ring-2 focus:ring-[#cbdacb]" maxLength={2000} onChange={(event) => setNotes(event.target.value)} value={notes} />
          </label>
        </div>

        {evidence.length ? (
          <div className="border-t border-[#edf0eb] bg-[#f8faf6] px-5 py-3.5 sm:px-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7b887b]">Grounded in your message</p>
            <div className="mt-2 space-y-1">{evidence.map((item) => <p className="text-xs text-[#626c62]" key={`${item.fieldPath}-${item.quote}`}>“{item.quote}”</p>)}</div>
          </div>
        ) : null}
        {assumptions.length ? <div className="border-t border-[#edf0eb] bg-[#fcf8ef] px-5 py-3.5 text-xs leading-5 text-[#725e3d] sm:px-6"><strong>Please verify: </strong>{assumptions.join(" ")}</div> : null}

        <div className="border-t border-[#edf0eb] px-5 py-4 sm:px-6">
          {requestError ? <p aria-live="polite" className="mb-3 text-xs leading-5 text-[#9a574a]">{requestError}</p> : null}
          {duplicates ? (
            <div className="mb-3 rounded-xl border border-[#eadcc5] bg-[#fffaf1] p-3 text-xs text-[#705d3e]">
              {duplicates.map((drive) => <div className="flex items-center justify-between gap-3" key={drive.id}><p>{drive.companyName} · {drive.roleTitle}</p>{onUseExisting ? <button className="font-semibold underline" onClick={() => onUseExisting(drive.id)} type="button">Open existing</button> : null}</div>)}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {onDiscard ? (
              <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e1e5df] px-4 text-sm font-semibold text-[#687168]" disabled={Boolean(pendingAction)} onClick={() => void discard()} type="button">
                {pendingAction === "discard" ? <LoaderCircle className="animate-spin" size={15} /> : <Trash2 size={15} />} Discard
              </button>
            ) : null}
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#294435] px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(pendingAction)} type="submit">
              {pendingAction === "save" ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}
              {correction ? "Save audited correction" : mode === "review" ? "Confirm update" : "Save Job Drive"}
            </button>
            {duplicates ? (
              <button className="inline-flex h-10 items-center rounded-xl border border-[#987044] px-4 text-sm font-semibold text-[#77552f] disabled:opacity-50" disabled={Boolean(pendingAction)} onClick={() => void submit(undefined, true)} type="button">Create separately</button>
            ) : null}
          </div>
        </div>
      </form>
    </section>
  );
}
