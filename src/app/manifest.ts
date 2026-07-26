import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Chamby — Conecta, chambea y cobra",
    short_name: "Chamby",
    description:
      "La app peruana de empleos temporales. Encuentra trabajos cerca de ti o publica gratis y contrata rápido y seguro.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#5B3DF5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
