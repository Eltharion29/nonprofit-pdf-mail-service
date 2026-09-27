import { createServer } from "node:http";
import { ZodError } from "zod";
import { createCaller, deliver, deliverySchema, InfraiError } from "./nonprofit_delivery.ts";

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
const call = createCaller(key);

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/deliver") {
    res.writeHead(404).end();
    return;
  }
  try {
    let raw = "";
    for await (const part of req) {
      raw += part;
      if (raw.length > 64_000) throw new Error("Request body too large");
    }
    const input = deliverySchema.parse(JSON.parse(raw));
    const result = await deliver(input, call);
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof ZodError || error instanceof SyntaxError ? 400
      : error instanceof InfraiError && error.status >= 400 && error.status < 500 ? error.status
      : 500;
    res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected error" }));
  }
}).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`Nonprofit delivery listening on ${process.env.PORT ?? 3000}`);
});
