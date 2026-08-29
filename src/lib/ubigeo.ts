import rawUbigeo from "./ubigeo-peru-data.json";

/**
 * Catálogo Ubigeo Perú (departamento → provincia → distrito), Fase 1 de
 * ubicación jerárquica. Fuente: joseluisq/ubigeos-peru
 * (https://github.com/joseluisq/ubigeos-peru), un dataset público derivado
 * del Ubigeo del INEI — 24 departamentos, 194 provincias, 1833 distritos.
 *
 * Callao aparece como una provincia dentro de "Lima" en esta fuente (no
 * como su propio departamento) — así está modelado en el dataset original;
 * no se alteró esa jerarquía.
 *
 * Corrección aplicada sobre el dataset original: el archivo fuente tiene
 * TODAS las letras "ñ"/"Ñ" reemplazadas por "q"/"Q" (confirmado: cero
 * apariciones reales de "ñ" en el dataset original) — p. ej. "Ferreqafe"
 * en vez de "Ferreñafe". Como en ortografía española "q" solo existe en el
 * dígrafo "qu", se revirtió la corrupción determinísticamente: toda "q"/"Q"
 * NO seguida de "u"/"U" se restituyó a "ñ"/"Ñ" antes de generar este JSON.
 * Única excepción real conocida: "Wanchaq" (distrito de Cusco, nombre
 * quechua correcto que termina en "q"), preservada sin modificar. No se
 * intentó restituir tildes faltantes en otras vocales más allá de lo que
 * ya traía el dataset original — antes de usar este catálogo como fuente
 * de verdad para integraciones oficiales (SUNAT/RENIEC), validar contra el
 * Ubigeo vigente del INEI.
 *
 * Es un archivo JSON estático (no una tabla de Supabase): la jerarquía
 * completa de Perú no cambia en tiempo de ejecución y cabe cómoda en el
 * bundle (~27 KB) — resolver cada cambio de `<select>` contra Supabase
 * agregaría latencia y una dependencia de red sin ningún beneficio.
 */
const UBIGEO: Record<string, Record<string, string[]>> = rawUbigeo;

/** Departamentos de Perú, en el orden ya alfabetizado del catálogo. */
export function getDepartments(): string[] {
  return Object.keys(UBIGEO);
}

/** Provincias de un departamento. Array vacío si el departamento no existe en el catálogo. */
export function getProvinces(department: string | null | undefined): string[] {
  if (!department) return [];
  return Object.keys(UBIGEO[department] ?? {});
}

/** Distritos de una provincia. Array vacío si el departamento/provincia no existen en el catálogo. */
export function getDistricts(
  department: string | null | undefined,
  province: string | null | undefined
): string[] {
  if (!department || !province) return [];
  return UBIGEO[department]?.[province] ?? [];
}

export function isValidDepartment(department: string): boolean {
  return department in UBIGEO;
}

export function isValidProvince(department: string, province: string): boolean {
  return province in (UBIGEO[department] ?? {});
}

export function isValidDistrict(department: string, province: string, district: string): boolean {
  return (UBIGEO[department]?.[province] ?? []).includes(district);
}

/**
 * Valida la jerarquía completa department → province → district contra el
 * catálogo — usada del lado del servidor (Server Actions) porque el
 * cliente nunca es una fuente de verdad confiable: alguien podría enviar
 * una provincia que no pertenece al departamento indicado sin pasar por
 * `LocationSelector`.
 */
export function isValidLocation(department: string, province: string, district: string): boolean {
  return (
    isValidDepartment(department) &&
    isValidProvince(department, province) &&
    isValidDistrict(department, province, district)
  );
}

export interface LocationInput {
  department?: string | null;
  province?: string | null;
  district?: string | null;
}

export interface NormalizedLocation {
  department: string | null;
  province: string | null;
  district: string | null;
}

/**
 * Valida y normaliza department/province/district recibidos de un
 * formulario, permitiendo guardado progresivo (solo departamento, o
 * departamento + provincia, sin distrito todavía) pero rechazando
 * cualquier combinación que no pertenezca al catálogo o cuya jerarquía no
 * coincida (p. ej. una provincia que no es de ese departamento). Única
 * fuente de esta validación — reutilizada por updateProfile(),
 * upsertWorkerProfileDetails() y createJob() para no duplicar la lógica
 * en cada Server Action.
 */
export function validateLocationInput(
  input: LocationInput
): { error: string } | NormalizedLocation {
  const department = input.department?.trim() || null;
  const province = input.province?.trim() || null;
  const district = input.district?.trim() || null;

  if (department && !isValidDepartment(department)) {
    return { error: "Departamento inválido." };
  }
  if (province) {
    if (!department) return { error: "Selecciona un departamento antes de la provincia." };
    if (!isValidProvince(department, province)) {
      return { error: "La provincia no pertenece al departamento seleccionado." };
    }
  }
  if (district) {
    if (!department || !province) {
      return { error: "Selecciona departamento y provincia antes del distrito." };
    }
    if (!isValidDistrict(department, province, district)) {
      return { error: "El distrito no pertenece a la provincia seleccionada." };
    }
  }

  return { department, province, district };
}
