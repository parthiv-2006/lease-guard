import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

function getClient(): GoogleGenerativeAI {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function embed(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Cannot embed empty text");
  }

  const client = getClient();
  const model = client.getGenerativeModel({ model: "text-embedding-004" });

  try {
    const result = await model.embedContent(text.trim());
    const embedding = result.embedding?.values;

    if (!embedding || embedding.length === 0) {
      throw new Error("Gemini returned empty embedding values");
    }

    if (embedding.length !== 768) {
      throw new Error(
        `Expected 768-dimensional embedding, got ${embedding.length}`
      );
    }

    return embedding;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Embedding generation failed: ${err.message}`);
    }
    throw new Error("Embedding generation failed: unknown error");
  }
}
