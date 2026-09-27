import assert from "node:assert/strict";
import { test } from "node:test";
import { deliver, deliverySchema, type Call } from "../src/nonprofit_delivery.ts";

test("invoice renders before mailing its PDF link; reminder skips rendering", async () => {
  const paths: string[] = [];
  const call: Call = async <T>(path: string): Promise<T> => {
    paths.push(path);
    return (path.includes("pdf") ? { url: "https://example.org/invoice.pdf" } : { message_id: "msg-1" }) as T;
  };
  const common = { reference: "N-104", recipient: "donor@example.org", organization: "River Trust", detail: "Watershed work" };
  const invoice = await deliver(deliverySchema.parse({ ...common, kind: "invoice", amount: 42, dueDate: "2026-10-01" }), call);
  assert.deepEqual(paths, ["/v1/pdf/generate", "/v1/email/send"]);
  assert.equal(invoice.pdf_url, "https://example.org/invoice.pdf");
  paths.length = 0;
  const reminder = await deliver(deliverySchema.parse({ ...common, kind: "volunteer_reminder" }), call);
  assert.deepEqual(paths, ["/v1/email/send"]);
  assert.equal(reminder.pdf_url, undefined);
});
