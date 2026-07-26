import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AdminUserRow } from "@/components/AdminUserRow";
import { Reveal } from "@/components/ui/Reveal";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const typedProfiles = (profiles as Profile[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <Reveal>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">Usuarios</h1>
        <p className="mt-1 text-ink-muted">Gestiona roles y estado de las cuentas.</p>
      </Reveal>

      <Reveal delay={0.05}>
        <div className="card mt-6 overflow-x-auto p-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-3 font-semibold">Usuario</th>
                <th className="pb-3 font-semibold">Rol</th>
                <th className="pb-3 font-semibold">Registrado</th>
                <th className="pb-3 text-right font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {typedProfiles.map((p) => (
                <AdminUserRow key={p.id} profile={p} />
              ))}
            </tbody>
          </table>
          {typedProfiles.length === 0 && (
            <EmptyState
              icon={Users}
              title="No hay usuarios registrados"
              description="Cuando alguien se registre en la plataforma, aparecerá aquí."
            />
          )}
        </div>
      </Reveal>
    </div>
  );
}
