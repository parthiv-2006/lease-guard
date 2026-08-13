"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User, AuthChangeEvent, Session } from "@supabase/supabase-js";

export function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    // Phase 1: instant local read from localStorage — clears loading with no network wait
    void (async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      setLoading(false);
    })();

    // Phase 2: server validation in background — corrects stale/expired sessions
    void (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user ?? null);
    })();

    const { data: listenerData } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
      }
    );

    return () => listenerData.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push("/");
    router.refresh();
  }

  if (loading) return <div style={{ width: "48px", height: "26px" }} />;

  if (!user) {
    return (
      <Link
        href="/sign-in"
        style={{
          fontSize: "13px",
          color: "#6f6857",
          textDecoration: "none",
          fontWeight: 400,
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#17140f")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#6f6857")}
      >
        Sign in
      </Link>
    );
  }

  const initial = (user.email ?? user.id)[0].toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setDropdownOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {/* Avatar */}
        <span
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "#17140f",
            color: "#fffdfa",
            fontSize: "11px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            letterSpacing: "0.01em",
          }}
        >
          {initial}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: dropdownOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="#6f6857"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {dropdownOpen && (
        <>
          {/* Backdrop to close on outside click */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => setDropdownOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              background: "#fffdfa",
              border: "1px solid #e0d9c6",
              borderRadius: "0",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              minWidth: "180px",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            {/* User email */}
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #e0d9c6",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "11px",
                  color: "#a8a08c",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}
              >
                Signed in as
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "13px",
                  color: "#17140f",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email ?? "—"}
              </p>
            </div>

            {/* Dashboard link */}
            <Link
              href="/dashboard"
              onClick={() => setDropdownOpen(false)}
              style={{
                display: "block",
                padding: "9px 14px",
                fontSize: "13px",
                color: "#17140f",
                textDecoration: "none",
                borderBottom: "1px solid #e0d9c6",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f7f4ee")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Dashboard
            </Link>

            {/* Sign out */}
            <button
              onClick={signOut}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "9px 14px",
                fontSize: "13px",
                color: "#6f6857",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "'Public Sans', sans-serif",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f7f4ee";
                e.currentTarget.style.color = "#9c2b23";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#6f6857";
              }}
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      style={{
        background: "none",
        border: "1px solid #e0d9c6",
        borderRadius: "0",
        padding: "5px 12px",
        fontSize: "12px",
        color: "#6f6857",
        cursor: "pointer",
        fontFamily: "'Public Sans', sans-serif",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "#9c2b23")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "#6f6857")}
    >
      Sign out
    </button>
  );
}
