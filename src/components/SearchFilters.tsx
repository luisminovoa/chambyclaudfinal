"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

export function SearchFilters({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [city, setCity] = useState(searchParams.get("city") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearFilters() {
    setCity("");
    setCategory("");
    setQ("");
    router.push(pathname);
  }

  return (
    <form onSubmit={applyFilters} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="label">Palabra clave</label>
        <input
          className="input"
          placeholder="Ej. electricista, cocinero..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="flex-1">
        <label className="label">Ciudad</label>
        <input
          className="input"
          placeholder="Ej. Lima, Arequipa..."
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      <div className="flex-1">
        <label className="label">Puesto / categoría</label>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="btn-primary">
          Buscar
        </button>
        <button type="button" onClick={clearFilters} className="btn-ghost">
          Limpiar
        </button>
      </div>
    </form>
  );
}
