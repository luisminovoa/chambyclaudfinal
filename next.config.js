/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
];

const nextConfig = {
  experimental: {
    // Router Cache del cliente: por defecto Next 14.2 reutiliza el RSC
    // payload de una ruta dinámica hasta 30s en navegaciones soft
    // (<Link>/router.push), SIN volver a golpear el servidor. En esta app
    // casi toda ruta dinámica es contenido personalizado por usuario
    // (isOwner en /jobs y /jobs/[id], notificaciones, mensajes) — servir
    // ese caché tras un cambio de sesión/rol es exactamente el bug de
    // "Postular sigue visible en mi propio trabajo" reportado en
    // producción: la autorización server-side es correcta, pero el
    // navegador nunca vuelve a pedirle nada al servidor. dynamic: 0
    // desactiva ese caché para rutas dinámicas — cada navegación soft a
    // una vuelve a pedir datos frescos, igual que ya ocurre en una carga
    // dura o un refresh manual.
    staleTimes: {
      dynamic: 0,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
