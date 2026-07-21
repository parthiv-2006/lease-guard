/**
 * lib/sanitize-error.ts — Strip sensitive details from error strings before
 * they are returned to clients.
 *
 * Internal error messages can contain absolute filesystem paths (e.g. the
 * Python subprocess CWD, temp file paths) or other server internals that should
 * not be exposed. We redact path-like tokens and cap the length so a stack
 * trace can't be exfiltrated through an error field.
 */
export function sanitizeErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .replace(/(?:\/[^\s,;:'"]{2,}|[A-Z]:\\[^\s,;:'"]{2,})/g, "[path]")
    .slice(0, 200);
}
