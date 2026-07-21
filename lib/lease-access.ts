/**
 * lib/lease-access.ts — Centralised read-authorisation for lease-scoped data.
 *
 * Threat addressed: a lease that belongs to a registered user (user_id set)
 * must not be readable by an unauthenticated caller who merely knows the lease
 * UUID. Previously the only guard rejected a *different authenticated* user, so
 * an anonymous caller with the UUID could read another user's report/PDF.
 *
 * Access model (read endpoints):
 *   1. A supplied share token must match the report's token (else: invalid_token).
 *   2. The authenticated owner is always allowed.
 *   3. Anyone presenting the matching share token is allowed (share-by-link).
 *   4. Guest leases (user_id IS NULL) remain accessible via the UUID — there is
 *      no account to authenticate against; the UUID is the capability token.
 *   5. Otherwise (owned lease, caller is neither owner nor holding a valid
 *      token) → forbidden.
 */

export interface LeaseAccessInput {
  /** Owner of the lease, or null/undefined for a guest (ownerless) lease. */
  leaseUserId: string | null | undefined;
  /** Authenticated caller's user id, or null/undefined if unauthenticated. */
  authUserId: string | null | undefined;
  /** Share token supplied by the caller (query param), if any. */
  providedToken?: string | null;
  /** Share token stored on the report, if one has been generated. */
  reportShareToken?: string | null;
}

export type LeaseAccessResult =
  | { allowed: true }
  | {
      allowed: false;
      status: 403;
      error: "invalid_token" | "forbidden";
      message: string;
    };

export function checkLeaseAccess(input: LeaseAccessInput): LeaseAccessResult {
  const { leaseUserId, authUserId, providedToken, reportShareToken } = input;

  // 1. If a token was supplied, it must match — wrong tokens are always rejected.
  if (providedToken && providedToken !== reportShareToken) {
    return {
      allowed: false,
      status: 403,
      error: "invalid_token",
      message: "Invalid share token.",
    };
  }

  // 2. The authenticated owner is always allowed.
  if (authUserId && leaseUserId && authUserId === leaseUserId) {
    return { allowed: true };
  }

  // 3. A valid share token grants access to anyone holding the link.
  if (providedToken && reportShareToken && providedToken === reportShareToken) {
    return { allowed: true };
  }

  // 4. Guest leases (no owner) remain accessible via the UUID capability model.
  if (!leaseUserId) {
    return { allowed: true };
  }

  // 5. Owned lease; caller is neither the owner nor holding a valid share token.
  return {
    allowed: false,
    status: 403,
    error: "forbidden",
    message: "Access denied.",
  };
}
