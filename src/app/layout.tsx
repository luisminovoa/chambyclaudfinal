import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/ui/Toaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Chamby — Encuentra o publica trabajos cerca de ti",
  description:
    "Chamby conecta trabajadores y empleadores. Publica trabajos, encuentra chamba por ciudad y puesto, y construye tu reputación.",
};

export const viewport: Viewport = {
  themeColor: "#5B3DF5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <ToastProvider>
          <Navbar />
          <main className="flex-1 pb-24 sm:pb-0">{children}</main>
          <Footer />
          <BottomNav />
        </ToastProvider>
      </body>
    </html>
  );
}
