# Auditoría de calidad — Chamby (julio 2026)

Auditoría integral (UX/UI + Frontend + QA) sobre `main`. Metodología: revisión de código,
barrido automatizado con Chromium en 6 viewports (320/360/393/768/1366/1920 px) sobre las
rutas principales midiendo overflow, errores de consola/hidratación y touch targets, análisis
de contraste de la paleta, y revisión de server actions + políticas RLS.

## Resultado del barrido responsive

36/36 combinaciones ruta×viewport sin overflow horizontal, sin errores de consola y sin
errores de hidratación. Únicos touch targets < 32 px: enlaces inline en párrafos de auth
(excepción válida en WCAG 2.5.8).

## Hallazgos y estado

### Prioridad crítica

Ninguno. No se encontraron vulnerabilidades explotables (RLS activo en todas las tablas con
políticas de ownership; acciones de admin verifican rol server-side; validación Zod en
creación de trabajos y registro), ni errores de build/runtime, ni roturas responsive.

### Prioridad alta — corregidos ✅

| # | Hallazgo | Corrección |
| --- | --- | --- |
| A1 | Contraste AA insuficiente (3.0:1) en texto informativo `slate-400`: hints de KPI, "reseñas totales", headers de tablas admin, separador "o continúa con", tabs inactivos del bottom nav | Subido a `slate-500`/`ink-muted` (≥ 4.5:1) |
| A2 | Selects con `appearance-none` sin affordance visual (parecían inputs) | Chevron visible en filtros y formulario de publicación |
| A3 | Sin metadatos sociales: Open Graph, Twitter Cards, `metadataBase` | Metadata completa + imagen OG 1200×630 con la marca |
| A4 | Sin `sitemap.xml` ni `robots.txt` | `sitemap.ts` (estáticas + hasta 500 vacantes abiertas) y `robots.ts` (excluye dashboard/admin) |
| A5 | Sin datos estructurados | JSON-LD `Organization` global y `JobPosting` por vacante abierta (elegible para Google Jobs) |
| A6 | `updateJobStatus` / `updateApplicationStatus` / `adminUpdateJobStatus` aceptaban cualquier string como estado (RLS limita quién, no qué valor) | Validación de enum en el server action |
| A7 | `submitRating` no validaba rango del score ni longitud del comentario en el server | Score entero 1–5 y comentario ≤ 1000 caracteres |
| A8 | Sin cabeceras de seguridad HTTP | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` en `next.config.js` |

### Prioridad media — corregidos ✅

| # | Hallazgo | Corrección |
| --- | --- | --- |
| M1 | Sin enlace "saltar al contenido" para teclado/lectores de pantalla | Skip link + landmark `#contenido` |
| M2 | PWA sin soporte offline | Service worker network-first (nunca sirve contenido viejo) + página `/offline` con la hormiguita |
| M3 | `apple-touch-icon` con esquinas transparentes (iOS lo muestra sobre negro) | Regenerado opaco a sangre completa |
| M4 | Footer con "Términos/Privacidad/Ayuda" como texto clicable falso (`cursor-pointer` sin destino) | Convertidos a texto plano hasta que existan las páginas |
| M5 | ESLint no configurado en el repo (solo se ejecutaba ad-hoc) | `.eslintrc.json` (`next/core-web-vitals`) + devDependencies |
| M6 | `components/ui/Button.tsx` sin ningún uso (duplicaba las clases `.btn-*`) | Eliminado; las clases `.btn-*` son el sistema de botones documentado |
| M7 | `/jobs`, `/login`, `/register` y el detalle de empleo sin metadata propia | `metadata` por página y `generateMetadata` dinámico en el detalle |

### Prioridad baja — corregidos ✅ / documentados

| # | Hallazgo | Estado |
| --- | --- | --- |
| B1 | Estrellas de calificación usaban `#F59E0B` en vez del amarillo de marca | Corregido en fase de marca (`#FFC107`) |
| B2 | Avatares con `<img>` en vez de `next/image` | Documentado: los avatares de Google OAuth vienen de `lh3.googleusercontent.com` (fuera de `remotePatterns`); `next/image` los rompería. Mantener `<img>` hasta definir proxy de imágenes |
| B3 | Framer Motion se importa completo (~30 kB gz) | Documentado: migrar a `LazyMotion` + `m.` es optimización futura de bajo riesgo/beneficio con el bundle actual (87–160 kB First Load) |

### Requieren tu aprobación (tocan lógica de negocio) — NO aplicados ⚠️

| # | Hallazgo | Propuesta |
| --- | --- | --- |
| P1 | El login ignora el parámetro `next`: al intentar publicar sin sesión (`/login?next=/jobs/new`), tras ingresar te lleva a `/dashboard` en vez de a publicar | Leer `next` en el server action de login y redirigir ahí (validando que sea ruta interna) |
| P2 | "Términos", "Privacidad" y "Ayuda" no tienen páginas | Crear páginas legales reales (requiere contenido legal tuyo) |
| P3 | Al aceptar un postulante el trabajo no cambia a `en_progreso` ni asigna `assigned_worker_id` automáticamente | Definir la regla de negocio: ¿aceptar = asignar? Hoy la calificación mutua depende de `assigned_worker_id`, que nunca se setea desde la UI |

## Verificación final

- `tsc --noEmit` limpio · `next lint` sin warnings · `next build` en verde.
- Barrido Chromium post-fixes: 0 errores, 0 overflow en 6 viewports.
- First Load JS: 87 kB compartido; ruta más pesada 160 kB (formulario 4 pasos).
