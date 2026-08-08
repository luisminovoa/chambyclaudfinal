import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import type { AdminUserProfileDetail } from "@/lib/actions/admin";
import type { AvailabilityStatus } from "@/lib/types";

const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  inmediata: "Disponibilidad inmediata",
  una_semana: "Disponible en una semana",
  un_mes: "Disponible en un mes",
  no_disponible: "No disponible por ahora",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

/**
 * Información personal + perfil profesional. `email` viene de Supabase
 * Auth (getAdminUserProfile ya lo resolvió server-side vía la Admin API,
 * profiles no tiene columna email). Campos que el modelo actual no
 * almacena (nombre de usuario, subcategoría) se omiten en vez de
 * inventarse — ver limitaciones documentadas en el resumen de entrega.
 */
export function AdminProfileOverview({ data }: { data: AdminUserProfileDetail }) {
  const { profile, email, workerDetails, experience } = data;

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="mb-4 text-sm font-bold text-ink">Información personal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" value={profile.full_name} />
          <Field label="Email" value={email ?? "No disponible"} />
          <Field label="Teléfono" value={profile.phone} />
          <Field
            label="Ubicación"
            value={[profile.city, workerDetails?.district].filter(Boolean).join(", ") || null}
          />
          <Field label="Fecha de registro" value={formatDate(profile.created_at)} />
          <Field
            label="Estado de cuenta"
            value={
              <Badge tone={profile.is_active ? "success" : "danger"}>
                {profile.is_active ? "Activo" : "Suspendido"}
              </Badge>
            }
          />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-bold text-ink">Perfil profesional</h2>
        {!profile.category && !workerDetails?.professional_title && !profile.bio && experience.length === 0 ? (
          <p className="text-sm text-ink-muted">Este usuario todavía no completó su perfil profesional.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Profesión / oficio" value={workerDetails?.professional_title ?? profile.category} />
              <Field label="Categoría" value={profile.category} />
              <Field
                label="Años de experiencia"
                value={workerDetails?.years_experience != null ? `${workerDetails.years_experience} años` : null}
              />
              <Field
                label="Disponibilidad"
                value={workerDetails?.availability ? AVAILABILITY_LABELS[workerDetails.availability] : null}
              />
            </div>

            <Field label="Descripción" value={profile.bio} />

            {profile.skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Habilidades</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <Badge key={skill} tone="primary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {experience.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  Experiencia laboral
                </p>
                <div className="space-y-3">
                  {experience.map((exp) => (
                    <div key={exp.id} className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-ink">{exp.job_title}</p>
                      <p className="text-xs text-ink-muted">{exp.company}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
