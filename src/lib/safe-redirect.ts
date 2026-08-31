/**
 * Devuelve `value` solo si es una ruta interna segura (previene open
 * redirects) — un solo `/` inicial, sin `//` (protocol-relative) y sin
 * backslashes (que algunos navegadores normalizan a `/`, habilitando el
 * mismo ataque). Único punto de verdad compartido entre Server Actions
 * (src/lib/actions/auth.ts, que recibe FormDataEntryValue) y el Route
 * Handler de OAuth callback (src/app/auth/callback/route.ts, que recibe
 * el `next` de la query string) — antes cada uno validaba (o no) por su
 * cuenta, y el callback de OAuth no lo hacía en absoluto.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) return null;
  if (!/^\/(?!\/)[^\\]*$/.test(value)) return null;
  return value;
}
