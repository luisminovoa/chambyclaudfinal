/**
 * Catálogo de habilidades sugeridas para el autocompletado del perfil
 * profesional. No es una restricción: el trabajador puede escribir
 * cualquier habilidad que no esté aquí (profiles.skills sigue siendo un
 * text[] libre, sin FK ni enum — mantiene compatibilidad total con los
 * perfiles ya existentes). Este archivo solo alimenta las sugerencias.
 */
export const SKILLS_CATALOG: string[] = [
  // Oficios de construcción
  "Albañilería",
  "Electricidad",
  "Gasfitería",
  "Carpintería",
  "Pintura",
  "Construcción",
  "Soldadura",
  "Enchapado",
  "Drywall",
  "Techado",
  "Instalaciones sanitarias",
  "Instalaciones eléctricas",
  "Mantenimiento general",
  "Cerrajería",

  // Logística y almacén
  "SAP",
  "Excel",
  "Montacargas",
  "Picking",
  "Packing",
  "Inventarios",
  "Logística",
  "Manejo de caja registradora",

  // Servicios generales
  "Limpieza",
  "Jardinería",
  "Niñera / Cuidado infantil",
  "Cuidado de adultos mayores",
  "Cocina",
  "Panadería",
  "Mesero",
  "Atención al cliente",
  "Costura",

  // Conducción y seguridad
  "Conducción",
  "Licencia de conducir A-I",
  "Licencia de conducir A-IIa",
  "Seguridad y vigilancia",
  "Primeros auxilios",
  "Manejo de maquinaria pesada",

  // Técnico / oficina
  "Técnico en computadoras",
  "Redes eléctricas",
  "Mecánica automotriz",
  "Diseño gráfico",
  "Word",
  "PowerPoint",
  "Inglés básico",
];
