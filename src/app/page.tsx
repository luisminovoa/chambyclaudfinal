import Link from "next/link";
import { ArrowRight, Sparkles, UserPlus, SearchCheck, Star, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { JobCard } from "@/components/JobCard";
import { HeroSearch } from "@/components/HeroSearch";
import { Reveal } from "@/components/ui/Reveal";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroAnt } from "@/components/brand/HeroAnt";
import { AntIcon } from "@/components/brand/AntIcon";
import { CATEGORIES } from "@/lib/categories";
import type { JobWithEmployer, Profile } from "@/lib/types";

export default async function HomePage() {
  const supabase = createClient();

  const [{ data: jobs }, { data: employers }] = await Promise.all([
    supabase
      .from("jobs")
      .select("*, employer:profiles!jobs_employer_id_fkey(id, full_name, avatar_url, city)")
      .eq("status", "abierto")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "employer")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const typedJobs = (jobs as unknown as JobWithEmployer[]) ?? [];
  const typedEmployers = (employers as unknown as Profile[]) ?? [];

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
                href={`/jobs?category=${encodeURIComponent(cat.name)}`}
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

      {/* Trabajos recomendados */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="recomendados">
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
                <JobCard job={job} />
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
