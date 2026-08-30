"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, MapPin, LayoutGrid, Clock, X, ChevronDown } from "lucide-react";
import { AVAILABILITY_LABELS, AVAILABILITY_VALUES } from "@/lib/types";
import type { AvailabilityStatus } from "@/lib/types";
import { CITY_NAMES } from "@/lib/cities";
import { LocationSelector } from "@/components/ui/LocationSelector";

/**
 * Filtros del directorio de trabajadores (/workers). Mismo patrón visual
 * y de manejo de searchParams que SearchFilters.tsx (/jobs) — no se
 * reutiliza ese componente directamente porque sus campos no coinciden
 * (disponibilidad no existe en /jobs, y "categoría" en /jobs es un
 * catálogo cerrado distinto del de trabajadores en este contexto), pero
 * se sigue la misma convención de UI en vez de inventar una nueva.
 */
export function WorkerSearchFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [availability, setAvailability] = useState(searchParams.get("availability") ?? "");
  // Ubicación jerárquica (Fase 6, C4-G18) — convive con `city` (arriba),
  // que sigue siendo el mecanismo de compatibilidad para datos legacy.
  const [department, setDepartment] = useState(searchParams.get("department") ?? "");
  const [province, setProvince] = useState(searchParams.get("province") ?? "");
  const [district, setDistrict] = useState(searchParams.get("district") ?? "");

  const hasFilters = Boolean(q || city || category || availability || department || province || district);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    if (availability) params.set("availability", availability);
    if (department) params.set("department", department);
    if (province) params.set("province", province);
    if (district) params.set("district", district);
    router.push(`${pathname}${params.size ? `?${params.toString()}` : ""}`);
  }

  function clearFilters() {
    setQ("");
    setCity("");
    setCategory("");
    setAvailability("");
    setDepartment("");
    setProvince("");
    setDistrict("");
    router.push(pathname);
  }

  return (
    <form
      onSubmit={applyFilters}
      role="search"
      className="card flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:p-5"
    >
      <div className="flex-1 sm:min-w-[180px]">
        <label htmlFor="worker-filter-q" className="label">
          Buscar
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="worker-filter-q"
            className="input !pl-11"
            placeholder="Nombre, oficio, especialidad..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1 sm:min-w-[160px]">
        <label htmlFor="worker-filter-category" className="label">
          Categoría
        </label>
        <div className="relative">
          <LayoutGrid className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            id="worker-filter-category"
            className="input cursor-pointer appearance-none !pl-11 pr-10"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
      <div className="flex-1 sm:min-w-[160px]">
        <label htmlFor="worker-filter-city" className="label">
          Ciudad
        </label>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            id="worker-filter-city"
            className="input cursor-pointer appearance-none !pl-11 pr-10"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            <option value="">Todas las ciudades</option>
            {CITY_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
      <div className="flex-1 sm:min-w-[190px]">
        <label htmlFor="worker-filter-availability" className="label">
          Disponibilidad
        </label>
        <div className="relative">
          <Clock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            id="worker-filter-availability"
            className="input cursor-pointer appearance-none !pl-11 pr-10"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">Cualquier disponibilidad</option>
            {AVAILABILITY_VALUES.map((a: AvailabilityStatus) => (
              <option key={a} value={a}>
                {AVAILABILITY_LABELS[a]}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
      <div className="w-full sm:basis-full">
        <LocationSelector
          department={department}
          province={province}
          district={district}
          onChange={(next) => {
            setDepartment(next.department);
            setProvince(next.province);
            setDistrict(next.district);
          }}
          idPrefix="worker-filter-location"
        />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 sm:flex-none">
          Buscar
        </button>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="btn-ghost" aria-label="Limpiar filtros">
            <X className="h-4 w-4" />
            Limpiar
          </button>
        )}
      </div>
    </form>
  );
}
