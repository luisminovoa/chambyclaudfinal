"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { updateProfile } from "@/lib/actions/profile";
import type { Profile } from "@/lib/types";

interface EmployerInfoTabProps {
  profile: Profile;
  onSaved: (updated: Pick<Profile, "full_name" | "phone" | "city" | "bio">) => void;
}

/**
 * Información básica del empleador — deliberadamente más corta que
 * InfoTab.tsx (worker): sin categoría, habilidades ni los campos de
 * worker_profile_details, que no aplican a un empleador. Reutiliza
 * updateProfile() (src/lib/actions/profile.ts), la misma Server Action
 * que ya usa el trabajador — ahora también acepta full_name.
 */
export function EmployerInfoTab({ profile, onSaved }: EmployerInfoTabProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast("El nombre no puede estar vacío.", "error");
      return;
    }

    const fd = new FormData();
    fd.set("full_name", trimmedName);
    fd.set("phone", phone);
    fd.set("city", city);
    fd.set("bio", bio);

    startTransition(async () => {
      const result = await updateProfile(fd);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        setFullName(trimmedName);
        onSaved({
          full_name: trimmedName,
          phone: phone.trim() || null,
          city: city.trim() || null,
          bio: bio.trim() || null,
        });
        toast("Perfil actualizado correctamente", "success");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-bold text-ink">Información del perfil</h3>
        <p className="mb-5 text-xs text-ink-muted">
          Esta información ayuda a los trabajadores a conocerte antes de postular.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="employer_full_name" className="label">
              Nombre
            </label>
            <input
              id="employer_full_name"
              type="text"
              className="input w-full"
              placeholder="Tu nombre o el de tu negocio"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div>
            <label htmlFor="employer_phone" className="label">
              Teléfono
            </label>
            <input
              id="employer_phone"
              type="tel"
              inputMode="tel"
              className="input w-full"
              placeholder="+51 999 999 999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="employer_city" className="label">
              Ciudad
            </label>
            <input
              id="employer_city"
              type="text"
              className="input w-full"
              placeholder="Lima, Arequipa, Trujillo…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-bold text-ink">Sobre nosotros</h3>
        <p className="mb-4 text-xs text-ink-muted">
          Cuéntales a los trabajadores quién eres, qué tipo de trabajos publicas y qué
          pueden esperar al trabajar contigo.
        </p>
        <textarea
          id="employer_bio"
          rows={5}
          className="input w-full resize-none"
          placeholder="Ej: Somos una ferretería familiar en Los Olivos, buscamos ayudantes confiables para..."
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={500}
        />
        <p className="mt-1 text-right text-xs text-ink-muted">{bio.length}/500</p>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending} className="btn-primary w-full sm:w-auto">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
