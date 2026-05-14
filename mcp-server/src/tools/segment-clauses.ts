import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { Clause } from "../types.js";

export const toolDefinition = {
  name: "segment_clauses",
  description:
    "Split a lease document's raw text into individual clauses using numbered patterns, ALL CAPS headings, and structural markers.",
  inputSchema: {
    type: "object" as const,
    properties: {
      raw_text: {
        type: "string",
        description: "The full raw text of the lease document",
      },
      jurisdiction_code: {
        type: "string",
        description: "Jurisdiction code e.g. CA-ON",
      },
    },
    required: ["raw_text", "jurisdiction_code"],
  },
};

const InputSchema = z.object({
  raw_text: z.string().min(1, "raw_text must not be empty"),
  jurisdiction_code: z.string().min(1, "jurisdiction_code must not be empty"),
});

// Patterns that indicate a new clause boundary, in priority order
const CLAUSE_BOUNDARY_PATTERNS = [
  // "1." or "1.2" or "1.2.3" at line start
  /^(\d+(?:\.\d+)*)\.\s+(.+)/,
  // Alphabetic: "A." or "B." at line start (uppercase only to avoid sentences)
  /^([A-Z])\.\s+(.+)/,
  // Parenthetical sub-clause: "(a)" "(i)" at line start
  /^(\([a-z]\))\s+(.+)/,
  // ALL CAPS heading (4+ chars, not mid-sentence punctuation)
  /^([A-Z][A-Z\s]{3,}[A-Z])(?:\s*:)?\s*$/,
  // "ARTICLE X" or "SECTION X"
  /^(ARTICLE|SECTION)\s+(\d+|[IVXLC]+)(?:\s*[:–-])?\s*(.*)/i,
];

const CROSS_REFERENCE_PATTERNS = [
  /subject to (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /as per (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /see (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /pursuant to (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /in accordance with (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /referred? to in (?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)/gi,
  /(?:clause|section|paragraph|article)\s+([\d.]+[a-z]?)\s+(?:above|below|hereof)/gi,
];

function extractCrossReferences(text: string): string[] {
  const refs = new Set<string>();
  for (const pattern of CROSS_REFERENCE_PATTERNS) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      refs.add(match[1]);
    }
  }
  return [...refs];
}

function identifyBoundaryLine(line: string): {
  matched: boolean;
  number: string;
  heading?: string;
} {
  for (const pattern of CLAUSE_BOUNDARY_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      if (pattern === CLAUSE_BOUNDARY_PATTERNS[3]) {
        // ALL CAPS heading — number is synthetic
        return { matched: true, number: "", heading: match[0].trim() };
      }
      if (pattern === CLAUSE_BOUNDARY_PATTERNS[4]) {
        // ARTICLE/SECTION
        const num = match[2];
        const heading = match[3]?.trim() || undefined;
        return { matched: true, number: `${match[1]} ${num}`, heading };
      }
      return {
        matched: true,
        number: match[1],
        heading: match[2]?.trim(),
      };
    }
  }
  return { matched: false, number: "" };
}

export async function execute(input: unknown): Promise<unknown> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: "Invalid input",
      details: parsed.error.flatten(),
    };
  }

  const { raw_text } = parsed.data;

  const lines = raw_text.split("\n");
  const clauses: Clause[] = [];
  let charOffset = 0;

  // Track current clause accumulation
  let currentNumber = "";
  let currentHeading: string | undefined;
  let currentLines: string[] = [];
  let currentStart = 0;
  let boundaryCount = 0;

  function flushCurrent() {
    if (currentLines.length === 0) return;

    const rawText = currentLines.join("\n").trim();
    if (!rawText) return;

    clauses.push({
      id: uuidv4(),
      number: currentNumber || `synthetic-${clauses.length + 1}`,
      heading: currentHeading,
      raw_text: rawText,
      char_start: currentStart,
      char_end: currentStart + rawText.length,
      cross_references: extractCrossReferences(rawText),
    });
  }

  // Handle the degenerate case: single long text block with no numbering
  const hasBoundaries = lines.some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && identifyBoundaryLine(trimmed).matched;
  });

  if (!hasBoundaries && raw_text.length > 0) {
    // Attempt to split by double newline (paragraph breaks)
    const paragraphs = raw_text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    if (paragraphs.length > 1) {
      let offset = 0;
      for (const para of paragraphs) {
        const start = raw_text.indexOf(para, offset);
        clauses.push({
          id: uuidv4(),
          number: `synthetic-${clauses.length + 1}`,
          heading: undefined,
          raw_text: para,
          char_start: start,
          char_end: start + para.length,
          cross_references: extractCrossReferences(para),
        });
        offset = start + para.length;
      }
    } else {
      // Single block fallback
      clauses.push({
        id: uuidv4(),
        number: "synthetic-1",
        heading: undefined,
        raw_text: raw_text.trim(),
        char_start: 0,
        char_end: raw_text.trim().length,
        cross_references: extractCrossReferences(raw_text),
      });
    }

    return {
      clauses,
      total_count: clauses.length,
      segmentation_confidence: 0.3,
    };
  }

  for (const line of lines) {
    const lineWithNewline = line + "\n";
    const trimmed = line.trim();

    const boundary = identifyBoundaryLine(trimmed);

    if (boundary.matched && trimmed.length > 0) {
      flushCurrent();
      boundaryCount++;
      currentNumber = boundary.number;
      currentHeading = boundary.heading;
      currentLines = [line];
      currentStart = charOffset;
    } else {
      currentLines.push(line);
    }

    charOffset += lineWithNewline.length;
  }

  // Flush the last clause
  flushCurrent();

  // Calculate confidence based on how structured the document was
  let segmentationConfidence: number;
  if (boundaryCount === 0) {
    segmentationConfidence = 0.2;
  } else if (boundaryCount >= 5 && clauses.length >= 5) {
    segmentationConfidence = 0.85;
  } else if (boundaryCount >= 2) {
    segmentationConfidence = 0.6;
  } else {
    segmentationConfidence = 0.4;
  }

  return {
    clauses,
    total_count: clauses.length,
    segmentation_confidence: segmentationConfidence,
  };
}
