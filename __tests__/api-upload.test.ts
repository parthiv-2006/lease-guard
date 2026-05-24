/**
 * Upload route tests. Supabase and storage are mocked so these run without
 * real credentials.
 */

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
    },
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        remove: jest.fn().mockResolvedValue({ error: null }),
      })),
    },
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

import { NextRequest } from "next/server";
import { POST } from "../app/api/upload/route";

function makePdfFile(size = 1024): File {
  // %PDF magic bytes followed by filler
  const bytes = new Uint8Array(size);
  bytes[0] = 0x25; bytes[1] = 0x50; bytes[2] = 0x44; bytes[3] = 0x46;
  return new File([bytes], "lease.pdf", { type: "application/pdf" });
}

function makeRequest(file?: File): NextRequest {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new NextRequest("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  });
}

describe("POST /api/upload", () => {
  it("accepts a valid PDF and returns 202", async () => {
    const res = await POST(makeRequest(makePdfFile()));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("processing");
    expect(body.lease_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns 400 when no file is provided", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_file");
  });

  it("returns 415 for a non-PDF file", async () => {
    const txtFile = new File(["hello world"], "lease.txt", { type: "text/plain" });
    const res = await POST(makeRequest(txtFile));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toBe("invalid_file_type");
  });

  it("returns 413 for a file exceeding 25MB", async () => {
    const bigFile = makePdfFile(26 * 1024 * 1024);
    const res = await POST(makeRequest(bigFile));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("file_too_large");
  });

  it("returns 400 when body is not form-data", async () => {
    const req = new NextRequest("http://localhost/api/upload", {
      method: "POST",
      body: JSON.stringify({ file: "not-a-file" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
