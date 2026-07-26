import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/ui/Toaster";
import { RegisterSW } from "@/components/RegisterSW";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chambyclaudfinal.netlify.app";
const SITE_DESCRIPTION =
  "La app peruana de empleos temporales. Encuentra trabajos cerca de ti o publica gratis y contrata rápido y seguro, con historial laboral y calificaciones reales.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Chamby — Encuentra o publica trabajos cerca de ti",
    template: "%s — Chamby",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Chamby",
  keywords: ["trabajo", "empleo temporal", "chamba", "Perú", "trabajadores", "empleadores"],
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: SITE_URL,
    siteName: "Chamby",
    title: "Chamby — Conecta, chambea y cobra",
    description: SITE_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Chamby — Conecta, chambea y cobra" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chamby — Conecta, chambea y cobra",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#5B3DF5",
  width: "device-width",
  initialScale: 1,
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Chamby",
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
  slogan: "Conecta, chambea y cobra",
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <a
          href="#contenido"
          className="sr-only z-50 rounded-xl bg-primary-600 px-4 py-2 font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
        >
          Saltar al contenido principal
        </a>
        <ToastProvider>
          <Navbar />
          <main id="contenido" className="flex-1 pb-24 sm:pb-0">
            {children}
          </main>
          <Footer />
          <BottomNav />
        </ToastProvider>
        <RegisterSW />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
