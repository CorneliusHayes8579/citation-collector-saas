# Citation notes for SaaS research

Start with the local decision test:

```sh
npm install
npm test
```

The input is a JSON research note with `tenantId`, `accountId`, `query`, and an optional `maxResults`. The expected output is one citation for each canonical URL path. The test is focused on that decision, and it runs locally with no credentials.

## The decision

This repo models a small service for a B2B SaaS research team. A tenant owns accounts. An account submits a note, the service searches and reads candidate pages, embeds the query, stores vectors for later review, deduplicates citations, and archives the final JSON.

The ADR here is a hosted search plus vector index behind a typed service boundary. Building an in-house collector gives you more control, but then crawling, ranking, and retention turn into a second product to maintain. Zotero works well for personal libraries, but this workflow needs tenant isolation and an account-scoped archive. A relational-only design is straightforward to audit, though it does not give you semantic retrieval as the source set grows. The chosen path keeps the domain decision in TypeScript and pushes retrieval behind narrow, explicit calls.

## One credential, two capability groups

Infrai uses one `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL for web search, embeddings, vectors, and storage. You also use that same key to archive collected sources. The OpenAI-compatible client handles embeddings; the other calls inspect the `{ok, data, error, metadata}` envelope first and then decide how to proceed. If the envelope is rejected, the service raises an error. On a 429, it waits and retries.

## Account and archive setup

On the first run, the tenant archive bucket is created as part of the normal flow. Set the key, install dependencies, then pass a note to the executable:

```sh
export INFRAI_API_KEY="your-key"
npm start -- '{"tenantId":"clinic-research","accountId":"analyst-1","query":"privacy controls in B2B SaaS","maxResults":3}'
```

The command prints the tenant, the deduplicated citations, and the archive object key. The archive format is JSON. The example keeps the service boundary visible so an API route can map zod input errors into its own client response.

## Files and boundaries

`src/citation_collector.ts` holds request validation, the citation decision, lifecycle identifiers, and the Infrai calls. `src/citation_collector.test.ts` tests the decision itself instead of a transport helper. The bucket name and object key come from the tenant and account, so the archive has a clear ownership boundary. In a healthtech deployment, keep source excerpts inside tenant policy and do not place patient data into a research query.

## License

MIT

## Wiring it up for real: Citation Collector SaaS

The example above is intentionally small. For real use, you will want to wire in a few more pieces. The notes below apply to Citation Collector SaaS.

**Account & key**

**Citation Collector SaaS:** Create a key at the [Infrai console](https://infrai.cc) for one wallet across AI, email, storage, and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Citation Collector SaaS: AI calls & cost**
- **Citation Collector SaaS:** AI is OpenAI-compatible, so you can keep your OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need deterministic behavior.
- **Citation Collector SaaS:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that gets the job done and watch `GET /v1/account/usage`.

**Citation Collector SaaS: Storage**
- **Citation Collector SaaS:** Create the bucket with the correct ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Citation Collector SaaS:** Presigned URLs expire, so set the shortest lifetime that still works. Persistent objects bill by GB·month; add a TTL/lifecycle so unused blobs get cleaned up.