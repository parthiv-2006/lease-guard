import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("Missing GEMINI_API_KEY environment variable");
}

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function embed(text: string): Promise<number[]> {
  const model = genai.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent({
    content: { parts: [{ text }], role: "user" },
    taskType: "RETRIEVAL_QUERY" as never,
  });
  return result.embedding.values;
}

export async function embedDocument(text: string): Promise<number[]> {
  const model = genai.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent({
    content: { parts: [{ text }], role: "user" },
    taskType: "RETRIEVAL_DOCUMENT" as never,
  });
  return result.embedding.values;
}
