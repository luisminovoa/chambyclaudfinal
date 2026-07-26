import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: "Términos y condiciones de uso de la plataforma Chamby.",
};

const SECTIONS: LegalSection[] = [
  {
    title: "Aceptación de los términos",
    paragraphs: [
      "[PROVISIONAL] Al crear una cuenta o utilizar Chamby aceptas estos Términos y Condiciones en su totalidad. Si no estás de acuerdo con alguna de sus disposiciones, no debes usar la plataforma.",
      "[PROVISIONAL] Chamby puede actualizar estos términos; los cambios relevantes serán notificados dentro de la plataforma con anticipación razonable.",
    ],
  },
  {
    title: "Descripción del servicio",
    paragraphs: [
      "[PROVISIONAL] Chamby es una plataforma peruana que conecta a personas que ofrecen trabajos temporales (empleadores) con personas que buscan realizarlos (trabajadores). Chamby actúa únicamente como intermediario tecnológico: no es empleador, agencia de empleo ni parte de la relación contractual entre usuarios.",
    ],
  },
  {
    title: "Cuentas y responsabilidad del usuario",
    paragraphs: [
      "[PROVISIONAL] Eres responsable de la veracidad de la información de tu perfil y de mantener la confidencialidad de tus credenciales. Debes ser mayor de 18 años para usar la plataforma.",
      "[PROVISIONAL] Está prohibido publicar contenido falso, discriminatorio, ilegal o que suplante la identidad de terceros. Chamby puede suspender cuentas que incumplan estas reglas.",
    ],
  },
  {
    title: "Publicaciones, postulaciones y contratación",
    paragraphs: [
      "[PROVISIONAL] Los empleadores son responsables de la exactitud de sus ofertas (descripción, pago y condiciones). Los acuerdos de trabajo, pagos y su cumplimiento se realizan directamente entre empleador y trabajador.",
      "[PROVISIONAL] Las calificaciones deben reflejar experiencias reales; su manipulación puede resultar en la suspensión de la cuenta.",
    ],
  },
  {
    title: "Limitación de responsabilidad",
    paragraphs: [
      "[PROVISIONAL] Chamby no garantiza la obtención de empleo ni la idoneidad de los usuarios, y no se hace responsable por daños derivados de las relaciones laborales acordadas a través de la plataforma, en la máxima medida permitida por la ley peruana.",
    ],
  },
  {
    title: "Propiedad intelectual",
    paragraphs: [
      "[PROVISIONAL] La marca Chamby, su logotipo, la hormiguita y el diseño de la plataforma son propiedad de Chamby. El contenido publicado por los usuarios les pertenece, pero otorgan a Chamby una licencia para mostrarlo dentro del servicio.",
    ],
  },
  {
    title: "Ley aplicable y jurisdicción",
    paragraphs: [
      "[PROVISIONAL] Estos términos se rigen por las leyes de la República del Perú. Cualquier controversia será sometida a los tribunales competentes de Lima, Perú.",
    ],
  },
  {
    title: "Contacto",
    paragraphs: [
      "[PROVISIONAL] Para consultas sobre estos términos escríbenos a legal@chamby.pe (correo por confirmar).",
    ],
  },
];

export default function TerminosPage() {
  return (
    <LegalPage title="Términos y Condiciones" lastUpdated="26 de julio de 2026" sections={SECTIONS} />
  );
}
