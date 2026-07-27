import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: "Política de privacidad y tratamiento de datos personales de Chamby.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "Responsable del tratamiento",
    paragraphs: [
      "[PROVISIONAL] Chamby (razón social por definir) es responsable del tratamiento de los datos personales recogidos a través de la plataforma, conforme a la Ley N.º 29733 — Ley de Protección de Datos Personales del Perú — y su reglamento.",
    ],
  },
  {
    title: "Datos que recopilamos",
    paragraphs: [
      "[PROVISIONAL] Datos de registro: nombre completo, correo electrónico, contraseña cifrada, ciudad, oficio y teléfono opcional. Datos de uso: publicaciones, postulaciones, calificaciones y comentarios. Datos técnicos: identificadores de sesión necesarios para la autenticación.",
      "[PROVISIONAL] Si inicias sesión con Google, recibimos tu nombre, correo y foto de perfil según tu configuración de Google.",
    ],
  },
  {
    title: "Finalidad del tratamiento",
    paragraphs: [
      "[PROVISIONAL] Usamos tus datos para operar la plataforma: crear tu perfil, conectar empleadores con trabajadores, mostrar calificaciones, y mantener la seguridad del servicio. No vendemos tus datos personales a terceros.",
    ],
  },
  {
    title: "Base de datos y almacenamiento",
    paragraphs: [
      "[PROVISIONAL] Los datos se almacenan en la infraestructura de Supabase con cifrado en tránsito y en reposo, y controles de acceso a nivel de fila que impiden que otros usuarios accedan a información que no les corresponde.",
    ],
  },
  {
    title: "Compartición de datos",
    paragraphs: [
      "[PROVISIONAL] Tu nombre, ciudad, oficio y calificaciones son visibles para otros usuarios como parte del funcionamiento del marketplace. No compartimos tus datos con terceros salvo obligación legal o proveedores estrictamente necesarios para operar el servicio.",
    ],
  },
  {
    title: "Tus derechos (ARCO)",
    paragraphs: [
      "[PROVISIONAL] Puedes ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición escribiendo a privacidad@chamby.pe (correo por confirmar). Atenderemos tu solicitud en los plazos que establece la ley peruana.",
    ],
  },
  {
    title: "Conservación y eliminación",
    paragraphs: [
      "[PROVISIONAL] Conservamos tus datos mientras tu cuenta esté activa. Al eliminar tu cuenta, tus datos personales se eliminan o anonimizan, salvo aquellos que debamos conservar por obligación legal.",
    ],
  },
  {
    title: "Cambios en esta política",
    paragraphs: [
      "[PROVISIONAL] Notificaremos dentro de la plataforma cualquier cambio relevante en esta política antes de que entre en vigencia.",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <LegalPage title="Política de Privacidad" lastUpdated="26 de julio de 2026" sections={SECTIONS} />
  );
}
