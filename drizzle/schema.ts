import { boolean, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Product pricing settings for bonus calculation
 * Stores premium (2%) and base (1%) price thresholds per product
 */
export const productSettings = mysqlTable("productSettings", {
  id: int("id").autoincrement().primaryKey(),
  productId: varchar("productId", { length: 128 }).notNull().unique(),
  productName: text("productName"),
  premiumPrice: int("premiumPrice").default(70).notNull(), // سعر التميز 2%
  basePrice: int("basePrice").default(69).notNull(), // سعر الأساسي 1%
  bonus1Enabled: boolean("bonus1Enabled").default(true).notNull(), // تفعيل/إيقاف بونص 1%
  bonus2Enabled: boolean("bonus2Enabled").default(true).notNull(), // تفعيل/إيقاف بونص 2%
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductSetting = typeof productSettings.$inferSelect;
export type InsertProductSetting = typeof productSettings.$inferInsert;

/**
 * Representative (Sales Rep) settings
 * Stores nicknames, monthly targets, and bonus amounts per rep
 */
export const repSettings = mysqlTable("repSettings", {
  id: int("id").autoincrement().primaryKey(),
  repEmail: varchar("repEmail", { length: 320 }).notNull().unique(), // المندوب (email من Qoyod)
  repNickname: text("repNickname"), // اللقب/الاسم المخصص
  monthlyTarget: int("monthlyTarget").default(0), // التارجت الشهري
  bonusAmount: int("bonusAmount").default(0), // المكافأة
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RepSetting = typeof repSettings.$inferSelect;
export type InsertRepSetting = typeof repSettings.$inferInsert;
/**
 * Qoyod API Cache table
 * Stores cached data from Qoyod API to improve performance
 * Cache expires after 1 hour (3600 seconds)
 */
export const qoyodCache = mysqlTable("qoyodCache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 255 }).notNull().unique(), // e.g., "invoices_2026-02", "products", "creditNotes_2026-02"
  cacheData: mediumtext("cacheData").notNull(), // MEDIUMTEXT: up to 16MB
  expiresAt: timestamp("expiresAt").notNull(), // Cache expiration time
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QoyodCache = typeof qoyodCache.$inferSelect;
export type InsertQoyodCache = typeof qoyodCache.$inferInsert;
