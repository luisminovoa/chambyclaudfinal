# Reporte de ramas — Chamby v0.6.0

> **Fecha:** 29 de julio de 2026
> **Elaborado conforme al §24 del protocolo permanente** (`CLAUDE.md`): las ramas antiguas no se eliminan automáticamente; primero se genera este informe y solo después de la autorización expresa del propietario puede eliminarse alguna.
> **Referencia:** `origin/main` @ `bc03549` · rama de trabajo `claude/chamby-mvp-redesign-glb9uc` @ `376b3f5`
>
> **Este informe no eliminó ninguna rama, no ejecutó limpieza, no hizo push y no abrió ningún Pull Request.**

---

## Nota metodológica: "no mergeada" no siempre significa "contiene trabajo perdido"

Los 14 Pull Requests de este repositorio se integraron con **squash merge**. Eso crea en `main` un commit nuevo con un SHA distinto al de la rama de origen, de modo que `git merge-base --is-ancestor` responde que la rama **no** está mergeada aunque su contenido sí esté íntegramente en `main`.

Por eso este informe distingue **dos** estados que no son lo mismo:

| Estado | Significado | ¿Se pierde trabajo al eliminar? |
|---|---|---|
| **Mergeada por ascendencia** | El commit de la rama es antepasado de `origin/main` | No |
| **Contenido absorbido** | El SHA no está en `main`, pero el código sí (squash o reimplementación) | No |
| **Contenido único** | Hay código en la rama que no existe en `main` de ninguna forma | **Sí** |

**Resultado de la verificación: ninguna de las 13 ramas contiene código único.** Se comprobó archivo por archivo con `git diff origin/main <rama>` sobre las cuatro ramas cuyo SHA no desciende de `main`.

---

## 1. Ramas locales

13 ramas locales.

| # | Rama | Último commit | SHA | Estado |
|---|---|---|---|---|
| 1 | `claude/chamby-mvp-redesign-glb9uc` | 2026-07-29 | `376b3f5` | **ACTIVA** |
| 2 | `debug/oauth-callback-diagnostics` | 2026-07-28 | `9fd442c` | Obsoleta |
| 3 | `beta-private` | 2026-07-28 | `506cd23` | Obsoleta |
| 4 | `claude/notificaciones-fase3` | 2026-07-28 | `a3e15ca` | Obsoleta |
| 5 | `claude/chat-realtime` | 2026-07-28 | `7ca1e59` | Obsoleta |
| 6 | `main` | 2026-07-27 | `b946486` | ⚠️ **DESACTUALIZADA — 9 commits por detrás de `origin/main`** |
| 7 | `claude/flujo-contratacion` | 2026-07-27 | `27e2d7a` | Obsoleta |
| 8 | `claude/add-claude-md` | 2026-07-27 | `3aa9208` | Obsoleta |
| 9 | `claude/fix-auditoria-p3` | 2026-07-27 | `0a10e4b` | Obsoleta |
| 10 | `claude/paginas-legales` | 2026-07-26 | `af05791` | Obsoleta |
| 11 | `claude/auth-next-redirect` | 2026-07-26 | `c9386da` | Obsoleta |
| 12 | `claude/auditoria-calidad` | 2026-07-26 | `1228e88` | Obsoleta |
| 13 | `claude/home-premium-dashboard` | 2026-07-26 | `2d32938` | Obsoleta |

### ⚠️ Hallazgo prioritario: `main` local está desactualizada

La rama `main` **local** apunta a `b946486` (27 de julio, *"feat: chat en tiempo real — Fase 2 v0.5.0"*), mientras que `origin/main` está en `bc03549`. Son **9 commits de diferencia**.

**Riesgo concreto:** cualquier trabajo que se inicie con `git checkout main && git checkout -b nueva-rama` partiría de código de hace dos días, sin PR #12 (endurecimiento de autenticación) ni PR #14 (corrección de Google OAuth). Un desarrollador podría reintroducir bugs ya corregidos sin darse cuenta.

**No es un problema de limpieza sino de sincronización.** La corrección es `git fetch origin && git branch -f main origin/main` — no requiere eliminar nada. **Lo señalo pero no lo ejecuto:** tocar `main`, aunque sea localmente, está prohibido por el §1 del protocolo sin tu autorización.

