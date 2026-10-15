import { authenticatedRoute } from "@/server/http";
import { exportAccountData } from "@/server/repositories/account-repository";

export const GET = authenticatedRoute(
  { unavailableMessage: "Your data could not be exported." },
  async ({ auth }) => {
    const data = await exportAccountData(auth.supabase, auth.principal.id);
    const date = data.exportedAt.slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dolu-bolu-export-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
