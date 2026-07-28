# Chamby — MVP v0.5.0

Plataforma peruana que conecta trabajadores y empleadores para trabajos temporales. Publicación de trabajos, búsqueda por ciudad/categoría, flujo completo de contratación, chat en tiempo real, historial laboral, calificaciones y panel administrativo.

**Stack:** Next.js 14 (App Router) · React 18 · TypeScript · Supabase (Auth + Postgres + RLS + Realtime + Storage) · Tailwind CSS · Framer Motion

---

## 1. Estructura del proyecto

```
chamby/
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql             # Esquema base + RLS + triggers
│   │   ├── 0002_hiring_tracking.sql  # Flujo de contratación (Fase 1)
│   │   └── 0003_chat_extensions.sql  # Chat en tiempo real (Fase 2)
│   └── seed.sql                       # Datos de ejemplo (opcional)
├── docs/
│   ├── AUDITORIA.md
│   ├── FLUJO-CONTRATACION.md
│   └── FASE2-CHAT-DISENO.md
├── src/
│   ├── app/
│   │   ├── (auth)/login, register
│   │   ├── auth/callback              # Confirmación de email
│   │   ├── jobs/                      # Búsqueda, detalle, publicar
│   │   ├── messages/                  # Lista de conversaciones + chat
│   │   │   └── [conversationId]/      # Chat individual (SSR + Realtime)
│   │   ├── dashboard/worker|employer
│   │   ├── admin/                     # Panel administrativo
│   │   └── layout.tsx, page.tsx
│   ├── components/
│   │   ├── chat/                      # ChatWindow, MessageBubble, etc.
│   │   ├── brand/                     # AntIcon, Logo, AntLoader, AntIllustration
│   │   └── ui/                        # Avatar, Badge, EmptyState, Reveal, Toaster
│   ├── lib/
│   │   ├── actions/                   # Server Actions (auth, jobs, ratings, admin, chat)
│   │   ├── realtime/                  # useChatRealtime hook
│   │   ├── supabase/                  # client.ts, server.ts, middleware.ts
│   │   ├── types.ts, utils.ts
│   └── middleware.ts                  # Protección de rutas por sesión
├── next.config.js
├── tailwind.config.ts
└── CHANGELOG.md
```

---

## 2. Configurar Supabase

### 2.1 Migraciones (ejecutar en orden en SQL Editor)

Las migraciones son **aditivas**: cada una extiende sin romper la anterior.

| Archivo | Descripción | Cuándo aplicar |
|---|---|---|
| `0001_init.sql` | Esquema base, RLS, triggers de auth y contratación | Primer deploy |
| `0002_hiring_tracking.sql` | Audit trail, conversaciones, rate guard en trigger | Fase 1 |
| `0003_chat_extensions.sql` | Chat en tiempo real: tipos de mensaje, cursores, storage | Fase 2 |

> **Importante:** aplicar las migraciones en Supabase **antes** de deployar el código correspondiente.

### 2.2 Storage

`0003_chat_extensions.sql` crea automáticamente el bucket `conversation-attachments` como **privado** con:
- Tamaño máximo: 5 MB por archivo
- Tipos permitidos: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- RLS: solo participantes de la conversación pueden subir; acceso de lectura exclusivamente vía URLs firmadas (generadas por service role en Server Actions)

### 2.3 Realtime

Habilitar Realtime para las tablas `messages` en el dashboard de Supabase:
**Database → Replication → Tables → messages → Enable**

### 2.4 Auth

En **Authentication → URL Configuration**, agregar:
- `http://localhost:3000/auth/callback`
- `https://tu-dominio.netlify.app/auth/callback` (o Vercel)

---

## 3. Variables de entorno

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Solo servidor — nunca al cliente
```

---

## 4. Instalar y correr en local

```bash
npm install
npm run dev          # localhost:3000

# Verificaciones antes de PR:
npm run build        # build de producción (debe pasar sin errores)
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript estricto
```

---

## 5. Roles y flujo de la plataforma

### Roles
- **`worker`** — trabajador: busca y postula a trabajos, ve historial y calificaciones
- **`employer`** — empleador: publica trabajos, acepta trabajadores, marca completados, califica
- **`admin`** — moderador: panel en `/admin`, puede cambiar roles, suspender cuentas, moderar trabajos y bloquear conversaciones

> El rol se elige al registrarse. `admin` se asigna manualmente en `/admin/users` o directamente en la tabla `profiles`.

### Flujo de contratación

```
abierto → en_progreso → completado
   └──────────────────────────→ cancelado (solo desde abierto)
```

1. Employer publica trabajo (`abierto`)
2. Workers postulan
3. Employer acepta una postulación → trigger DB: asigna worker, rechaza otras, abre chat, registra en `job_state_history`
4. Se habilita el chat entre employer y worker contratado
5. Employer marca como `completado`
6. Ambas partes pueden calificarse (1-5 estrellas)

### Chat en tiempo real

- Accesible desde `/messages` o desde el detalle del trabajo
- WhatsApp Business UX: indicador de escritura, estado online/offline, doble check (enviado/leído), scroll inteligente, carga incremental de historial, agrupación por fecha
- Adjuntos: imágenes (hasta 5 MB) almacenadas en Supabase Storage privado
- Compartir ubicación via Geolocation API (botón en el input)
- Rate limiting: máximo 30 mensajes / 60 s por usuario por conversación
- Archivos privados con acceso vía URLs firmadas (1 año de vigencia)

---

## 6. Desplegar (Netlify / Vercel)

1. Conectar repositorio en el dashboard de la plataforma
2. Configurar variables de entorno
3. Build command: `npm run build`
4. Aplicar migraciones en Supabase antes del primer deploy activo

---

## 7. Notas técnicas

- **DB owns business logic**: los triggers de Postgres (`handle_application_accepted`, `handle_new_user`) implementan reglas de negocio críticas. Siempre revisar `supabase/migrations/` antes de asumir que una regla falta en el código TS.
- **Server Actions para todo lo crítico**: ninguna mutación se hace con escrituras directas desde el cliente (Supabase client). El cliente solo usa Realtime (lectura de eventos).
- **Signed URLs para Storage**: `createUploadUrl` usa `createAdminClient()` (service role) para generar URLs firmadas. Los archivos son privados; el bucket NO tiene política SELECT abierta.
- **Tipo `Database`** en `src/lib/types.ts` está escrito a mano. En producción se recomienda regenerar con:
  ```bash
  supabase gen types typescript --project-id <id> > src/lib/database.types.ts
  ```
- El middleware protege `/dashboard`, `/jobs/new`, `/admin` y `/messages`, redirigiendo a `/login` si no hay sesión.

---

## 8. Roadmap

| Fase | Descripción | Estado |
|---|---|---|
| 1 | Flujo de contratación completo (accept, complete, cancel, withdraw) | ✅ v0.4.0 |
| 2 | Chat en tiempo real (WhatsApp Business UX) | ✅ v0.5.0 |
| 3 | Centro de notificaciones (push, email, in-app) | 🔜 Próximo |
| 4 | Perfil público del trabajador | Planificado |
| 5 | Búsqueda avanzada y geolocalización | Planificado |
| 6 | Verificación de identidad | Planificado |
| 7 | Pagos y escrow | Planificado |
| 8 | App móvil (PWA mejorada) | Planificado |
