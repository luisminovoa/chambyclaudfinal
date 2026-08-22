import Link from "next/link";
import { ArrowRight, Sparkles, UserPlus, SearchCheck, Star, BadgeCheck } from "lucide-react";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getCurrentUserAndProfile } from "@/lib/get-current-profile";
import { JobCard } from "@/components/JobCard";
import { HeroSearch } from "@/components/HeroSearch";
import { Reveal } from "@/components/ui/Reveal";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroAnt } from "@/components/brand/HeroAnt";
import { AntIcon } from "@/components/brand/AntIcon";
import { CATEGORIES } from "@/lib/categories";
import { listPublicWorkers } from "@/lib/actions/workers";
import { WorkerDirectoryCard } from "@/components/workers/WorkerDirectoryCard";
import type { JobWithEmployer } from "@/lib/types";

type HomePublicProfile = { id: string; full_name: string; avatar_url: string | null; city: string | null; created_at: string };

export default async function HomePage() {
  const supabase = createClient();

  const [{ user, profile }, { data: jobs }, { data: employerRoleRows }] = await Promise.all([
    getCurrentUserAndProfile(),
    supabase
      .from("jobs")
      .select("*")
      .eq("status", "abierto")
      .order("created_at", { ascending: false })
      .limit(6),
    // "¿Es empleador?" se decide contra user_roles (roles que POSEE la
    // cuenta), no contra profiles.role — mismo criterio ya establecido en
    // getEmployerPublicProfile() (src/lib/actions/employers.ts). La vista
    // public_profiles (0034_harden_profiles_public_access.sql) no
    // proyecta `role`, así que no puede filtrarse por ahí directamente.
    createAdminClient().from("user_roles").select("user_id").eq("role", "employer").eq("active", true),
  ]);

  const jobRows = (jobs as unknown as Omit<JobWithEmployer, "employer">[]) ?? [];
  const employerUserIds = ((employerRoleRows as { user_id: string }[] | null) ?? []).map((r) => r.user_id);

  // El empleador de cada job y los "empleadores destacados" son terceros:
  // se leen de public.public_profiles (0034), nunca de profiles
  // directamente con un embed `profiles!fkey` — la RLS ya no permite
  // resolver eso para alguien que no sea el propio dueño del perfil o un
  // admin, y la vista nunca expone phone/business_ruc.
  const profileIds = [...new Set([...jobRows.map((j) => j.employer_id), ...employerUserIds])];
  const { data: publicProfileRows } =
    profileIds.length > 0
      ? await supabase
          .from("public_profiles")
          .select("id, full_name, avatar_url, city, created_at")
          .in("id", profileIds)
      : { data: [] as unknown[] };
  const publicProfileById = new Map(
    ((publicProfileRows as unknown as HomePublicProfile[]) ?? []).map((p) => [p.id, p])
  );

  const typedJobs: JobWithEmployer[] = jobRows.map((j) => ({
    ...j,
    employer: publicProfileById.get(j.employer_id) ?? null,
  }));
  const typedEmployers = employerUserIds
    .map((id) => publicProfileById.get(id))
    .filter((e): e is HomePublicProfile => Boolean(e))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4);

  // Mismo modo activo que ya usa Navbar/BottomNav/main-nav.ts —
  // profile.role, no un sistema paralelo. worker, admin y visitante sin
  // sesión comparten el comportamiento de trabajador (mismo criterio que
  // getMainNavItems() en src/lib/main-nav.ts). Reimplementado aquí
  // (idéntico a d7cb734, PR #27) porque esta rama parte de un historial
  // distinto al de esa rama — ver informe de Fase 3 para el detalle.
  const isEmployer = profile?.role === "employer";

  // "Trabajadores recomendados" (solo employer): misma fuente que /workers
  // — listPublicWorkers() ya lee de public.public_workers (0037) y ya
  // excluye estructuralmente phone/whatsapp/birth_date/address/district.
  // Sin filtros a propósito (nunca category/city), para que la
  // recomendación no quede fija en una sola ocupación — a diferencia de
  // las tarjetas de "Explora por categoría", que sí filtran deliberadamente.
  // Se pide solo si isEmployer para no gastar la consulta en cada visita
  // de worker/admin/visitante, que nunca ven esta sección.
  const recommendedWorkers = isEmployer ? (await listPublicWorkers({})).slice(0, 6) : [];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-glow" aria-hidden />
        <div
          className="absolute -top-32 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-primary-200/40 blur-3xl"
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-24 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12">
          <div className="text-center lg:text-left">
            <Reveal y={12}>
              <span className="badge border border-primary-100 bg-white/80 text-primary-700 shadow-soft backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" />
                La app peruana de empleos temporales
              </span>
            </Reveal>
            {isEmployer ? (
              <>
                <Reveal delay={0.05}>
                  <h1 className="text-balance mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-6xl lg:mx-0">
                    Encuentra a la{" "}
                    <span className="bg-brand-gradient bg-clip-text text-transparent">
                      persona que necesitas
                    </span>
                  </h1>
                </Reveal>
                <Reveal delay={0.1}>
                  <p className="text-balance mx-auto mt-5 max-w-xl text-base text-ink-muted sm:text-lg lg:mx-0">
                    Publica tu chamba y recibe postulantes de trabajadores verificados, con
                    historial laboral y calificaciones reales.
                  </p>
                </Reveal>
                <Reveal delay={0.15}>
                  <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                    <Link href="/jobs/new" className="btn-primary !px-7 !py-3 text-base">
                      Publicar chamba
                    </Link>
                  </div>
                </Reveal>
              </>
            ) : (
              <>
                <Reveal delay={0.05}>
                  <h1 className="text-balance mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-6xl lg:mx-0">
                    Conecta,{" "}
                    <span className="bg-brand-gradient bg-clip-text text-transparent">chambea</span> y
                    cobra
                  </h1>
                </Reveal>
                <Reveal delay={0.1}>
                  <p className="text-balance mx-auto mt-5 max-w-xl text-base text-ink-muted sm:text-lg lg:mx-0">
                    Encuentra trabajos cerca de ti o publica gratis y contrata rápido y seguro, con
                    historial laboral y calificaciones reales.
                  </p>
                </Reveal>

                <HeroSearch />
              </>
            )}

            <Reveal delay={0.2}>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-ink-muted lg:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-success-500" />
                  Perfiles verificados
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Star className="h-4 w-4 text-sun" />
                  Calificaciones reales
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary-500" />
                  100% gratis
                </span>
              </div>
            </Reveal>
          </div>

          {/* La hormiguita da la bienvenida (solo escritorio para no saturar el móvil) */}
          <Reveal delay={0.15} className="hidden lg:block">
            <HeroAnt />
          </Reveal>
        </div>
      </section>

      {/* Categorías */}
      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6" aria-labelledby="categorias">
        <Reveal>
          <div className="mb-5 flex items-center justify-between">
            <h2 id="categorias" className="section-title">
              Explora por categoría
            </h2>
          </div>
        </Reveal>
        <Reveal>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {CATEGORIES.map((cat) => (
              <Link
                key={cat.name}
                href={
                  isEmployer
                    ? `/workers?category=${encodeURIComponent(cat.name)}`
                    : `/jobs?category=${encodeURIComponent(cat.name)}`
                }
                className="card card-hover group flex flex-col items-center gap-2.5 px-3 py-5"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-gradient group-hover:text-white">
                  <cat.icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-center text-xs font-semibold text-slate-700">{cat.name}</span>
              </Link>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Trabajadores recomendados (employer) / Trabajos recomendados (worker, admin, visitante) */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="recomendados">
        {isEmployer ? (
          <>
            <Reveal>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 id="recomendados" className="section-title">
                    Trabajadores recomendados
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">
                    Encuentra personas con experiencia en distintas ocupaciones.
                  </p>
                </div>
                <Link
                  href="/workers"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            {recommendedWorkers.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendedWorkers.map((worker, i) => (
                  <Reveal key={worker.id} delay={Math.min(i * 0.05, 0.25)}>
                    <WorkerDirectoryCard worker={worker} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <EmptyState
                pose="search"
                title="La hormiguita todavía no encontró trabajadores"
                description="Vuelve pronto — nuevos trabajadores se unen cada día, o revisa el directorio completo."
                actionLabel="Ver directorio completo"
                actionHref="/workers"
              />
            )}
          </>
        ) : (
          <>
            <Reveal>
              <div className="mb-6 flex items-center justify-between">
                <h2 id="recomendados" className="section-title">
                  Trabajos recomendados
                </h2>
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>

            {typedJobs.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {typedJobs.map((job, i) => (
                  <Reveal key={job.id} delay={Math.min(i * 0.05, 0.25)}>
                    <JobCard job={job} currentUserId={user?.id ?? null} viewerRole={profile?.role ?? null} />
                  </Reveal>
                ))}
              </div>
            ) : (
              <EmptyState
                pose="briefcase"
                title="La hormiguita todavía no encontró ninguna chamba"
                description="Sé el primero en publicar una y encuentra al talento ideal en minutos."
                actionLabel="Publicar un trabajo"
                actionHref="/register"
              />
            )}
          </>
        )}
      </section>

      {/* Empleadores destacados */}
      {typedEmployers.length > 0 && (
        <section className="bg-white py-14" aria-labelledby="destacados">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <Reveal>
              <h2 id="destacados" className="section-title mb-6">
                Empleadores destacados
              </h2>
            </Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {typedEmployers.map((emp, i) => (
                <Reveal key={emp.id} delay={Math.min(i * 0.05, 0.2)}>
                  <div className="card card-hover flex flex-col items-center px-4 py-6 text-center">
                    <Avatar name={emp.full_name} src={emp.avatar_url} size="lg" />
                    <p className="mt-3 line-clamp-1 text-sm font-bold text-ink">{emp.full_name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{emp.city ?? "Perú"}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="como-funciona">
        <Reveal>
          <h2 id="como-funciona" className="section-title mb-8 text-center">
            Cómo funciona
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: UserPlus,
              title: "Crea tu perfil",
              text: "Regístrate como trabajador o empleador en menos de un minuto.",
            },
            {
              icon: SearchCheck,
              title: "Busca o publica",
              text: "Filtra por ciudad y oficio, o publica tu vacante en segundos.",
            },
            {
              icon: Star,
              title: "Trabaja y califica",
              text: "Construye tu historial laboral y reputación con cada chamba.",
            },
          ].map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="card card-hover relative overflow-hidden p-6">
                <span className="absolute -right-3 -top-4 text-[88px] font-extrabold leading-none text-primary-50">
                  {i + 1}
                </span>
                <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-glow-sm">
                  <step.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <h3 className="relative mt-4 text-base font-bold text-ink">{step.title}</h3>
                <p className="relative mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-brand-gradient p-8 text-center shadow-lifted sm:p-14">
            <div
              className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <div
              className="absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"
              aria-hidden
            />
            <AntIcon className="absolute -bottom-4 right-6 h-24 w-24 rotate-[-8deg] text-white/15 sm:right-10 sm:h-32 sm:w-32" />
            <h2 className="text-balance relative text-2xl font-extrabold tracking-tight text-white sm:text-4xl">
              Tu próxima oportunidad está a <span className="text-sun">un clic</span>
            </h2>
            <p className="relative mx-auto mt-3 max-w-md text-sm text-white/85 sm:text-base">
              Únete gratis a Chamby y empieza a trabajar o contratar hoy mismo.
            </p>
            <div className="relative mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="btn bg-white !px-7 !py-3 text-base text-primary-700 shadow-soft hover:bg-primary-50"
              >
                Crear cuenta gratis
              </Link>
              <Link
                href="/jobs"
                className="btn border border-white/40 bg-white/10 !px-7 !py-3 text-base text-white backdrop-blur hover:bg-white/20"
              >
                Explorar trabajos
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
