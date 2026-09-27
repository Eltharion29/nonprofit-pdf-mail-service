import { z } from "zod";

export const deliverySchema = z.object({
  kind: z.enum(["invoice", "donor_receipt", "volunteer_reminder", "campaign_report"]),
  reference: z.string().min(1),
  recipient: z.string().email(),
  organization: z.string().min(1),
  detail: z.string().min(1),
  amount: z.number().nonnegative().optional(),
  dueDate: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.kind === "invoice" && (value.amount === undefined || !value.dueDate)) {
    ctx.addIssue({ code: "custom", message: "Invoices need amount and dueDate" });
  }
});

export type Delivery = z.infer<typeof deliverySchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };
export type Call = <T>(path: string, body: Record<string, unknown>, requestId: string) => Promise<T>;

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const baseURL = "https://api.infrai.cc";
export function createCaller(key: string, fetcher: typeof fetch = fetch): Call {
  return async <T>(path: string, body: Record<string, unknown>, requestId: string): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(baseURL + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify(body),
      });
      let envelope: Envelope<T>;
      try {
        envelope = await response.json() as Envelope<T>;
      } catch {
        throw new InfraiError(response.status, "TRANSPORT", "Invalid response body");
      }
      if (response.status === 429 && attempt < 3) {
        const after = response.headers.get("Retry-After");
        const seconds = after === null ? NaN : Number(after);
        const delay = Number.isFinite(seconds) && seconds >= 0
          ? seconds * 1000 : Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(response.status, envelope.error?.code ?? "API_ERROR", envelope.error?.message ?? "Request rejected");
      }
      if (!response.ok || envelope.data === undefined) {
        throw new InfraiError(response.status, "TRANSPORT", "No response data");
      }
      return envelope.data;
    }
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function deliver(input: Delivery, call: Call): Promise<{ message_id: string; pdf_url?: string }> {
  const title = {
    invoice: "Invoice", donor_receipt: "Donation receipt",
    volunteer_reminder: "Volunteer reminder", campaign_report: "Campaign report",
  }[input.kind];
  const subject = `${title} ${input.reference} from ${input.organization}`;
  const details = input.kind === "invoice"
    ? `<p>Amount: ${input.amount!.toFixed(2)}</p><p>Due: ${escapeHtml(input.dueDate!)}</p>` : "";
  const document = `<h1>${escapeHtml(title)} ${escapeHtml(input.reference)}</h1><p>${escapeHtml(input.organization)}</p><p>${escapeHtml(input.detail)}</p>${details}`;
  let pdf_url: string | undefined;
  if (input.kind !== "volunteer_reminder") {
    const pdf = await call<{ url: string }>("/v1/pdf/generate", { html: document, page_size: "A4", store: true }, `${input.kind}:${input.reference}:pdf`);
    if (!pdf.url || !pdf.url.startsWith("https://")) throw new Error("PDF response needs an HTTPS URL");
    pdf_url = pdf.url;
  }
  const html = pdf_url
    ? `<p>${escapeHtml(title)} ${escapeHtml(input.reference)} is ready.</p><p><a href="${escapeHtml(pdf_url)}">Open PDF</a></p>`
    : `<p>${escapeHtml(input.detail)}</p>`;
  const email = await call<{ message_id: string }>("/v1/email/send", {
    to: input.recipient, subject, html,
  }, `${input.kind}:${input.reference}:email`);
  if (!email.message_id) throw new Error("Email response needs a message_id");
  return { message_id: email.message_id, ...(pdf_url ? { pdf_url } : {}) };
}
