import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  applicationRecordSchema,
  type ApplicationConfirmationPayload,
  type ApplicationRecord,
  type ApplicationUpdatePayload,
} from "@/features/applications/contracts";

const applicationSelect =
  "id, company_name, role_title, status, applied_at, source_url, notes, created_at, updated_at";

const applicationRowSchema = z.object({
  id: z.uuid(),
  company_name: z.string(),
  role_title: z.string(),
  status: z.string(),
  applied_at: z.string().nullable(),
  source_url: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

function toApplicationRecord(row: z.infer<typeof applicationRowSchema>) {
  return applicationRecordSchema.parse({
    id: row.id,
    companyName: row.company_name,
    roleTitle: row.role_title,
    status: row.status,
    appliedAt: row.applied_at,
    sourceUrl: row.source_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class ApplicationRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationRepositoryError";
  }
}

export class ApplicationConflictError extends Error {
  constructor(
    message = "This application changed in another session. Refresh and try again.",
  ) {
    super(message);
    this.name = "ApplicationConflictError";
  }
}

export class ApplicationNotFoundError extends Error {
  constructor() {
    super("Application not found.");
    this.name = "ApplicationNotFoundError";
  }
}

function payloadMatchesRecord(
  record: ApplicationRecord,
  payload: ApplicationConfirmationPayload,
) {
  const datesMatch =
    record.appliedAt === payload.appliedAt ||
    (record.appliedAt !== null &&
      payload.appliedAt !== null &&
      new Date(record.appliedAt).getTime() ===
        new Date(payload.appliedAt).getTime());

  return (
    record.companyName === payload.companyName &&
    record.roleTitle === payload.roleTitle &&
    record.status === payload.status &&
    datesMatch &&
    record.sourceUrl === payload.sourceUrl &&
    record.notes === payload.notes
  );
}

function toApplicationRow(
  userId: string,
  payload: ApplicationConfirmationPayload | ApplicationUpdatePayload,
) {
  return {
    user_id: userId,
    company_name: payload.companyName,
    role_title: payload.roleTitle,
    status: payload.status,
    applied_at: payload.appliedAt,
    source_url: payload.sourceUrl,
    notes: payload.notes,
  };
}

async function findApplication(
  supabase: SupabaseClient,
  userId: string,
  applicationId: string,
) {
  const { data, error } = await supabase
    .from("applications")
    .select(applicationSelect)
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new ApplicationRepositoryError("Could not load the application.");
  }

  if (!data) return null;
  const parsed = applicationRowSchema.safeParse(data);

  if (!parsed.success) {
    throw new ApplicationRepositoryError("Stored application data is invalid.");
  }

  return toApplicationRecord(parsed.data);
}

export async function listApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from("applications")
    .select(applicationSelect)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new ApplicationRepositoryError("Could not load applications.");

  const parsed = z.array(applicationRowSchema).safeParse(data);
  if (!parsed.success) {
    throw new ApplicationRepositoryError("Stored application data is invalid.");
  }

  return parsed.data.map(toApplicationRecord);
}

export async function createManualApplication(
  supabase: SupabaseClient,
  userId: string,
  input: {
    applicationId: string;
    application: ApplicationConfirmationPayload;
  },
): Promise<{
  outcome: "created" | "already_created";
  application: ApplicationRecord;
}> {
  const existing = await findApplication(supabase, userId, input.applicationId);

  if (existing) {
    if (!payloadMatchesRecord(existing, input.application)) {
      throw new ApplicationConflictError(
        "This application ID was already used for different details.",
      );
    }

    return { outcome: "already_created", application: existing };
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      id: input.applicationId,
      ...toApplicationRow(userId, input.application),
    })
    .select(applicationSelect)
    .single();

  if (error || !data) {
    const racedApplication = await findApplication(
      supabase,
      userId,
      input.applicationId,
    );

    if (
      racedApplication &&
      payloadMatchesRecord(racedApplication, input.application)
    ) {
      return { outcome: "already_created", application: racedApplication };
    }

    if (racedApplication) {
      throw new ApplicationConflictError(
        "This application ID was already used for different details.",
      );
    }

    throw new ApplicationRepositoryError("Could not create the application.");
  }

  const parsed = applicationRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApplicationRepositoryError("Created application data is invalid.");
  }

  return { outcome: "created", application: toApplicationRecord(parsed.data) };
}

export async function updateApplication(
  supabase: SupabaseClient,
  userId: string,
  input: {
    applicationId: string;
    expectedUpdatedAt: string;
    application: ApplicationUpdatePayload;
  },
): Promise<ApplicationRecord> {
  const { data, error } = await supabase
    .from("applications")
    .update(toApplicationRow(userId, input.application))
    .eq("id", input.applicationId)
    .eq("user_id", userId)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(applicationSelect)
    .maybeSingle();

  if (error) {
    throw new ApplicationRepositoryError("Could not update the application.");
  }

  if (!data) {
    const existing = await findApplication(supabase, userId, input.applicationId);
    if (existing) throw new ApplicationConflictError();
    throw new ApplicationNotFoundError();
  }

  const parsed = applicationRowSchema.safeParse(data);
  if (!parsed.success) {
    throw new ApplicationRepositoryError("Updated application data is invalid.");
  }

  return toApplicationRecord(parsed.data);
}

export async function listApplicationContext(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("applications")
    .select("id, company_name, role_title, status")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw new ApplicationRepositoryError("Could not load application context.");

  const parsed = z.array(z.object({
    id: z.uuid(),
    company_name: z.string(),
    role_title: z.string(),
    status: z.string(),
  })).safeParse(data);

  if (!parsed.success) {
    throw new ApplicationRepositoryError("Application context is invalid.");
  }

  return parsed.data.map((row) => ({
    ref: `application:${row.id}`,
    companyName: row.company_name,
    roleTitle: row.role_title,
    status: row.status,
  }));
}
