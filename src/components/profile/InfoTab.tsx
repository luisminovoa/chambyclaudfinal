"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";
import { updateProfile, upsertWorkerProfileDetails } from "@/lib/actions/profile";
import { refreshProfileStats } from "@/lib/profile-stats";
import { SkillsSelector } from "@/components/profile/SkillsSelector";
import type { Profile, WorkerProfileDetails, AvailabilityStatus, ProfileStats } from "@/lib/types";

const AVAILABILITY_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: "inmediata", label: "Disponibilidad inmediata" },
  { value: "una_semana", label: "En una semana" },
  { value: "un_mes", label: "En un mes" },
  { value: "no_disponible", label: "No disponible" },
];

const CATEGORIES = [
  "Electricista",
  "Albañil",
  "Plomero",
  "Carpintero",
  "Pintor",
  "Niñera / Cuidador",
  "Limpieza",
  "Jardinero",
  "Conductor",
  "Seguridad",
  "Cocinero",
  "Mesero",
  "Administrativo",
  "Técnico en computadoras",
  "Diseñador",
  "Otro",
];

interface InfoTabProps {
  profile: Profile;
  workerDetails: WorkerProfileDetails | null;
  onStatsChange: (stats: ProfileStats) => void;
}

export function InfoTab({ profile, workerDetails, onStatsChange }: InfoTabProps) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [bio, setBio] = useState(profile.bio ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [category, setCategory] = useState(profile.category ?? "");
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);

  // Información profesional ampliada (Fase 1)
  const [professionalTitle, setProfessionalTitle] = useState(
    workerDetails?.professional_title ?? ""
  );
  const [district, setDistrict] = useState(workerDetails?.district ?? "");
  const [address, setAddress] = useState(workerDetails?.address ?? "");
  const [birthDate, setBirthDate] = useState(workerDetails?.birth_date ?? "");
  const [whatsapp, setWhatsapp] = useState(workerDetails?.whatsapp ?? "");
  const [availability, setAvailability] = useState<AvailabilityStatus>(
    workerDetails?.availability ?? "inmediata"
  );
  const [hourlyRate, setHourlyRate] = useState(
    workerDetails?.hourly_rate != null ? String(workerDetails.hourly_rate) : ""
  );
  const [dailyRate, setDailyRate] = useState(
    workerDetails?.daily_rate != null ? String(workerDetails.daily_rate) : ""
  );
  const [yearsExperience, setYearsExperience] = useState(
    workerDetails?.years_experience != null ? String(workerDetails.years_experience) : ""
  );
  const [languages, setLanguages] = useState((workerDetails?.languages ?? []).join(", "));
  const [workRadiusKm, setWorkRadiusKm] = useState(
    workerDetails?.work_radius_km != null ? String(workerDetails.work_radius_km) : ""
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("bio", bio);
    fd.set("phone", phone);
    fd.set("city", city);
    fd.set("category", category);
    fd.set("skills", skills.join(","));

    const detailsFd = new FormData();
    detailsFd.set("professional_title", professionalTitle);
    detailsFd.set("district", district);
    detailsFd.set("address", address);
    detailsFd.set("birth_date", birthDate);
    detailsFd.set("whatsapp", whatsapp);
    detailsFd.set("availability", availability);
    detailsFd.set("hourly_rate", hourlyRate);
    detailsFd.set("daily_rate", dailyRate);
    detailsFd.set("years_experience", yearsExperience);
    detailsFd.set("languages", languages);
    detailsFd.set("work_radius_km", workRadiusKm);

    startTransition(async () => {
      const [result, detailsResult] = await Promise.all([
        updateProfile(fd),
        upsertWorkerProfileDetails(detailsFd),
      ]);
      if ("error" in result) {
        toast(result.error, "error");
      } else if ("error" in detailsResult) {
        toast(detailsResult.error, "error");
      } else {
        await refreshProfileStats(onStatsChange);
        toast("Perfil actualizado correctamente", "success");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card p-5 sm:p-6">
        <h3 className="mb-5 text-sm font-bold text-ink">Datos personales</h3>
        <div className="space-y-4">
          {/* Phone */}
          <div>
            <label htmlFor="phone" className="label">
              Teléfono
            </label>
            <input
              id="phone"
              type="tel"
              className="input w-full"
              placeholder="+51 999 999 999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* City */}
          <div>
            <label htmlFor="city" className="label">
              Ciudad
            </label>
            <input
              id="city"
              type="text"
              className="input w-full"
              placeholder="Lima, Arequipa, Trujillo…"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="label">
              Especialidad principal
            </label>
            <select
              id="category"
              className="input w-full"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Selecciona una especialidad</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-5 text-sm font-bold text-ink">Información profesional</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="professional_title" className="label">
              Título profesional
            </label>
            <input
              id="professional_title"
              type="text"
              className="input w-full"
              placeholder="Ej: Electricista industrial certificado"
              value={professionalTitle}
              onChange={(e) => setProfessionalTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="district" className="label">
                Distrito
              </label>
              <input
                id="district"
                type="text"
                className="input w-full"
                placeholder="Miraflores, Los Olivos…"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="whatsapp" className="label">
                WhatsApp
              </label>
              <input
                id="whatsapp"
                type="tel"
                className="input w-full"
                placeholder="+51 999 999 999"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="address" className="label">
              Dirección (opcional)
            </label>
            <input
              id="address"
              type="text"
              className="input w-full"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="birth_date" className="label">
                Fecha de nacimiento
              </label>
              <input
                id="birth_date"
                type="date"
                className="input w-full"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="availability" className="label">
                Disponibilidad
              </label>
              <select
                id="availability"
                className="input w-full"
                value={availability}
                onChange={(e) => setAvailability(e.target.value as AvailabilityStatus)}
              >
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="hourly_rate" className="label">
                Tarifa por hora (S/)
              </label>
              <input
                id="hourly_rate"
                type="number"
                min="0"
                step="0.01"
                className="input w-full"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="daily_rate" className="label">
                Tarifa por día (S/)
              </label>
              <input
                id="daily_rate"
                type="number"
                min="0"
                step="0.01"
                className="input w-full"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="years_experience" className="label">
                Años de experiencia
              </label>
              <input
                id="years_experience"
                type="number"
                min="0"
                max="60"
                step="1"
                className="input w-full"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="work_radius_km" className="label">
                Radio de trabajo (km)
              </label>
              <input
                id="work_radius_km"
                type="number"
                min="0"
                max="500"
                step="1"
                className="input w-full"
                value={workRadiusKm}
                onChange={(e) => setWorkRadiusKm(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="languages" className="label">
              Idiomas
            </label>
            <input
              id="languages"
              type="text"
              className="input w-full"
              placeholder="Español, Quechua, Inglés…"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
            <p className="mt-1 text-xs text-ink-muted">Sepáralos con comas</p>
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-5 text-sm font-bold text-ink">Descripción profesional</h3>
        <div>
          <label htmlFor="bio" className="label">
            Sobre ti
          </label>
          <textarea
            id="bio"
            rows={4}
            className="input w-full resize-none"
            placeholder="Describe tu experiencia, lo que haces mejor y por qué contrataría trabajar contigo…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
          />
          <p className="mt-1 text-right text-xs text-ink-muted">{bio.length}/500</p>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-bold text-ink">Habilidades</h3>
        <p className="mb-4 text-xs text-ink-muted">
          Busca en el catálogo o escribe una habilidad y presiona Enter para añadirla.
        </p>
        <SkillsSelector value={skills} onChange={setSkills} />
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
