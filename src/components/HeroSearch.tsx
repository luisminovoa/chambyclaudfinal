"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MapPin } from "lucide-react";

export function HeroSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    router.push(`/jobs${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      role="search"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto mt-8 flex w-full max-w-2xl flex-col gap-2 rounded-3xl border border-white/60 bg-white/80 p-2 shadow-lifted backdrop-blur-xl sm:flex-row sm:items-center sm:rounded-full"
    >
      <div className="flex flex-1 items-center gap-2 rounded-2xl px-4 py-2 sm:rounded-full">
        <Search className="h-5 w-5 shrink-0 text-primary-500" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="¿Qué chamba buscas? Ej. electricista..."
          aria-label="Buscar trabajo"
          className="w-full bg-transparent py-2 text-sm font-medium text-ink placeholder:text-slate-400 focus:outline-none focus-visible:ring-0"
        />
      </div>
      <div className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden />
      <div className="flex flex-1 items-center gap-2 rounded-2xl px-4 py-2 sm:max-w-[200px] sm:rounded-full">
        <MapPin className="h-5 w-5 shrink-0 text-primary-500" aria-hidden />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ciudad"
          aria-label="Ciudad"
          className="w-full bg-transparent py-2 text-sm font-medium text-ink placeholder:text-slate-400 focus:outline-none focus-visible:ring-0"
        />
      </div>
      <button type="submit" className="btn-primary sm:!rounded-full sm:!px-7">
        Buscar
      </button>
    </motion.form>
  );
}
