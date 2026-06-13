import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * A shared snapshot of a single Quill page.
 * The full workspace lives in the browser (localStorage); when a user shares a
 * page we persist that page's content here and hand out a short shareId.
 */
export const sharedPages = sqliteTable("shared_pages", {
  shareId: text("share_id").primaryKey(),         // short public id used in the URL
  ownerKey: text("owner_key").notNull(),          // random key from the owner's browser
  mode: text("mode", { enum: ["view", "edit"] }).notNull().default("view"),
  title: text("title").notNull().default("Untitled"),
  blocks: text("blocks").notNull().default("[]"), // JSON-encoded Block[]
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type SharedPage = typeof sharedPages.$inferSelect;
