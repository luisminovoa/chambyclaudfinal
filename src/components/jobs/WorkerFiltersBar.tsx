"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { CATEGORY_NAMES } from "@/lib/categories";

type Filters = {
  q?: string;
  category?: string;
  city?: string;
  district?: string;
  pay_type?: string;
  urgency?: string;
  pay_min?: string;
  pay_max?: string;
  date_from?: string;
  sort?: string;
};

export function WorkerFiltersBar({
  initialFilters,
}: {
  initialFilters: Filters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(
    Object.keys(initialFilters).some((k) =>
      ["category", "district", "pay_type", "urgency", "pay_min", "pay_max", "date_from"].includes(k)
    )
  );

  function set(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function apply(overrides?: Partial<Filters>) {
    const merged = { ...filters, ...overrides };
    const params = new URLSearchParams();
    (Object.entries(merged) as [string, string | undefined][]).forEach(
      ([k, v]) => {
        if (v) params.set(k, v);
      }
    );
    router.push(`${pathname}?${params.toString()}`);
  }

  function clear() {
    setFilters({});
    router.push(pathname);
  }

  const hasActive = Object.values(filters).some(Boolean);

  return (
    <div className="card p-4 space-y-3">
      {/* Primary row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Buscar trabajos..."
            value={filters.q ?? ""}
            onChange={(e) => set("q", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
        </div>
        <select
          className="input w-auto"
          value={filters.sort ?? ""}
          onChange={(e) => {
            set("sort", e.target.value);
            apply({ sort: e.target.value || undefined });
          }}
        >
          <option value="">Más recientes</option>
          <option value="pay_desc">Mejor pagados</option>
          <option value="urgente">Más urgentes</option>
          <option value="compatibility">Mayor compatibilidad</option>
        </select>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className={`btn-secondary shrink-0 ${showAdvanced ? "ring-2 ring-primary-400" : ""}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filtros</span>
        </button>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label">Categoría</label>
            <select
              className="input"
              value={filters.category ?? ""}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Todas</option>
              {CATEGORY_NAMES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input
              type="text"
              className="input"
              placeholder="Lima, Arequipa..."
              value={filters.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
          </div>
          <div>
            <label className="label">Distrito</label>
            <input
              type="text"
              className="input"
              placeholder="Miraflores, Surco..."
              value={filters.district ?? ""}
              onChange={(e) => set("district", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
          </div>
          <div>
            <label className="label">Tipo de pago</label>
            <select
              className="input"
              value={filters.pay_type ?? ""}
              onChange={(e) => set("pay_type", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="por_hora">Por hora</option>
              <option value="por_dia">Por día</option>
              <option value="fijo">Monto fijo</option>
            </select>
          </div>
          <div>
            <label className="label">Urgencia</label>
            <select
              className="input"
              value={filters.urgency ?? ""}
              onChange={(e) => set("urgency", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="urgente">Solo urgentes</option>
              <option value="normal">Solo normales</option>
            </select>
          </div>
          <div>
            <label className="label">Pago mínimo (S/)</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder="0"
              value={filters.pay_min ?? ""}
              onChange={(e) => set("pay_min", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Pago máximo (S/)</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder="Sin límite"
              value={filters.pay_max ?? ""}
              onChange={(e) => set("pay_max", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Fecha desde</label>
            <input
              type="date"
              className="input"
              value={filters.date_from ?? ""}
              onChange={(e) => set("date_from", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-2">
        {hasActive && (
          <button
            type="button"
            onClick={clear}
            className="btn-ghost gap-1 text-sm"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
        <button
          type="button"
          onClick={() => apply()}
          className="btn-primary ml-auto"
        >
          <Search className="h-4 w-4" />
          Buscar
        </button>
      </div>
    </div>
  );
}
