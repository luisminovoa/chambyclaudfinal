import { History } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ModerationAction, ModerationActionType, Profile } from "@/lib/types";

const ACTION_LABELS: Record<ModerationActionType, string> = {
  status_changed: "Cambio de estado",
  note_added: "Nota",
  warning_issued: "Advertencia",
  temporary_suspension: "Suspensión",
  permanent_block: "Bloqueo",
  account_deactivated: "Cuenta desactivada",
  no_action: "Sin acción",
};

interface Props {
  actions: (ModerationAction & { admin: Pick<Profile, "id" | "full_name"> | null })[];
}

/** Historial append-only — no hay ningún botón de editar/eliminar aquí, coherente con moderation_actions (sin policy UPDATE/DELETE). */
export function AdminModerationHistory({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="card p-5 text-center text-sm text-ink-muted">
        Todavía no hay acciones de moderación registradas para este reporte.
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-ink">
        <History className="h-4 w-4" />
        Historial de moderación
      </h2>
      <div className="space-y-3">
        {actions.map((a) => (
          <div key={a.id} className="rounded-2xl bg-slate-50 p-3 text-xs text-ink-muted">
            <p>
              <strong className="text-ink">{a.admin?.full_name ?? "Admin"}</strong> registró{" "}
              <strong className="text-ink">{ACTION_LABELS[a.action_type]}</strong> el{" "}
              {formatDate(a.created_at)}
            </p>
            {a.reason && <p className="mt-1 text-ink">{a.reason}</p>}
            {a.metadata && Object.keys(a.metadata).length > 0 && (
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                {JSON.stringify(a.metadata)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
