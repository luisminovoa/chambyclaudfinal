import { createClient } from "@/lib/supabase/server";
import { AdminUserRow } from "@/components/AdminUserRow";
import type { Profile } from "@/lib/types";

export default async function AdminUsersPage() {
  const supabase = createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  const typedProfiles = (profiles as Profile[]) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Usuarios</h1>
      <p className="mt-1 text-slate-500">Gestiona roles y estado de las cuentas.</p>

      <div className="mt-6 card overflow-x-auto p-6">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-400">
              <th className="pb-2 font-medium">Usuario</th>
              <th className="pb-2 font-medium">Rol</th>
              <th className="pb-2 font-medium">Registrado</th>
              <th className="pb-2 text-right font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {typedProfiles.map((p) => (
              <AdminUserRow key={p.id} profile={p} />
            ))}
          </tbody>
        </table>
        {typedProfiles.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">No hay usuarios registrados.</p>
        )}
      </div>
    </div>
  );
}
