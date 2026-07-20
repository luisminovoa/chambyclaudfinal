# Chamby — MVP

Plataforma que conecta trabajadores y empleadores: publicación de trabajos, búsqueda por ciudad/puesto, historial laboral, calificaciones y panel administrativo.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Supabase (Auth + Postgres + RLS) · Tailwind CSS · despliegue en Vercel.

---

## 1. Estructura del proyecto

```
chamby/
├── supabase/
│   ├── migrations/0001_init.sql   # Esquema completo + RLS (ejecutar en Supabase)
│   └── seed.sql                   # Datos de ejemplo opcionales
├── src/
│   ├── app/
│   │   ├── (auth)/login, register
│   │   ├── auth/callback          # Confirmación de email
│   │   ├── jobs/                  # Búsqueda, detalle, publicar
│   │   ├── dashboard/worker|employer
│   │   ├── admin/                 # Panel administrativo
│   │   ├── layout.tsx, page.tsx   # Layout raíz y landing
│   │   └── globals.css
│   ├── components/                # Navbar, JobCard, formularios, etc.
│   ├── lib/
│   │   ├── actions/                # Server Actions (auth, jobs, ratings, admin)
│   │   ├── supabase/               # client.ts, server.ts, middleware.ts
│   │   ├── types.ts, utils.ts
│   └── middleware.ts               # Protección de rutas por sesión
├── package.json
└── .env.example
```

## 2. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/migrations/0001_init.sql`. Esto crea:
   - Tablas: `profiles`, `jobs`, `job_applications`, `ratings`
   - Vista `rating_summary` (promedio y conteo de calificaciones)
   - Trigger que crea automáticamente un `profile` cuando alguien se registra (`handle_new_user`)
   - Trigger que asigna al trabajador y cierra otras postulaciones cuando se acepta una (`handle_application_accepted`)
   - Políticas de **Row Level Security** para cada tabla (lectura pública donde corresponde, escritura restringida al dueño o admin)
3. (Opcional) Revisa `supabase/seed.sql` para crear datos de prueba — requiere primero crear usuarios reales desde **Authentication > Users**.
4. En **Authentication > URL Configuration**, agrega tu dominio de producción y `http://localhost:3000` a las Redirect URLs (incluye `/auth/callback`).
5. Copia tus credenciales desde **Project Settings > API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (¡nunca la expongas al cliente!)

## 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Completa `.env.local` con tus credenciales de Supabase.

## 4. Instalar y correr en local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## 5. Roles y flujo de la plataforma

- **Registro**: al crear cuenta se elige rol `worker` (trabajador) o `employer` (empleador). El rol `admin` se asigna manualmente desde el panel `/admin/users` o directamente en la tabla `profiles` en Supabase.
- **Empleador**: publica trabajos (`/jobs/new`), revisa postulantes y los acepta/rechaza, marca el trabajo como completado y califica al trabajador.
- **Trabajador**: busca trabajos por ciudad/puesto (`/jobs`), postula, ve su historial laboral y calificaciones en `/dashboard/worker`.
- **Al aceptar una postulación**: un trigger de base de datos asigna automáticamente al trabajador (`assigned_worker_id`), cambia el trabajo a `en_progreso` y rechaza las demás postulaciones pendientes.
- **Al completar el trabajo**: ambas partes pueden calificarse mutuamente (1-5 estrellas + comentario), visible en `/jobs/[id]` y en los dashboards.
- **Admin**: `/admin` (métricas), `/admin/users` (cambiar rol / suspender cuentas), `/admin/jobs` (moderar publicaciones).

## 6. Desplegar en Vercel

1. Sube este proyecto a un repositorio de GitHub/GitLab.
2. En [vercel.com](https://vercel.com), importa el repositorio.
3. En **Environment Variables**, agrega las mismas variables de `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Despliega. Vercel detecta Next.js automáticamente (no requiere configuración adicional).
5. Actualiza las **Redirect URLs** en Supabase con tu dominio de producción (`https://tu-dominio.vercel.app/auth/callback`).

## 7. Notas técnicas

- Los tipos de `src/lib/types.ts` están escritos a mano para reflejar el esquema SQL. En producción se recomienda regenerarlos con:
  ```bash
  supabase gen types typescript --project-id <tu-project-id> > src/lib/database.types.ts
  ```
- Las mutaciones (crear trabajo, postular, calificar, moderar) usan **Server Actions** de Next.js, que se ejecutan en el servidor y respetan las políticas RLS de Supabase según el usuario autenticado.
- El middleware (`src/middleware.ts`) protege `/dashboard`, `/jobs/new` y `/admin`, redirigiendo a `/login` si no hay sesión.
- Este es un MVP funcional pensado para iterar: quedan como siguientes pasos sugeridos: subida de foto de perfil/avatar (Supabase Storage), notificaciones por email, paginación de resultados de búsqueda, y filtros geográficos más avanzados.

## 8. Próximos pasos sugeridos

- [ ] Subida de avatar con Supabase Storage
- [ ] Notificaciones por email (nuevas postulaciones, trabajo aceptado)
- [ ] Paginación e infinite scroll en `/jobs`
- [ ] Verificación de identidad/documentos para trabajadores
- [ ] Chat interno entre empleador y trabajador
