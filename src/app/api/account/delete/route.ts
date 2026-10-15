import { deleteAccountRequestSchema } from "@/features/account/contracts";
import { authenticatedJsonRoute, jsonError, unauthenticated } from "@/server/http";
import { deleteAccount } from "@/server/repositories/account-repository";

export const POST = authenticatedJsonRoute(
  {
    schema: deleteAccountRequestSchema,
    invalidMessage: "Type the confirmation phrase exactly to delete your account.",
    unavailableMessage: "Your account could not be deleted.",
  },
  async ({ auth, body }) => {
    const outcome = await deleteAccount(auth.supabase, body.confirmation);
    if (outcome === "auth_required") return unauthenticated();
    if (outcome === "confirmation_required") {
      return jsonError(400, "Type the confirmation phrase exactly to delete your account.");
    }
    // The user no longer exists; clear this browser's session cookies.
    await auth.supabase.auth.signOut({ scope: "local" });
    return Response.json({ outcome: "deleted" });
  },
);
