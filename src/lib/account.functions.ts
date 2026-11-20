import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deletes the signed-in person's data (database function, which also applies the household leadership rule),
 * then their login. The login is removed last so a failure leaves the person able to try again.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.rpc("delete_my_data");
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: e2 } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (e2) throw new Error(e2.message);
    return { ok: true as const };
  });
