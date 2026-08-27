"use client";

import { useId } from "react";
import { getDepartments, getProvinces, getDistricts } from "@/lib/ubigeo";

export interface LocationValue {
  department: string;
  province: string;
  district: string;
}

export interface LocationSelectorErrors {
  department?: string;
  province?: string;
  district?: string;
}

interface LocationSelectorProps {
  department: string;
  province: string;
  district: string;
  onChange: (value: LocationValue) => void;
  errors?: LocationSelectorErrors;
  disabled?: boolean;
  /** Prefijo para los `id`/`name` de los tres <select> — evita colisiones cuando el formulario tiene más de una instancia. */
  idPrefix?: string;
}

/**
 * Selector jerárquico Departamento → Provincia → Distrito (Fase 1,
 * ubicación Perú). Fuente única de la jerarquía: src/lib/ubigeo.ts
 * (catálogo completo del país, sin llamadas a Supabase). Reutilizado por
 * el perfil del trabajador, el perfil del empleador y la publicación de
 * trabajos — no dupliques esta lógica en otro componente.
 *
 * Es un componente controlado: el padre es dueño de `department`/
 * `province`/`district` y recibe el triple completo actualizado en cada
 * cambio vía `onChange`. Al cambiar departamento se limpian provincia y
 * distrito; al cambiar provincia se limpia distrito — así nunca queda una
 * combinación inconsistente en el estado del formulario.
 */
export function LocationSelector({
  department,
  province,
  district,
  onChange,
  errors,
  disabled = false,
  idPrefix = "location",
}: LocationSelectorProps) {
  const reactId = useId();
  const prefix = `${idPrefix}-${reactId}`;

  const departments = getDepartments();
  const provinces = getProvinces(department);
  const districts = getDistricts(department, province);

  function handleDepartmentChange(next: string) {
    onChange({ department: next, province: "", district: "" });
  }

  function handleProvinceChange(next: string) {
    onChange({ department, province: next, district: "" });
  }

  function handleDistrictChange(next: string) {
    onChange({ department, province, district: next });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div>
        <label htmlFor={`${prefix}-department`} className="label">
          Departamento
        </label>
        <select
          id={`${prefix}-department`}
          name="department"
          className="input w-full"
          value={department}
          disabled={disabled}
          onChange={(e) => handleDepartmentChange(e.target.value)}
          aria-invalid={Boolean(errors?.department)}
          aria-describedby={errors?.department ? `${prefix}-department-error` : undefined}
        >
          <option value="">Selecciona un departamento</option>
          {departments.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {errors?.department && (
          <p id={`${prefix}-department-error`} className="mt-1 text-xs font-medium text-danger-600">
            {errors.department}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-province`} className="label">
          Provincia
        </label>
        <select
          id={`${prefix}-province`}
          name="province"
          className="input w-full disabled:cursor-not-allowed disabled:opacity-60"
          value={province}
          disabled={disabled || !department}
          onChange={(e) => handleProvinceChange(e.target.value)}
          aria-invalid={Boolean(errors?.province)}
          aria-describedby={errors?.province ? `${prefix}-province-error` : undefined}
        >
          <option value="">
            {department ? "Selecciona una provincia" : "Primero elige un departamento"}
          </option>
          {provinces.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {errors?.province && (
          <p id={`${prefix}-province-error`} className="mt-1 text-xs font-medium text-danger-600">
            {errors.province}
          </p>
        )}
      </div>

      <div>
        <label htmlFor={`${prefix}-district`} className="label">
          Distrito
        </label>
        <select
          id={`${prefix}-district`}
          name="district"
          className="input w-full disabled:cursor-not-allowed disabled:opacity-60"
          value={district}
          disabled={disabled || !province}
          onChange={(e) => handleDistrictChange(e.target.value)}
          aria-invalid={Boolean(errors?.district)}
          aria-describedby={errors?.district ? `${prefix}-district-error` : undefined}
        >
          <option value="">
            {province ? "Selecciona un distrito" : "Primero elige una provincia"}
          </option>
          {districts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {errors?.district && (
          <p id={`${prefix}-district-error`} className="mt-1 text-xs font-medium text-danger-600">
            {errors.district}
          </p>
        )}
      </div>
    </div>
  );
}
