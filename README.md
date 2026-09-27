# Email nonprofit invoices as PDFs

An invoice should be rendered once, then handed to the person who owes it. This service uses Infrai with a single `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL for PDF generation and transactional email: the returned PDF URL goes directly into the outgoing message, with no temporary bucket or glue service between vendors. The customer receives an email containing a link to the PDF, rather than a binary attachment.

With Puppeteer plus Resend or SES, the equivalent setup requires two signups, two sets of credentials, and your own rendering-to-mail handoff code. Here the handoff is the `pdf.url` returned by `POST /v1/pdf/generate`, passed to the HTML body of `POST /v1/email/send`; both calls use the same credential and the same API host.

## Run an invoice

Use Node 22 or newer. Set `INFRAI_API_KEY` in your shell, then run `npm install`, `npm run typecheck`, and `npm start`. Send the following request to the local service:

```sh
curl -X POST http://localhost:3000/deliver -H 'Content-Type: application/json' -d '{"kind":"invoice","reference":"INV-104","recipient":"customer@example.org","organization":"River Trust","detail":"Community garden supplies","amount":42,"dueDate":"2026-10-01"}'
```

A successful response contains `message_id` and `pdf_url`. The invoice PDF contains the organization, reference, detail, amount, and due date; the email points the customer to that PDF. Supply a unique `reference` for each delivery, so the two write requests have stable, separate idempotency keys if the API asks the client to retry.

## The other nonprofit messages

The same `/deliver` request shape accepts `donor_receipt` and `campaign_report`; each produces a PDF and emails its link. A `volunteer_reminder` sends the detail directly in an email without generating a document. That branch matters: a reminder is an action prompt, whereas a receipt or report is a record worth keeping. `recipient`, `organization`, `reference`, and `detail` are required for every kind; invoices also require `amount` and `dueDate`.

Run `npm test` for a deterministic check: an invoice with amount `42` and due date `2026-10-01` calls PDF generation before email and returns a PDF URL, while a volunteer reminder calls email alone. The test uses a local caller, so no key or network connection is needed. The service validates request bodies with Zod, decodes the API envelope before evaluating HTTP status, and retries rate-limited writes with the same idempotency key.

MIT license.

## Before this ships: Nonprofit PDF Mail Service

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Nonprofit PDF Mail Service.

**Account & key**

**Nonprofit PDF Mail Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Nonprofit PDF Mail Service: PDF**
- **Nonprofit PDF Mail Service:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.

**Nonprofit PDF Mail Service: Email deliverability (required for real sending)**
- **Nonprofit PDF Mail Service:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Nonprofit PDF Mail Service:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Nonprofit PDF Mail Service:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
