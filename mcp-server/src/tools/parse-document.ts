import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../lib/supabase.js";

export const toolDefinition = {
  name: "parse_document",
  description:
    "Parse a PDF lease document into raw text. Spawns a Python subprocess to handle PDF extraction with optional OCR fallback.",
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string",
        description: "Absolute local path to the PDF file (stdio/local mode only)",
      },
      storage_path: {
        type: "string",
        description: "Supabase Storage path within the 'leases' bucket (used when MCP server is remote)",
      },
      ocr_fallback: {
        type: "boolean",
        description:
          "Whether to use OCR if direct text extraction fails or yields low confidence",
      },
    },
    required: ["ocr_fallback"],
  },
};

const InputSchema = z.object({
  file_path: z
    .string()
    .min(1)
    .optional()
    .refine(
      (p) => !p || (!p.includes("..") && !p.includes("\0")),
      { message: "Invalid file_path: path traversal sequences are not permitted" }
    ),
  storage_path: z.string().min(1).optional(),
  ocr_fallback: z.boolean(),
});

interface ParseResult {
  raw_text: string;
  page_count: number;
  extraction_method: "text" | "ocr" | "unknown";
  confidence: number;
  metadata: {
    file_path: string;
    file_size_bytes: number | null;
    title: string | null;
    author: string | null;
    creation_date: string | null;
    ocr_fallback_used: boolean;
  };
}

function runPythonScript(
  scriptPath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn("python", [scriptPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: `Failed to spawn process: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { file_path, storage_path, ocr_fallback } = parsed.data;

  if (!file_path && !storage_path) {
    return { error: "Invalid input", details: "Either file_path or storage_path must be provided" };
  }

  // If storage_path is given, download from Supabase Storage to a local temp file
  let localFilePath = file_path ?? "";
  let tempPath: string | null = null;

  if (storage_path) {
    const { data, error: dlError } = await supabase.storage.from("leases").download(storage_path);
    if (dlError || !data) {
      return { error: "Storage download failed", details: dlError?.message ?? "No data returned" };
    }
    tempPath = path.join(os.tmpdir(), `leaseguard-parse-${uuidv4()}.pdf`);
    fs.writeFileSync(tempPath, Buffer.from(await data.arrayBuffer()));
    localFilePath = tempPath;
  }

  // Resolve the script path relative to the mcp-server directory
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
    "scripts",
    "parse_pdf.py"
  );

  const args: string[] = [localFilePath];
  if (ocr_fallback) {
    args.push("--ocr");
  }

  const { stdout, stderr, exitCode } = await runPythonScript(scriptPath, args);

  if (exitCode !== 0) {
    const errorMsg = stderr.trim() || "Python subprocess exited with non-zero code";

    // Distinguish common error types
    if (
      errorMsg.toLowerCase().includes("no such file") ||
      errorMsg.toLowerCase().includes("not found")
    ) {
      return {
        error: "File not found",
        details: `The file at path '${file_path}' could not be found`,
        exit_code: exitCode,
        stderr: errorMsg,
      };
    }

    return {
      error: "PDF parsing subprocess failed",
      details: errorMsg,
      exit_code: exitCode,
    };
  }

  const rawOutput = stdout.trim();

  if (!rawOutput) {
    return {
      error: "Empty output from PDF parser",
      details:
        "The Python subprocess produced no output. The file may be empty, corrupted, or a scanned image requiring OCR.",
      suggestion: ocr_fallback
        ? "OCR was already attempted. The document may be unreadable."
        : "Try again with ocr_fallback: true",
    };
  }

  let result: ParseResult;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jsonData = JSON.parse(rawOutput) as any;

    // Validate expected shape
    if (typeof jsonData !== "object" || jsonData === null) {
      throw new Error("Expected JSON object from parser");
    }

    // Check for binary garbage / non-text content
    const rawText = typeof jsonData.raw_text === "string" ? jsonData.raw_text : "";
    const nonPrintableRatio =
      rawText.length > 0
        ? (rawText.match(/[\x00-\x08\x0E-\x1F\x7F-\x9F]/g) ?? []).length /
          rawText.length
        : 0;

    if (nonPrintableRatio > 0.1) {
      return {
        error: "Binary or corrupted content detected",
        details:
          "The extracted text contains a high ratio of non-printable characters, indicating the file may be corrupt or not a valid text PDF.",
        non_printable_ratio: nonPrintableRatio,
        suggestion: ocr_fallback
          ? "OCR was already attempted."
          : "Try again with ocr_fallback: true",
      };
    }

    result = {
      raw_text: rawText,
      page_count:
        typeof jsonData.page_count === "number" ? jsonData.page_count : 0,
      extraction_method: ["text", "ocr"].includes(
        jsonData.extraction_method
      )
        ? (jsonData.extraction_method as ParseResult["extraction_method"])
        : "unknown",
      confidence:
        typeof jsonData.confidence === "number"
          ? Math.min(1, Math.max(0, jsonData.confidence))
          : 0.5,
      metadata: {
        file_path: storage_path ?? file_path ?? localFilePath,
        file_size_bytes:
          typeof jsonData.metadata?.file_size_bytes === "number"
            ? jsonData.metadata.file_size_bytes
            : null,
        title:
          typeof jsonData.metadata?.title === "string"
            ? jsonData.metadata.title
            : null,
        author:
          typeof jsonData.metadata?.author === "string"
            ? jsonData.metadata.author
            : null,
        creation_date:
          typeof jsonData.metadata?.creation_date === "string"
            ? jsonData.metadata.creation_date
            : null,
        ocr_fallback_used: ocr_fallback && jsonData.extraction_method === "ocr",
      },
    };
  } catch (err) {
    return {
      error: "Failed to parse JSON output from PDF parser",
      details: err instanceof Error ? err.message : "Unknown JSON parse error",
      raw_output_preview: rawOutput.slice(0, 200),
    };
  }

  if (!result.raw_text || result.raw_text.trim().length === 0) {
    return {
      error: "No text extracted from document",
      details:
        "The PDF was parsed successfully but no text content was found. The document may be a scanned image.",
      page_count: result.page_count,
      extraction_method: result.extraction_method,
      suggestion: ocr_fallback
        ? "OCR was already attempted. The document may not contain readable text."
        : "Try again with ocr_fallback: true",
    };
  }

  if (tempPath) {
    try { fs.unlinkSync(tempPath); } catch { /* ephemeral — ignore */ }
  }
  return result;
}
