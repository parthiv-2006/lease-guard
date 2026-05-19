const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

/**
 * Embed text using the Gemini embedding model.
 *
 * @param text - Text to embed (will be trimmed and capped at 2000 chars internally)
 * @param taskType - Gemini task type:
 *   - "RETRIEVAL_QUERY"    → use when embedding a search query (lookup tools)
 *   - "RETRIEVAL_DOCUMENT" → use when embedding corpus documents (build_corpus scripts)
 *   Defaults to "RETRIEVAL_QUERY" because the majority of runtime call sites are query lookups.
 */
export async function embed(
  text: string,
  taskType: "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT" = "RETRIEVAL_QUERY"
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  const resp = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text.trim() }] },
      taskType,
      outputDimensionality: 768,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Gemini embedding API error ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;

  if (!values || values.length === 0) {
    throw new Error("Gemini returned empty embedding values");
  }
  if (values.length !== 768) {
    throw new Error(`Expected 768-dim embedding, got ${values.length}`);
  }

  return values;
}