---

## 2. Ramas remotas

13 ramas remotas en `origin`. Correspondencia 1:1 con las locales.

| # | Rama remota | Último commit | SHA | Adelanto | Retraso |
|---|---|---|---|---|---|
| 1 | `origin/claude/chamby-mvp-redesign-glb9uc` | 2026-07-29 | `376b3f5` | +9 | −1 |
| 2 | `origin/main` | 2026-07-28 | `bc03549` | — | — |
| 3 | `origin/debug/oauth-callback-diagnostics` | 2026-07-28 | `9fd442c` | 0 | −3 |
| 4 | `origin/beta-private` | 2026-07-28 | `506cd23` | +2 | −6 |
| 5 | `origin/claude/notificaciones-fase3` | 2026-07-28 | `a3e15ca` | 0 | −7 |
| 6 | `origin/claude/chat-realtime` | 2026-07-28 | `7ca1e59` | +3 | −10 |
| 7 | `origin/claude/flujo-contratacion` | 2026-07-27 | `27e2d7a` | +4 | −11 |
| 8 | `origin/claude/add-claude-md` | 2026-07-27 | `3aa9208` | +1 | −18 |
| 9 | `origin/claude/fix-auditoria-p3` | 2026-07-27 | `0a10e4b` | 0 | −17 |
| 10 | `origin/claude/paginas-legales` | 2026-07-26 | `af05791` | 0 | −17 |
| 11 | `origin/claude/auth-next-redirect` | 2026-07-26 | `c9386da` | 0 | −17 |
| 12 | `origin/claude/auditoria-calidad` | 2026-07-26 | `1228e88` | 0 | −19 |
| 13 | `origin/claude/home-premium-dashboard` | 2026-07-26 | `2d32938` | 0 | −20 |

