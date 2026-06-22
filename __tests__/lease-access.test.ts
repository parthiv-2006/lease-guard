import { checkLeaseAccess } from "../lib/lease-access";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const TOKEN = "abc123token";

describe("checkLeaseAccess", () => {
  it("allows the authenticated owner of an owned lease", () => {
    expect(
      checkLeaseAccess({ leaseUserId: OWNER, authUserId: OWNER })
    ).toEqual({ allowed: true });
  });

  it("DENIES an anonymous caller who only knows an owned lease's UUID", () => {
    const res = checkLeaseAccess({ leaseUserId: OWNER, authUserId: null });
    expect(res.allowed).toBe(false);
    if (!res.allowed) {
      expect(res.error).toBe("forbidden");
      expect(res.status).toBe(403);
    }
  });

  it("DENIES a different authenticated user on an owned lease", () => {
    const res = checkLeaseAccess({ leaseUserId: OWNER, authUserId: OTHER });
    expect(res.allowed).toBe(false);
  });

  it("allows anyone presenting a matching share token on an owned lease", () => {
    expect(
      checkLeaseAccess({
        leaseUserId: OWNER,
        authUserId: null,
        providedToken: TOKEN,
        reportShareToken: TOKEN,
      })
    ).toEqual({ allowed: true });
  });

  it("rejects a wrong share token with invalid_token (even on a guest lease)", () => {
    const res = checkLeaseAccess({
      leaseUserId: null,
      authUserId: null,
      providedToken: "wrong",
      reportShareToken: TOKEN,
    });
    expect(res.allowed).toBe(false);
    if (!res.allowed) expect(res.error).toBe("invalid_token");
  });

  it("allows a guest (ownerless) lease via the bare UUID", () => {
    expect(
      checkLeaseAccess({ leaseUserId: null, authUserId: null })
    ).toEqual({ allowed: true });
  });

  it("allows an authenticated non-owner to view a guest lease via UUID", () => {
    // Guest leases have no owner to protect — historical behaviour preserved.
    expect(
      checkLeaseAccess({ leaseUserId: null, authUserId: OTHER })
    ).toEqual({ allowed: true });
  });
});
