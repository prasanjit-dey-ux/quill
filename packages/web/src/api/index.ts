import { Hono } from 'hono';
import { cors } from "hono/cors"
import { streamText } from "ai";
import dedent from "dedent";
import { gateway, MODEL } from "./agent/gateway";
import { db } from "./database";
import { sharedPages } from "./database/schema";
import { eq } from "drizzle-orm";

function shortId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}

const SYSTEM = dedent`
  You are Quill's writing assistant, embedded in a minimal note + todo app.
  The user's note may contain plain lines and checklist items.
  Be concise, warm, and practical. Never use markdown headers or code fences
  unless explicitly producing a checklist. Match the user's tone.
  When asked to produce todos, output them as lines starting with "- [ ] ".
`;

function buildPrompt(action: string, note: string, instruction?: string) {
  const ctx = `Here is the note:\n"""\n${note || "(empty)"}\n"""`;
  switch (action) {
    case "summarise":
      return `${ctx}\n\nSummarise this note in 2-4 tight sentences. No preamble.`;
    case "improve":
      return `${ctx}\n\nRewrite this note to be clearer and better written while keeping every detail and the original meaning. Keep checklist items as "- [ ] " lines. Output only the improved note.`;
    case "suggest":
      return `${ctx}\n\nSuggest 3-5 useful next tasks based on this note. Output ONLY checklist lines starting with "- [ ] ". No intro.`;
    case "ask":
      return `${ctx}\n\nUser request: ${instruction}\n\nAnswer helpfully based on the note. If they ask for tasks, output "- [ ] " lines.`;
    default:
      return ctx;
  }
}

const app = new Hono()
  .basePath('api')
  .use(cors({ origin: (origin) => origin ?? "*", credentials: true, exposeHeaders: ["set-auth-token"] }))
  .get('/ping', (c) => c.json({ message: `Pong! ${Date.now()}` }, 200))
  .get('/health', (c) => c.json({ status: 'ok' }, 200))
  .post('/ai', async (c) => {
    const { action, note, instruction } = await c.req.json<{
      action: string; note: string; instruction?: string;
    }>();
    const result = streamText({
      model: gateway(MODEL),
      system: SYSTEM,
      prompt: buildPrompt(action, note ?? "", instruction),
    });
    return result.toTextStreamResponse();
  })

  // ── Sharing ──────────────────────────────────────────────────────────────
  // Create or update a share for a page. Returns { shareId, mode }.
  .post('/share', async (c) => {
    const body = await c.req.json<{
      shareId?: string;
      ownerKey: string;
      mode: "view" | "edit";
      title: string;
      blocks: unknown;
    }>();
    const now = Date.now();
    const blocksJson = JSON.stringify(body.blocks ?? []);

    if (body.shareId) {
      const existing = await db.select().from(sharedPages).where(eq(sharedPages.shareId, body.shareId)).get();
      if (existing && existing.ownerKey === body.ownerKey) {
        await db.update(sharedPages).set({
          mode: body.mode, title: body.title, blocks: blocksJson, updatedAt: now,
        }).where(eq(sharedPages.shareId, body.shareId));
        return c.json({ shareId: body.shareId, mode: body.mode }, 200);
      }
    }
    const shareId = shortId();
    await db.insert(sharedPages).values({
      shareId, ownerKey: body.ownerKey, mode: body.mode,
      title: body.title, blocks: blocksJson, createdAt: now, updatedAt: now,
    });
    return c.json({ shareId, mode: body.mode }, 200);
  })

  // Owner pushes latest content to keep the share in sync.
  .put('/share/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ ownerKey: string; title: string; blocks: unknown }>();
    const existing = await db.select().from(sharedPages).where(eq(sharedPages.shareId, id)).get();
    if (!existing) return c.json({ error: "not found" }, 404);
    if (existing.ownerKey !== body.ownerKey) return c.json({ error: "forbidden" }, 403);
    await db.update(sharedPages).set({
      title: body.title, blocks: JSON.stringify(body.blocks ?? []), updatedAt: Date.now(),
    }).where(eq(sharedPages.shareId, id));
    return c.json({ ok: true }, 200);
  })

  // Public: fetch a shared page.
  .get('/share/:id', async (c) => {
    const id = c.req.param('id');
    const row = await db.select().from(sharedPages).where(eq(sharedPages.shareId, id)).get();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({
      shareId: row.shareId,
      mode: row.mode,
      title: row.title,
      blocks: JSON.parse(row.blocks),
      updatedAt: row.updatedAt,
    }, 200);
  })

  // Public (edit mode only): a viewer with edit access saves changes.
  .post('/share/:id/edit', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ title: string; blocks: unknown }>();
    const row = await db.select().from(sharedPages).where(eq(sharedPages.shareId, id)).get();
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.mode !== "edit") return c.json({ error: "read only" }, 403);
    await db.update(sharedPages).set({
      title: body.title, blocks: JSON.stringify(body.blocks ?? []), updatedAt: Date.now(),
    }).where(eq(sharedPages.shareId, id));
    return c.json({ ok: true }, 200);
  });

export type AppType = typeof app;
export default app;
