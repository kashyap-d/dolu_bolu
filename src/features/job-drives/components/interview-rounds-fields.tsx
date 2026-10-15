"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";

import {
  MAX_INTERVIEW_ROUNDS,
  interviewModeSchema,
  interviewRoundKindSchema,
  interviewRoundStatusSchema,
  type InterviewRound,
} from "../contracts";
import { roundKindLabels } from "../rounds";
import { toIsoOrNull, toLocalDateTime } from "./datetime-input";

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function newInterviewRound(position: number): InterviewRound {
  return {
    id: crypto.randomUUID(),
    title: `Round ${position}`,
    kind: "other",
    status: "scheduled",
    scheduledAt: null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    mode: "unknown",
    location: null,
    meetingUrl: null,
    notes: null,
  };
}

/**
 * Edits a drive's interview rounds as a list. Field errors arrive keyed by
 * schema path, e.g. "interviewRounds.1.timeZone".
 */
export function InterviewRoundsFields({
  rounds,
  errors,
  disabled,
  onChange,
}: {
  rounds: InterviewRound[];
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (rounds: InterviewRound[]) => void;
}) {
  function update(index: number, changes: Partial<InterviewRound>) {
    onChange(rounds.map((round, position) => (position === index ? { ...round, ...changes } : round)));
  }

  return (
    <fieldset className="space-y-3 rounded-2xl border border-line bg-surface-muted p-4 sm:col-span-2">
      <legend className="px-2 text-[11px] font-bold uppercase tracking-[0.14em] text-subtle">
        Interview rounds
      </legend>
      {rounds.length === 0 ? (
        <p className="px-1 text-xs text-muted">No rounds yet. Add one when it is scheduled or done.</p>
      ) : null}

      {rounds.map((round, index) => {
        const error = (field: string) => errors[`interviewRounds.${index}.${field}`];
        return (
          <fieldset className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2" key={round.id}>
            <legend className="sr-only">{round.title || `Round ${index + 1}`}</legend>
            <Field error={error("title")} label="Round">
              <TextInput
                disabled={disabled}
                invalid={Boolean(error("title"))}
                maxLength={120}
                onChange={(event) => update(index, { title: event.target.value })}
                placeholder="Technical 1, HR, …"
                value={round.title}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind">
                <Select
                  disabled={disabled}
                  onChange={(event) => update(index, { kind: interviewRoundKindSchema.parse(event.target.value) })}
                  value={round.kind}
                >
                  {interviewRoundKindSchema.options.map((kind) => (
                    <option key={kind} value={kind}>{roundKindLabels[kind]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Status">
                <Select
                  disabled={disabled}
                  onChange={(event) => update(index, { status: interviewRoundStatusSchema.parse(event.target.value) })}
                  value={round.status}
                >
                  {interviewRoundStatusSchema.options.map((status) => (
                    <option key={status} value={status}>{capitalize(status)}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field error={error("scheduledAt")} label="When" optional>
              <TextInput
                disabled={disabled}
                invalid={Boolean(error("scheduledAt"))}
                onChange={(event) => update(index, { scheduledAt: toIsoOrNull(event.target.value) })}
                type="datetime-local"
                value={toLocalDateTime(round.scheduledAt)}
              />
            </Field>
            <Field error={error("timeZone")} label="Time zone" optional>
              <TextInput
                disabled={disabled}
                invalid={Boolean(error("timeZone"))}
                maxLength={80}
                onChange={(event) => update(index, { timeZone: event.target.value || null })}
                placeholder="Asia/Kolkata"
                value={round.timeZone ?? ""}
              />
            </Field>
            <Field label="Mode">
              <Select
                disabled={disabled}
                onChange={(event) => update(index, { mode: interviewModeSchema.parse(event.target.value) })}
                value={round.mode}
              >
                {interviewModeSchema.options.map((mode) => (
                  <option key={mode} value={mode}>{capitalize(mode)}</option>
                ))}
              </Select>
            </Field>
            <Field error={error("location")} label="Location" optional>
              <TextInput
                disabled={disabled}
                maxLength={240}
                onChange={(event) => update(index, { location: event.target.value || null })}
                value={round.location ?? ""}
              />
            </Field>
            <Field className="sm:col-span-2" error={error("meetingUrl")} label="Meeting link" optional>
              <TextInput
                disabled={disabled}
                invalid={Boolean(error("meetingUrl"))}
                onChange={(event) => update(index, { meetingUrl: event.target.value || null })}
                type="url"
                value={round.meetingUrl ?? ""}
              />
            </Field>
            <Field className="sm:col-span-2" label="Notes" optional>
              <TextArea
                disabled={disabled}
                maxLength={2000}
                onChange={(event) => update(index, { notes: event.target.value || null })}
                value={round.notes ?? ""}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                disabled={disabled}
                onClick={() => onChange(rounds.filter((_, position) => position !== index))}
                size="sm"
                variant="ghost"
              >
                <Trash2 size={14} /> Remove {round.title || "round"}
              </Button>
            </div>
          </fieldset>
        );
      })}

      <Button
        disabled={disabled || rounds.length >= MAX_INTERVIEW_ROUNDS}
        onClick={() => onChange([...rounds, newInterviewRound(rounds.length + 1)])}
        size="sm"
        variant="secondary"
      >
        <Plus size={14} /> Add round
      </Button>
    </fieldset>
  );
}
