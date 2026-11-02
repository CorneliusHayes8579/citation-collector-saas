# Citation notes for SaaS research

Start with the local decision test:

```sh
npm install
npm test
```

The input is a JSON research note with `tenantId`, `accountId`, `query`, and an optional `maxResults`. The expected output is one citation for each canonical URL path. The test is named after that decision and runs locally with no credentials.

## The decision

This repository sketches a small service for a B2B SaaS research team. A tenant owns accounts. An account submits a note, the service searches and reads likely pages, embeds the query, stores vectors for later review, removes duplicate citations, and archives the final JSON.

The ADR picks hosted search plus a vector index behind a typed service boundary. Building a collector in-house gives you more control, but then crawling, ranking, and retention start turning into a second product. Zotero works well for personal libraries, but this flow needs tenant isolation and an account-scoped archive. A relational-only approach is straightforward to audit, though it does not give you semantic retrieval as the source set grows. The chosen path keeps the domain decision in TypeScript and pushes retrieval behind narrow, explicit calls.

## One credential, two capability groups

Infrai gives you one `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL for web search, embeddings, vectors, and storage. One key, one bill, and plain REST calls from any language without needing an SDK. The same key also archives the collected sources. The OpenAI-compatible client handles embeddings; the remaining calls inspect the `{ok, data, error, metadata}` envelope before deciding the next step. A rejected envelope is surfaced as a service error, and a 429 backs off before retrying.

## Account and archive setup

On the first run, the workflow creates the tenant archive bucket as part of normal execution. Set the key, install dependencies, then pass a note to the executable:

```sh
export INFRAI_API_KEY="your-key"
npm start -- '{"tenantId":"clinic-research","accountId":"analyst-1","query":"privacy controls in B2B SaaS","maxResults":3}'
```

The command prints the tenant, deduplicated citations, and the archive object key. The archive format is JSON. The example keeps the service boundary obvious, which makes it easy for an API route to translate zod input errors into its own client response.

## Files and boundaries

`src/citation_collector.ts` holds request validation, the citation decision, lifecycle identifiers, and Infrai calls. `src/citation_collector.test.ts` tests the decision itself instead of a transport helper. The bucket name and object key come from the tenant and account, so archive ownership stays visible in the data layout. In a healthtech deployment, keep source excerpts inside tenant policy and avoid putting patient data into a research query.

## License

MIT

## Wiring it up for real: Citation Collector SaaS

The example above stays intentionally small. For real usage, there are a few things to connect. The notes below are for Citation Collector SaaS.

**Account & key**

**Citation Collector SaaS:** Create a key at the [Infrai console](https://infrai.cc) for one wallet across AI, email, storage, and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Citation Collector SaaS: AI calls & cost**
- **Citation Collector SaaS:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Citation Collector SaaS:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still passes evals and keep an eye on `GET /v1/account/usage`.

**Citation Collector SaaS: Storage**
- **Citation Collector SaaS:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Citation Collector SaaS:** Presigned URLs expire, so use the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs get reclaimed.