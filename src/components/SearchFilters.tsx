"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, MapPin, LayoutGrid, X, ChevronDown } from "lucide-react";
import { LocationSelector } from "@/components/ui/LocationSelector";

export function SearchFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  // Ubicación jerárquica (Fase 6, C4-G18) — convive con `city` (arriba),
  // que sigue siendo el mecanismo de compatibilidad para datos legacy.
  const [department, setDepartment] = useState(searchParams.get("department") ?? "");
  const [province, setProvince] = useState(searchParams.get("province") ?? "");
  const [district, setDistrict] = useState(searchParams.get("district") ?? "");

  const hasFilters = Boolean(city || category || q || department || province || district);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (department) params.set("department", department);
    if (province) params.set("province", province);
    if (district) params.set("district", district);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    setCity("");
    setCategory("");
    setQ("");
    setDepartment("");
    setProvince("");
    setDistrict("");
    router.push(pathname);
  }

  return (
    <form
      onSubmit={applyFilters}
      role="search"
      className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5"
    >
      <div className="flex-1">
        <label htmlFor="filter-q" className="label">
          Palabra clave
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="filter-q"
            className="input !pl-11"
            placeholder="Ej. electricista, cocinero..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1">
        <label htmlFor="filter-city" className="label">
          Ciudad
        </label>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="filter-city"
            className="input !pl-11"
            placeholder="Ej. Lima, Arequipa..."
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
      </div>
      <div className="flex-1">
        <label htmlFor="filter-category" className="label">
          Puesto / categoría
        </label>
        <div className="relative">
          <LayoutGrid className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            id="filter-category"
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
          idPrefix="job-filter-location"
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