> **Nota sobre la rama activa:** `claude/chamby-mvp-redesign-glb9uc` está **divergida** — 9 commits por delante y 1 por detrás de `origin/main`. Le falta el commit de merge `bc03549` (PR #14). No es un problema hoy, pero debe resolverse antes de abrir el próximo PR (§9: "sin conflictos").

---

## 3. Análisis detallado por rama

### 1. `claude/chamby-mvp-redesign-glb9uc` — ACTIVA

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-29 · `376b3f5` |
| **Estado** | **ACTIVA — rama de trabajo designada** |
| **PR asociado** | #1, #2, #12, #14 (mergeados) · trabajo actual sin PR |
| **Mergeada** | No — contiene 9 commits sin integrar |
| **¿Puede eliminarse?** | **NO** |
| **Motivo** | Contiene los 5 módulos de producto sin mergear (perfil profesional, multi-rol, wizard de publicación, buscar chambas, contratación) más la auditoría v0.6.0 y el protocolo permanente. ~8.000 líneas de trabajo real que no existen en ninguna otra parte |
| **Riesgo de eliminarla** | **CRÍTICO — pérdida irreversible de todo el trabajo no mergeado** |
| **Recomendación** | **Conservar obligatoriamente.** Es la única rama con contenido único del repositorio. Antes del próximo PR, sincronizar con `origin/main` para incorporar `bc03549` |

---

### 2. `debug/oauth-callback-diagnostics` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-28 · `9fd442c` |
| **Estado** | Obsoleta — **código de diagnóstico temporal, nunca destinado a producción** |
| **PR asociado** | **#13** (mergeado el 2026-07-28) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | Su propio PR advierte: *"Esta PR debe cerrarse y revertirse una vez identificado el error. No es código de producción — expone detalles internos del error en pantalla."* El diagnóstico cumplió su función y PR #14 restauró el callback a código de producción |
| **Riesgo de eliminarla** | **Muy bajo.** El commit está en el historial de `main`; recuperable con `git checkout 9fd442c` |
| **Recomendación** | **Primera candidata a eliminación.** Es la única rama cuyo contenido es explícitamente indeseable en el repositorio: conservarla mantiene visible un ejemplo de código que filtra información interna de errores |

---

### 3. `beta-private` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-28 · `506cd23` |
| **Estado** | Obsoleta — contenido absorbido |
| **PR asociado** | **#11** (mergeado el 2026-07-28) |
| **Mergeada** | Parcialmente — 2 commits posteriores al merge no ascienden a `main` |
| **¿Puede eliminarse?** | **Sí — verificado** |
| **Motivo** | Los 2 commits pendientes (`38f619f`, `506cd23`) corrigen el manejo de errores de Google OAuth. **PR #12 reimplementó esa funcionalidad** con otro código: `main` contiene el parsing del hash en `LoginForm.tsx:39-56` (marcado `AUTH-007`) y 5 rutas de manejo de error en `auth/callback/route.ts`. Verificado línea por línea |
| **Riesgo de eliminarla** | **Bajo.** Requirió verificación explícita por tener commits no ascendentes; el resultado es que no hay pérdida funcional |
| **Recomendación** | **Eliminable, pero después de las ramas triviales.** Es la única cuya seguridad de eliminación depende de una verificación de equivalencia funcional, no de ascendencia directa. Conviene eliminarla en último lugar del grupo obsoleto |

---

### 4. `claude/notificaciones-fase3` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-28 · `a3e15ca` |
| **Estado** | Obsoleta — completamente integrada |
| **PR asociado** | **#10** (mergeado el 2026-07-28) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | Centro de notificaciones íntegramente presente en `main` (`0004_notifications.sql`, `lib/actions/notifications.ts`, `components/notifications/*`) |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas** |

---

### 5. `claude/chat-realtime` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-28 · `7ca1e59` |
| **Estado** | Obsoleta — contenido absorbido vía squash |
| **PR asociado** | **#9** (mergeado el 2026-07-28) |
| **Mergeada** | No por ascendencia — **sí por contenido** |
| **¿Puede eliminarse?** | **Sí — verificado** |
| **Motivo** | Los 3 commits se integraron con squash en `b946486`. El diff contra `main` muestra 2.696 líneas que `main` tiene y la rama no, frente a 82 que son versiones anteriores de archivos ya presentes. El chat completo está en `main` |
| **Riesgo de eliminarla** | **Muy bajo** |
| **Recomendación** | **Eliminable.** Conserva el documento de diseño `docs/CHAT-REALTIME.md`, que ya está en `main` |

---

### 6. `main` (local) — DESACTUALIZADA

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-27 · `b946486` |
| **Estado** | ⚠️ **Desactualizada — 9 commits por detrás de `origin/main`** |
| **PR asociado** | N/A — rama principal |
| **Mergeada** | N/A |
| **¿Puede eliminarse?** | **NO — jamás** |
| **Motivo** | Rama principal del proyecto. El §1 del protocolo prohíbe modificarla o hacerle push sin autorización |
| **Riesgo de eliminarla** | **CRÍTICO** |
| **Recomendación** | **Conservar obligatoriamente y sincronizar.** El problema no es la rama sino su desfase: partir de ella hoy produciría trabajo sobre código sin PR #12 ni PR #14. Corrección propuesta (**requiere tu autorización, §1**): `git fetch origin main && git branch -f main origin/main` |

---

### 7. `claude/flujo-contratacion` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-27 · `27e2d7a` |
| **Estado** | Obsoleta — contenido absorbido vía squash |
| **PR asociado** | **#5** (mergeado el 2026-07-28) |
| **Mergeada** | No por ascendencia — **sí por contenido** |
| **¿Puede eliminarse?** | **Sí — verificado** |
| **Motivo** | Squash en `9a1e4ed`. El diff contra `main` arroja 5.061 líneas que `main` tiene y la rama no. `0002_hiring_tracking.sql`, `completeJob`, `cancelJob`, `withdrawApplication`, `JobStatusTimeline` y `AssignedWorkerCard` están todos en `main` |
| **Riesgo de eliminarla** | **Muy bajo** |
| **Recomendación** | **Eliminable.** `docs/FLUJO-CONTRATACION.md` ya está en `main` |

---

### 8. `claude/add-claude-md` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-27 · `3aa9208` |
| **Estado** | Obsoleta — contenido absorbido vía squash |
| **PR asociado** | **#8** (mergeado el 2026-07-27) |
| **Mergeada** | No por ascendencia — **sí por contenido** |
| **¿Puede eliminarse?** | **Sí — verificado** |
| **Motivo** | Squash en `847e09b`. `CLAUDE.md` existe en `main` y ha sido ampliado desde entonces con la auditoría y el protocolo permanente: la versión de la rama es **estrictamente anterior** a la actual |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas.** Conservarla es contraproducente: mantiene visible una versión obsoleta de la fuente principal de conocimiento del proyecto (§27), que podría confundirse con la vigente |

---

### 9. `claude/fix-auditoria-p3` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-27 · `0a10e4b` |
| **Estado** | Obsoleta — completamente integrada |
| **PR asociado** | **#7** (mergeado el 2026-07-27) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | Corrección documental de `docs/AUDITORIA.md`, presente en `main` |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas.** Valor histórico: documenta la corrección del hallazgo P3, pero ese valor vive en el propio `AUDITORIA.md`, no en la rama |

---

### 10. `claude/paginas-legales` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-26 · `af05791` |
| **Estado** | Obsoleta — completamente integrada |
| **PR asociado** | **#6** (mergeado el 2026-07-27) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | `/terminos` y `/privacidad` están en `main` |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas.** Recordatorio no relacionado con la rama: el texto legal sigue marcado `[PROVISIONAL]` y es bloqueante para producción |

---

### 11. `claude/auth-next-redirect` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-26 · `c9386da` |
| **Estado** | Obsoleta — completamente integrada |
| **PR asociado** | **#4** (mergeado el 2026-07-27) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | `safeNextPath()` está en `main` (`lib/actions/auth.ts:40`) |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas** |

---

### 12. `claude/auditoria-calidad` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-26 · `1228e88` |
| **Estado** | Obsoleta — completamente integrada |
| **PR asociado** | **#3** (mergeado el 2026-07-26) |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | Accesibilidad AA, SEO, PWA offline y cabeceras de seguridad están en `main`, junto con `docs/AUDITORIA.md` |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas.** Advertencia de contexto: el `AUDITORIA.md` que produjo esta rama afirma *"críticos: 0"*, conclusión que la auditoría v0.6.0 refutó. Eliminar la rama no afecta a ese documento, que sigue en `main` con su corrección anotada |

---

### 13. `claude/home-premium-dashboard` — Obsoleta

| Campo | Valor |
|---|---|
| **Último commit** | 2026-07-26 · `2d32938` |
| **Estado** | Obsoleta — la más antigua del repositorio |
| **PR asociado** | Ninguno propio — su punta es el commit de merge de **PR #2** |
| **Mergeada** | **Sí** — por ascendencia |
| **¿Puede eliminarse?** | **Sí** |
| **Motivo** | No es una rama de trabajo: apunta a un commit de merge ya integrado. Probablemente creada por accidente o como marcador temporal. 20 commits por detrás de `origin/main` |
| **Riesgo de eliminarla** | **Nulo** |
| **Recomendación** | **Eliminable sin reservas.** La candidata más segura de las 13 |

---

## 4. Resumen

### Cuántas ramas existen

| Ámbito | Cantidad |
|---|---|
| Ramas locales | **13** |
| Ramas remotas | **13** |
| **Total de referencias** | **26** (13 pares locales/remotas) |

### Cuántas están activas

**2 ramas activas:**

| Rama | Función |
|---|---|
| `main` | Rama principal · ⚠️ la copia local está 9 commits desfasada |
| `claude/chamby-mvp-redesign-glb9uc` | Rama de trabajo designada · 9 commits sin mergear |

### Cuántas están obsoletas

**11 ramas obsoletas** (85 % del total). Ninguna contiene código único.

| Sub-estado | Cantidad | Ramas |
|---|---|---|
| Mergeadas por ascendencia | **7** | `debug/oauth-callback-diagnostics` · `claude/notificaciones-fase3` · `claude/fix-auditoria-p3` · `claude/paginas-legales` · `claude/auth-next-redirect` · `claude/auditoria-calidad` · `claude/home-premium-dashboard` |
| Contenido absorbido (squash o reimplementación) | **4** | `claude/chat-realtime` · `claude/flujo-contratacion` · `claude/add-claude-md` · `beta-private` |
| **Con contenido único** | **0** | — |

### Cuáles deben conservarse obligatoriamente

| Rama | Motivo |
|---|---|
| **`main`** | Rama principal. Su eliminación es inconcebible; el §1 prohíbe incluso modificarla sin autorización |
| **`claude/chamby-mvp-redesign-glb9uc`** | **Única rama con contenido único del repositorio.** Contiene ~8.000 líneas: 5 módulos de producto sin mergear, la auditoría v0.6.0 y el protocolo permanente. Eliminarla destruiría trabajo irrecuperable |

### Cuáles podrían eliminarse cuando el proyecto llegue a v1.0

Las **11 obsoletas**. Ninguna aporta valor operativo hoy; su contenido está íntegramente en `main` o en la rama activa.

Ahora bien, **esperar a v1.0 no es lo que yo recomendaría**, y lo digo explícitamente porque el §24 pide recomendación, no solo inventario:

**Sugiero eliminarlas en tres tandas, no de golpe y no dentro de doce semanas:**

| Tanda | Cuándo | Ramas | Justificación |
|---|---|---|---|
| **1 — Ahora** | Antes de iniciar el sprint de blindaje | `debug/oauth-callback-diagnostics` · `claude/home-premium-dashboard` · `claude/add-claude-md` | Las tres tienen un motivo **activo** para desaparecer, no solo la ausencia de motivo para quedarse: la primera conserva código que expone información interna de errores y que su propio PR pedía revertir; la segunda no es una rama de trabajo sino un marcador accidental; la tercera mantiene visible una versión obsoleta de `CLAUDE.md`, que el §27 designa como fuente principal de conocimiento — tener dos versiones circulando contradice esa norma |
| **2 — Al cerrar v0.7 (blindaje)** | Tras mergear las correcciones críticas | `claude/auditoria-calidad` · `claude/auth-next-redirect` · `claude/paginas-legales` · `claude/fix-auditoria-p3` · `claude/notificaciones-fase3` | Mergeadas por ascendencia y sin valor operativo. Se eliminan cuando el repositorio ya esté estabilizado, no durante el sprint |
| **3 — Al cerrar v0.9** | Antes de preparar el lanzamiento | `claude/chat-realtime` · `claude/flujo-contratacion` · `beta-private` | Son las tres cuya seguridad de eliminación depende de una verificación de equivalencia de contenido y no de ascendencia directa. Conviene que pase tiempo suficiente para que cualquier regresión en chat, contratación u OAuth ya se haya manifestado y se haya podido consultar la rama original si hiciera falta |

**Razón de fondo del escalonado:** el §15 y el §26 sitúan la seguridad y la estabilidad por delante de la optimización, y la limpieza del repositorio es optimización. Eliminar once ramas en mitad del sprint de blindaje no aporta seguridad y sí añade ruido. La tanda 1 es la excepción justificada porque esas tres ramas tienen un coste real mientras existan.

### Acción recomendada al margen de la limpieza

**Sincronizar `main` local con `origin/main`** — 9 commits de desfase. No es limpieza ni requiere eliminar nada, pero es el único hallazgo de este informe con capacidad de causar un problema real: partir de una `main` desactualizada reintroduciría bugs ya corregidos en PR #12 y PR #14.

Comando propuesto (**no ejecutado — requiere tu autorización por el §1**):

```bash
git fetch origin main && git branch -f main origin/main
```

---

## 5. Autorización pendiente

Conforme al §24, **no se ha eliminado ninguna rama y no se eliminará ninguna** hasta recibir autorización expresa. Este informe es únicamente el paso previo que la norma exige.

Para autorizar, indica qué tanda o qué ramas concretas apruebas. Toda eliminación se ejecutará rama por rama, informando del resultado de cada una.

---

*Informe generado el 29 de julio de 2026 sobre `origin/main` @ `bc03549`. Sin eliminaciones, sin limpieza, sin push, sin Pull Requests.*
