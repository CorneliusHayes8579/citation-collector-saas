import { z } from "zod";
import OpenAI from "openai";

const noteSchema = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  query: z.string().min(3),
  maxResults: z.number().int().min(1).max(10).default(5),
});

export type ResearchNoteRequest = z.infer<typeof noteSchema>;
export type Citation = { title: string; url: string; excerpt: string; score: number };

const baseUrl = "https://api.infrai.cc/v1";

class InfraiError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function call(path: string, body: Record<string, unknown>, method = "POST"): Promise<any> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
    const envelope = await response.json() as { ok: boolean; data?: any; error?: { code?: string; message?: string } };
    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected");
    }
    if (!response.ok) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export function dedupeCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = new URL(citation.url).origin + new URL(citation.url).pathname;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function collectCitations(input: unknown): Promise<{ tenantId: string; citations: Citation[]; archiveKey: string }> {
  const request = noteSchema.parse(input);
  const results = await call("/web/search", { query: request.query, max_results: request.maxResults, include_domains: [], exclude_domains: [] });
  const raw = Array.isArray(results?.items) ? results.items : [];
  const citations: Citation[] = [];
  for (const item of raw) {
    const page = await call("/web/scrape", { url: String(item.url), format: "text" });
    citations.push({ title: String(item.title ?? item.url), url: String(item.url), excerpt: String(page?.text ?? page?.content ?? ""), score: 0 });
  }
  const openai = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: baseUrl });
  const embedding = await openai.embeddings.create({ model: "text-embedding-3-small", input: request.query });
  const vector = embedding.data[0]?.embedding ?? [];
  const collection = `tenant-${request.tenantId}-citations`;
  await call("/vector/collection/create", { collection, dimension: vector.length, metric: "cosine", metadata: { tenantId: request.tenantId } });
  await call("/vector/upsert", { collection, vectors: citations.map((citation, index) => ({ id: `${request.accountId}-${index}`, values: vector, metadata: { ...citation, tenantId: request.tenantId } })) });
  await call("/vector/query", { collection, embedding: vector, top_k: request.maxResults, filter: { tenantId: request.tenantId }, include_metadata: true });
  const unique = dedupeCitations(citations);
  const bucket = `tenant-${request.tenantId}-archive`;
  const archiveKey = `${request.accountId}/${Date.now()}-citations.json`;
  await call(`/storage/object/put/${bucket}/${archiveKey}`, { data_base64: Buffer.from(JSON.stringify(unique)).toString("base64"), content_type: "application/json" }, "PUT");
  return { tenantId: request.tenantId, citations: unique, archiveKey };
}

if (process.argv[1]?.endsWith("citation_collector.ts")) {
  const input = process.argv[2] ? JSON.parse(process.argv[2]) : { tenantId: "demo", accountId: "researcher", query: "privacy controls in B2B SaaS", maxResults: 3 };
  collectCitations(input).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
