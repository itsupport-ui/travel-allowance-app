import assert from "node:assert/strict";
import test from "node:test";

import { waitForReportExportJob } from "../src/services/reportExportJob";

test("a completed export returns without polling", async () => {
  let polls = 0;
  const api = { get: async () => { polls += 1; return { data: {} }; } };
  const job = await waitForReportExportJob(
    api as never,
    { id: "job-1", status: "completed", download_url: "/download" },
    undefined,
    1,
    0
  );
  assert.equal(job.download_url, "/download");
  assert.equal(polls, 0);
});

test("a queued export polls until its artifact is completed", async () => {
  let polls = 0;
  const api = {
    get: async () => {
      polls += 1;
      return { data: { id: "job-2", status: "completed", download_url: "/ready" } };
    },
  };
  const job = await waitForReportExportJob(
    api as never,
    { id: "job-2", status: "queued", download_url: null },
    undefined,
    1,
    0
  );
  assert.equal(job.download_url, "/ready");
  assert.equal(polls, 1);
});

test("failed export jobs stop with actionable feedback", async () => {
  await assert.rejects(
    waitForReportExportJob(
      { get: async () => ({ data: {} }) } as never,
      { id: "job-3", status: "failed", download_url: null },
      undefined,
      1,
      0
    ),
    /generation failed/i
  );
});
