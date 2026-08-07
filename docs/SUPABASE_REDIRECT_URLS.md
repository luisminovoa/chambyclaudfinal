# Redirect URLs requeridas en Supabase

Este documento existe porque el código **no puede** registrar estas URLs por sí
solo — es configuración manual en el dashboard de Supabase
(**Authentication → URL Configuration → Redirect URLs**), fuera del control de
este repositorio. Sin ellas, tanto el login con Google como la recuperación de
contraseña fallan con un error de Supabase ("requested path is invalid" o
similar) antes de que el código de la app llegue a ejecutarse.

## Por qué ambos flujos comparten la misma ruta

`src/app/auth/callback/route.ts` es el único Route Handler que hace
`exchangeCodeForSession()` en toda la app. Tanto `signInWithOAuth()` (Google)
como `resetPasswordForEmail()` (`src/lib/actions/auth.ts`) apuntan su
`redirectTo`/`options.redirectTo` a `/auth/callback` — la recuperación de
contraseña le agrega `?next=/reset-password` para diferenciarse. **Por lo
tanto, con registrar `/auth/callback` una sola vez por dominio alcanza para
los dos flujos** — no hace falta una entrada separada para recovery.

## URLs a registrar

### Local (desarrollo)

```
http://localhost:3000/auth/callback
```

### Producción — Netlify

Verificado en la actividad de este PR: los dos proyectos Netlify mencionados
en `CLAUDE.md` responden bajo los nombres `chamby` y `chamby-app` (no
`chambyclaudfinal`, que es el nombre del *repositorio* — el fallback de
`SITE_URL` en `src/app/layout.tsx:20` usa `chambyclaudfinal.netlify.app`, que
puede no ser el dominio real; **confirma en el dashboard de Netlify de cada
proyecto cuál es su dominio de producción efectivo** antes de dar esto por
cerrado).

```
https://chamby.netlify.app/auth/callback
https://chamby-app.netlify.app/auth/callback
```

Si alguno de los dos tiene un dominio personalizado configurado (no `*.netlify.app`),
agrega también esa URL — Supabase no la infiere del dominio `.netlify.app`.

### Previews — Netlify

Observado en este PR (deploy previews de la PR #18):

```
https://deploy-preview-18--chamby.netlify.app/auth/callback
https://deploy-preview-18--chamby-app.netlify.app/auth/callback
```

El número cambia con cada PR (`deploy-preview-<número>--<proyecto>.netlify.app`).
Registrar cada número manualmente no escala — usa un patrón wildcard si tu
plan/versión de Supabase lo soporta:

```
https://deploy-preview-*--chamby.netlify.app/auth/callback
https://deploy-preview-*--chamby-app.netlify.app/auth/callback
```

**Verifica la sintaxis exacta de wildcard que acepta tu proyecto** en
Authentication → URL Configuration del dashboard — Supabase documenta soporte
de patrones tipo glob ahí mismo, pero el detalle (si es `*` por segmento o
`**` multi-segmento) puede variar entre versiones; no lo asumo aquí porque no
tengo acceso al dashboard para confirmarlo.

### Producción/Preview — Vercel

Observado en este PR:

```
https://chambyclaudfinal-git-claude-chamby-security-e47a46-chambyclaud.vercel.app/auth/callback
```

Esta es la URL de preview de esta rama específica
(`claude/chamby-security-vulnerabilities-sz45tr`) — cambia por rama. Vercel
genera además una URL de producción estable (formato típico
`https://<project>.vercel.app` o un dominio personalizado) que **no se
observó directamente en esta sesión** — revisa Vercel → Project Settings →
Domains para confirmar cuál es y agrégala también. Si Vercel está configurado
en este proyecto solo como *deploy preview* (sin promoción a producción), esa
URL de producción puede no existir aún.

Para cubrir cualquier rama/PR futura sin registrar cada una a mano:

```
https://chambyclaudfinal-git-*-chambyclaud.vercel.app/auth/callback
https://chambyclaudfinal-*.vercel.app/auth/callback
```

Mismo aviso que arriba: confirma la sintaxis de wildcard soportada en el
dashboard antes de asumir que estos patrones funcionan tal cual.

## Qué falla exactamente si falta una entrada

- **Login con Google**: `signInWithOAuth()` nunca llega a fallar del lado de
  la app — Supabase redirige a una página de error propia (fuera de esta
  app) antes de volver a `/auth/callback`. El usuario nunca ve el mensaje
  "Cancelaste el inicio de sesión con Google" porque el flujo ni siquiera
  entra al Route Handler.
- **Recuperación de contraseña**: mismo problema — `resetPasswordForEmail()`
  igual devuelve éxito genérico (por diseño, ver Fase 4 de seguridad), así
  que el usuario ve "revisa tu correo" pero el enlace del correo, al
  hacer clic, falla en el lado de Supabase antes de tocar
  `/reset-password`.

## Checklist de verificación manual (no puedo ejecutar esto desde el entorno de la sesión)

- [ ] Confirmar el dominio real de producción de cada proyecto Netlify
- [ ] Confirmar si existe una URL de producción de Vercel además del preview
- [ ] Agregar `http://localhost:3000/auth/callback` para desarrollo local
- [ ] Agregar/confirmar el wildcard de previews de Netlify y Vercel con la
      sintaxis exacta que el dashboard acepte
- [ ] Probar el flujo completo de "¿Olvidaste tu contraseña?" en al menos un
      entorno real, siguiendo el enlace del correo hasta `/reset-password`
