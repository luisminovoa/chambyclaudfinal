# Chamby — Design System

Sistema de diseño del rediseño del MVP. La lógica de negocio (server actions, queries de
Supabase, rutas y middleware) permanece intacta; este documento describe únicamente la capa
de presentación.

## Principios

- **Mobile first**: todo se diseña primero para móvil y escala a tablet/escritorio.
- **Minimalismo premium**: mucho espacio en blanco, jerarquía tipográfica fuerte, sombras suaves.
- **Glassmorphism sutil**: solo en superficies de navegación (navbar, bottom nav, hero search).
- **Movimiento con propósito**: transiciones de ~200 ms, animaciones de entrada de una sola vez,
  `prefers-reduced-motion` respetado en los reveals.

## Tokens

### Color (tailwind.config.ts)

| Token | Valor | Uso |
| --- | --- | --- |
| `primary-600` | `#5B3DF5` | Color principal de marca |
| `primary-500` | `#7C5CFF` | Secundario / gradientes |
| `success-500` | `#22C55E` | Éxito |
| `warning-500` | `#F59E0B` | Advertencia / estrellas |
| `danger-500` | `#EF4444` | Error / destructivo |
| `surface` | `#F8FAFC` | Fondo de la app |
| `ink` | `#111827` | Texto principal |
| `ink-muted` | `#6B7280` | Texto secundario |

Gradiente de marca: `bg-brand-gradient` (135°, `#5B3DF5 → #7C5CFF → #9678ff`).

### Tipografía

- **Inter** (via `next/font`, variable `--font-inter`).
- Títulos: `font-extrabold tracking-tight` (peso visual alto).
- Cuerpo: `text-sm`/`text-base`, secundarios en `ink-muted`.

### Forma y elevación

- Radios: `rounded-xl` 16 px · `rounded-2xl` 20 px · `rounded-3xl` 24 px.
- Sombras: `shadow-soft` (reposo) · `shadow-card` (tarjetas) · `shadow-lifted` (hover/overlay) ·
  `shadow-glow` (CTA de marca).

## Organización de componentes

```
src/components/
├── ui/                  # Primitivas reutilizables (design system)
│   ├── Button.tsx       # CVA: primary/secondary/ghost/success/danger/outline × sm/md/lg/icon
│   ├── Badge.tsx        # Tonos semánticos + jobStatusTone()
│   ├── Avatar.tsx       # Foto o iniciales con gradiente, 4 tamaños
│   ├── StatCard.tsx     # Tarjeta KPI con icono
│   ├── Skeleton.tsx     # Skeleton + shimmer (JobCardSkeleton, StatCardSkeleton)
│   ├── EmptyState.tsx   # Estados vacíos con icono y CTA
│   ├── Progress.tsx     # Barra de progreso animada (formulario por pasos)
│   ├── Toaster.tsx      # ToastProvider + useToast() (success/error/info)
│   └── Reveal.tsx       # Animación de entrada (Framer Motion) para server components
├── *.tsx                # Componentes de dominio (JobCard, SearchFilters, forms, rows…)
```

Clases utilitarias globales (`globals.css`): `.btn-*`, `.input`, `.label`, `.card`,
`.card-hover`, `.badge`, `.glass`, `.skeleton`, `.section-title`.

## Navegación

- **Móvil**: bottom nav fija de 5 tabs — Inicio · Buscar · Publicar (botón flotante con
  gradiente) · Mensajes · Perfil — con píldora activa animada (`layoutId`) y safe-area.
- **Escritorio**: navbar glass sticky con enlaces por rol y avatar del usuario.
- **Admin**: tabs con indicador animado (Resumen / Usuarios / Trabajos).

## Flujos clave

- **Inicio**: hero con glow + búsqueda grande (palabra clave + ciudad) → categorías con iconos
  Lucide → trabajos recomendados → empleadores destacados → cómo funciona → CTA gradiente.
- **Publicar empleo**: 4 pasos (Información → Pago → Requisitos → Vista previa) con barra de
  progreso, validación Zod por paso y envío final al mismo server action `createJob`.
- **Tarjeta de empleo**: empleador + avatar, título, ubicación, tipo de pago, fecha, monto,
  guardar (localStorage) · compartir (Web Share API) · postular.
- **Dashboards**: KPI cards (4 métricas por rol) + listas con estados vacíos.

## UX / estados

- Skeleton loading con shimmer por ruta (`loading.tsx` en /, /jobs, /jobs/[id], /dashboard).
- Toasts globales para acciones (postular, guardar, aceptar/rechazar, moderación).
- Confirmaciones elegantes en línea (sin `window.confirm`) para acciones destructivas.
- Estados vacíos y de error con `EmptyState`.

## Accesibilidad (WCAG AA)

- Focus visible global (`focus-visible` ring primario).
- Roles ARIA en radiogrupos, toasts (`aria-live`), navegación (`aria-current`), alerts.
- Áreas táctiles mínimas de 44 px, contraste AA en texto sobre fondos claros y gradiente.
- `useReducedMotion` en animaciones de entrada.
