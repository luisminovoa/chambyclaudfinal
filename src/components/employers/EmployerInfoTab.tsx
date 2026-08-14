"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Clock } from "lucide-react";
import { useToast } from "@/components/ui/Toaster";
import { Badge } from "@/components/ui/Badge";
import { updateProfile } from "@/lib/actions/profile";
import type { EmployerType, Profile } from "@/lib/types";

type EmployerProfileFields = Pick<
  Profile,
  | "full_name"
  | "phone"
  | "city"
  | "district"
  | "bio"
  | "employer_type"
  | "business_name"
  | "business_sector"
  | "business_description"
  | "business_ruc"
>;

interface EmployerInfoTabProps {
  profile: Profile;
  /** true si existe un documento RUC verificado (verification_documents) — determina el badge "RUC verificado" vs "RUC pendiente de verificación". */
  rucVerified: boolean;
  onSaved: (updated: EmployerProfileFields) => void;
}

const EMPLOYER_TYPE_OPTIONS: { value: EmployerType; label: string }[] = [
  { value: "individual", label: "Persona" },
  { value: "company", label: "Empresa" },
];

/**
 * Información del empleador — deliberadamente más corta que InfoTab.tsx
 * (worker): sin categoría, habilidades ni los campos de
 * worker_profile_details, que no aplican a un empleador. Reutiliza
 * updateProfile() (src/lib/actions/profile.ts), la misma Server Action
 * que ya usa el trabajador — ahora también acepta full_name, district y
 * los campos de identidad empresarial (0030).
 */
export function EmployerInfoTab({ profile, rucVerified, onSaved }: EmployerInfoTabProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [district, setDistrict] = useState(profile.district ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");

  const [employerType, setEmployerType] = useState<EmployerType | "">(
    profile.employer_type ?? ""
  );
  const [businessName, setBusinessName] = useState(profile.business_name ?? "");
  const [businessSector, setBusinessSector] = useState(profile.business_sector ?? "");
  const [businessDescription, setBusinessDescription] = useState(
    profile.business_description ?? ""
  );
  const [businessRuc, setBusinessRuc] = useState(profile.business_ruc ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast("El nombre no puede estar vacío.", "error");
      return;
    }
    if (businessRuc.trim() && !/^\d{11}$/.test(businessRuc.trim())) {
      toast("El RUC debe tener 11 dígitos.", "error");
      return;
    }

    const fd = new FormData();
    fd.set("full_name", trimmedName);
    fd.set("phone", phone);
    fd.set("city", city);
    fd.set("district", district);
    fd.set("bio", bio);
    fd.set("employer_type", employerType);
    fd.set("business_name", businessName);
    fd.set("business_sector", businessSector);
    fd.set("business_description", businessDescription);
    fd.set("business_ruc", businessRuc);

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
          district: district.trim() || null,
          bio: bio.trim() || null,
          employer_type: (employerType || null) as EmployerType | null,
          business_name: businessName.trim() || null,
          business_sector: businessSector.trim() || null,
          business_description: businessDescription.trim() || null,
          business_ruc: businessRuc.trim() || null,
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

          <div>
            <label htmlFor="employer_district" className="label">
              Distrito
            </label>
            <input
              id="employer_district"
              type="text"
              className="input w-full"
              placeholder="Los Olivos, Miraflores, Surco…"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              maxLength={100}
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

      <div className="card p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-bold text-ink">Información empresarial</h3>
        <p className="mb-5 text-xs text-ink-muted">
          Ayuda a los trabajadores a saber si publican para una persona natural o una
          empresa, y a qué se dedica.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="employer_type" className="label">
              Tipo de empleador
            </label>
            <select
              id="employer_type"
              className="input w-full"
              value={employerType}
              onChange={(e) => setEmployerType(e.target.value as EmployerType | "")}
            >
              <option value="">Sin especificar</option>
              {EMPLOYER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="business_name" className="label">
              Nombre comercial o razón social
            </label>
            <input
              id="business_name"
              type="text"
              className="input w-full"
              placeholder="Ej: Ferretería Don Jose SAC"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={150}
            />
          </div>

          <div>
            <label htmlFor="business_sector" className="label">
              Rubro/sector
            </label>
            <input
              id="business_sector"
              type="text"
              className="input w-full"
              placeholder="Ej: Ferretería, construcción, limpieza…"
              value={businessSector}
              onChange={(e) => setBusinessSector(e.target.value)}
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="business_description" className="label">
              Descripción empresarial
            </label>
            <textarea
              id="business_description"
              rows={4}
              className="input w-full resize-none"
              placeholder="Ej: Empresa familiar con más de 10 años en el rubro ferretero..."
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              maxLength={1000}
            />
            <p className="mt-1 text-right text-xs text-ink-muted">
              {businessDescription.length}/1000
            </p>
          </div>

          <div>
            <label htmlFor="business_ruc" className="label">
              RUC
            </label>
            <input
              id="business_ruc"
              type="text"
              inputMode="numeric"
              className="input w-full"
              placeholder="20123456789"
              value={businessRuc}
              onChange={(e) => setBusinessRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
              maxLength={11}
            />
            <div className="mt-2">
              {businessRuc.trim() ? (
                rucVerified ? (
                  <Badge tone="success" className="items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    RUC verificado
                  </Badge>
                ) : (
                  <Badge tone="warning" className="items-center gap-1">
                    <Clock className="h-3 w-3" />
                    RUC pendiente de verificación
                  </Badge>
                )
              ) : (
                <p className="text-xs text-ink-muted">
                  Este RUC es declarado por ti. Para verificarlo, sube el documento en la
                  pestaña &quot;Verificación&quot;.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending} className="btn-primary w-full sm:w-auto">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
