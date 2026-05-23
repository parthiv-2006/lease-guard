"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const errorParam = searchParams.get("error");

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorParam ?? null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function handleGoogle() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) setError(error.message);
      else setMessage("Check your email for a confirmation link.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push(next);
    }
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    if (error) setError(error.message);
    else setMessage("Check your email for a password reset link.");
    setLoading(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f6f3ee",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          height: "56px",
          borderBottom: "1px solid #e8e4dc",
          background: "#f6f3ee",
          flexShrink: 0,
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 600,
            fontSize: "17px",
            letterSpacing: "0.02em",
            color: "#181614",
            textDecoration: "none",
          }}
        >
          LeaseGuard
        </Link>
      </header>

      {/* Form */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "380px" }}>
          <h1
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 600,
              fontSize: "32px",
              color: "#181614",
              letterSpacing: "-0.02em",
              margin: "0 0 8px",
            }}
          >
            {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
          </h1>
          <p style={{ fontSize: "14px", color: "#6b6560", margin: "0 0 28px" }}>
            {mode === "signin"
              ? "Sign in to see your saved analyses."
              : mode === "signup"
              ? "Save your lease analyses and access them anytime."
              : "Enter your email and we'll send you a reset link."}
          </p>

          {/* Error / message banners */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "7px",
                fontSize: "13px",
                color: "#b91c1c",
                marginBottom: "16px",
              }}
            >
              {error}
            </div>
          )}
          {message && (
            <div
              style={{
                padding: "10px 14px",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "7px",
                fontSize: "13px",
                color: "#15803d",
                marginBottom: "16px",
              }}
            >
              {message}
            </div>
          )}

          {mode === "forgot" ? (
            /* Forgot password form */
            <form onSubmit={handleForgot}>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#5c5751",
                    marginBottom: "5px",
                    letterSpacing: "0.02em",
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "7px",
                    border: "1px solid #e8e4dc",
                    background: "#fff",
                    fontSize: "14px",
                    color: "#181614",
                    fontFamily: "'DM Sans', sans-serif",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "11px 20px",
                  borderRadius: "7px",
                  background: "#181614",
                  color: "#fff",
                  fontSize: "14px",
                  fontWeight: 500,
                  border: "none",
                  cursor: loading ? "wait" : "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  letterSpacing: "0.01em",
                }}
              >
                {loading ? "Please wait…" : "Send reset link"}
              </button>
              <p
                style={{
                  fontSize: "13px",
                  color: "#6b6560",
                  textAlign: "center",
                  margin: "16px 0 0",
                }}
              >
                <button
                  onClick={() => { setMode("signin"); setError(null); setMessage(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#181614",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                    padding: 0,
                    textDecoration: "underline",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </form>
          ) : (
            <>
              {/* Google OAuth */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  padding: "11px 20px",
                  borderRadius: "7px",
                  border: "1px solid #e8e4dc",
                  background: "#fff",
                  color: "#181614",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: loading ? "wait" : "pointer",
                  marginBottom: "20px",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f3ee")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z" fill="#4285F4" />
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>

              {/* Divider */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <div style={{ flex: 1, height: "1px", background: "#e8e4dc" }} />
                <span style={{ fontSize: "12px", color: "#9a9590" }}>or</span>
                <div style={{ flex: 1, height: "1px", background: "#e8e4dc" }} />
              </div>

              {/* Email/Password form */}
              <form onSubmit={handleEmail}>
                <div style={{ marginBottom: "12px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#5c5751", marginBottom: "5px", letterSpacing: "0.02em" }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e8e4dc", background: "#fff", fontSize: "14px", color: "#181614", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: mode === "signin" ? "8px" : "4px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#5c5751", marginBottom: "5px", letterSpacing: "0.02em" }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e8e4dc", background: "#fff", fontSize: "14px", color: "#181614", fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
                  />
                  {mode === "signup" && (
                    <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#9a9590" }}>
                      Minimum 6 characters
                    </p>
                  )}
                </div>

                {mode === "signin" && (
                  <div style={{ textAlign: "right", marginBottom: "20px" }}>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setError(null); setMessage(null); }}
                      style={{ background: "none", border: "none", color: "#9a9590", cursor: "pointer", fontSize: "12px", padding: 0, fontFamily: "'DM Sans', sans-serif" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#5c5751")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#9a9590")}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {mode === "signup" && <div style={{ marginBottom: "20px" }} />}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ width: "100%", padding: "11px 20px", borderRadius: "7px", background: "#181614", color: "#fff", fontSize: "14px", fontWeight: 500, border: "none", cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.01em" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#2a2825")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#181614")}
                >
                  {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
                </button>

                {mode === "signup" && (
                  <p style={{ fontSize: "11px", color: "#9a9590", textAlign: "center", margin: "12px 0 0", lineHeight: 1.55 }}>
                    By creating an account you agree to our{" "}
                    <Link href="/privacy" style={{ color: "#6b6560", textUnderlineOffset: "2px" }}>
                      Privacy Policy
                    </Link>
                    .
                  </p>
                )}
              </form>

              {/* Toggle signin/signup */}
              <p style={{ fontSize: "13px", color: "#6b6560", textAlign: "center", margin: "16px 0 0" }}>
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button
                      onClick={() => { setMode("signup"); setError(null); setMessage(null); }}
                      style={{ background: "none", border: "none", color: "#181614", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: 0, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => { setMode("signin"); setError(null); setMessage(null); }}
                      style={{ background: "none", border: "none", color: "#181614", cursor: "pointer", fontSize: "13px", fontWeight: 500, padding: 0, textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}

          {/* Guest mode */}
          <div
            style={{
              marginTop: "28px",
              paddingTop: "20px",
              borderTop: "1px solid #e8e4dc",
              textAlign: "center",
            }}
          >
            <Link
              href="/"
              style={{
                fontSize: "13px",
                color: "#9a9590",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "#6b6560")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "#9a9590")
              }
            >
              Continue as guest →
            </Link>
            <p
              style={{
                fontSize: "11px",
                color: "#b0aaa4",
                margin: "6px 0 0",
              }}
            >
              Analyses won&apos;t be saved to a dashboard
            </p>
          </div>
        </div>
      </main>

      <footer
        style={{
          padding: "16px 48px",
          borderTop: "1px solid #e8e4dc",
          fontSize: "11px",
          color: "#b0aaa4",
          textAlign: "center",
          flexShrink: 0,
          display: "flex",
          gap: "16px",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <span>Educational information only — not legal advice.</span>
        <span style={{ color: "#ddd8cf" }}>·</span>
        <Link href="/privacy" style={{ color: "#b0aaa4", textDecoration: "underline" }}>
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
