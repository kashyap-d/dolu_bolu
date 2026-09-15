import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  applicationRecordSchema,
  type ApplicationRecord,
} from "@/features/applications/contracts";

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

export async function listApplications(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApplicationRecord[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("id, company_name, role_title, status, applied_at, source_url, notes, created_at, updated_at")
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
