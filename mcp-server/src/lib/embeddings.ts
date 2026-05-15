const EMBED_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

export async function embed(text: string): Promise<number[]> {
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
      taskType: "RETRIEVAL_DOCUMENT",
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
