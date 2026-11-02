import test from "node:test";
import assert from "node:assert/strict";
import { dedupeCitations } from "./citation_collector.ts";

test("one canonical source wins when search returns duplicate URL paths", () => {
  const result = dedupeCitations([
    { title: "A", url: "https://docs.example.test/privacy#first", excerpt: "first", score: 1 },
    { title: "A copy", url: "https://docs.example.test/privacy#second", excerpt: "second", score: 2 },
    { title: "B", url: "https://other.example.test/security", excerpt: "third", score: 1 },
  ]);
  assert.deepEqual(result.map((item) => item.title), ["A", "B"]);
});
