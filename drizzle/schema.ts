import { boolean, int, mediumtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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

/**
 * Bonus Payments Tracking
 * Tracks which invoices have had their bonus paid out
 * Prevents double-counting of bonuses
 */
export const bonusPayments = mysqlTable("bonusPayments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(), // Qoyod invoice ID
  invoiceReference: varchar("invoiceReference", { length: 128 }).notNull(), // e.g., "INV4591"
  repEmail: varchar("repEmail", { length: 320 }).notNull(), // المندوب
  bonusAmount: int("bonusAmount").notNull(), // المبلغ المدفوع
  bonusPercentage: int("bonusPercentage").notNull(), // 1 أو 2
  invoiceAmount: int("invoiceAmount").notNull(), // إجمالي الفاتورة
  invoiceDate: varchar("invoiceDate", { length: 10 }).notNull(), // YYYY-MM-DD
  paymentDate: varchar("paymentDate", { length: 10 }).notNull(), // YYYY-MM-DD (تاريخ دفع الفاتورة)
  bonusPaymentDate: timestamp("bonusPaymentDate").defaultNow().notNull(), // تاريخ دفع البونص
  status: mysqlEnum("status", ["paid", "unpaid"]).default("unpaid").notNull(), // حالة البونص
  notes: text("notes"), // ملاحظات إضافية
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  uniqueIndex("unique_invoice_rep").on(table.invoiceId, table.repEmail),
]));

export type BonusPayment = typeof bonusPayments.$inferSelect;
export type InsertBonusPayment = typeof bonusPayments.$inferInsert;

/**
 * Products Table
 * Stores product information from Qoyod
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  productId: varchar("productId", { length: 128 }).notNull().unique(), // Qoyod product ID
  productName: text("productName").notNull(),
  category: text("category"), // الصنف/الفئة
  price: int("price").default(0), // السعر الافتراضي
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

/**
 * Invoices Table
 * Stores invoice information from Qoyod
 * Links invoices to sales representatives
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().unique(), // Qoyod invoice ID
  invoiceReference: varchar("invoiceReference", { length: 128 }).notNull(), // e.g., "INV4591"
  repEmail: varchar("repEmail", { length: 320 }).notNull(), // المندوب (من repSettings)
  clientName: text("clientName"), // اسم العميل
  invoiceDate: varchar("invoiceDate", { length: 10 }).notNull(), // YYYY-MM-DD
  invoiceAmount: int("invoiceAmount").notNull(), // إجمالي الفاتورة
  invoiceStatus: mysqlEnum("invoiceStatus", ["Paid", "Approved", "Draft", "Cancelled"]).default("Draft").notNull(), // حالة الفاتورة
  paymentDate: varchar("paymentDate", { length: 10 }), // YYYY-MM-DD (تاريخ الدفع)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Invoice Items Table
 * Stores individual products/items within each invoice
 * Links invoices to products
 */
export const invoiceItems = mysqlTable("invoiceItems", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(), // Foreign key to invoices
  productId: varchar("productId", { length: 128 }).notNull(), // Foreign key to products
  productName: text("productName").notNull(),
  category: text("category"), // الصنف
  quantity: int("quantity").notNull(), // الكمية
  price: int("price").notNull(), // السعر للوحدة
  total: int("total").notNull(), // الإجمالي (quantity * price)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = typeof invoiceItems.$inferInsert;

/**
 * Credit Notes Table
 * Stores returned/cancelled items (المرتجعات)
 * Used to exclude from bonus calculations
 */
export const creditNotes = mysqlTable("creditNotes", {
  id: int("id").autoincrement().primaryKey(),
  creditNoteId: varchar("creditNoteId", { length: 128 }).notNull().unique(), // Qoyod credit note ID
  invoiceId: int("invoiceId").notNull(), // Foreign key to invoices
  invoiceReference: varchar("invoiceReference", { length: 128 }).notNull(), // e.g., "INV4591"
  productId: varchar("productId", { length: 128 }).notNull(), // Foreign key to products
  productName: text("productName").notNull(),
  quantity: int("quantity").notNull(), // الكمية المرتجعة
  amount: int("amount").notNull(), // المبلغ المرتجع
  creditNoteDate: varchar("creditNoteDate", { length: 10 }).notNull(), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CreditNote = typeof creditNotes.$inferSelect;
export type InsertCreditNote = typeof creditNotes.$inferInsert;

/**
 * Rep Performance Table
 * Stores aggregated performance metrics for each rep
 * Updated periodically for quick access
 */
export const repPerformance = mysqlTable("repPerformance", {
  id: int("id").autoincrement().primaryKey(),
  repEmail: varchar("repEmail", { length: 320 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  totalSales: int("totalSales").default(0), // إجمالي المبيعات
  paidInvoices: int("paidInvoices").default(0), // عدد الفواتير المدفوعة
  unpaidInvoices: int("unpaidInvoices").default(0), // عدد الفواتير غير المدفوعة
  bonusEarned: int("bonusEarned").default(0), // البونص المستحق
  bonusPaid: int("bonusPaid").default(0), // البونص المدفوع
  bonusRemaining: int("bonusRemaining").default(0), // البونص المتبقي
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RepPerformance = typeof repPerformance.$inferSelect;
export type InsertRepPerformance = typeof repPerformance.$inferInsert;

/**
 * Product Sales Summary Table
 * Stores aggregated sales data for each product
 * Updated periodically for quick access
 */
export const productSalesSummary = mysqlTable("productSalesSummary", {
  id: int("id").autoincrement().primaryKey(),
  productId: varchar("productId", { length: 128 }).notNull(),
  productName: text("productName").notNull(),
  category: text("category"),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  totalQuantity: int("totalQuantity").default(0), // إجمالي الكمية
  totalSales: int("totalSales").default(0), // إجمالي المبيعات
  salesCount: int("salesCount").default(0), // عدد مرات البيع
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ProductSalesSummary = typeof productSalesSummary.$inferSelect;
export type InsertProductSalesSummary = typeof productSalesSummary.$inferInsert;

/**
 * Category Sales Summary Table
 * Stores aggregated sales data for each category
 * Updated periodically for quick access
 */
export const categorySalesSummary = mysqlTable("categorySalesSummary", {
  id: int("id").autoincrement().primaryKey(),
  category: text("category").notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  totalQuantity: int("totalQuantity").default(0), // إجمالي الكمية
  totalSales: int("totalSales").default(0), // إجمالي المبيعات
  productCount: int("productCount").default(0), // عدد المنتجات
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CategorySalesSummary = typeof categorySalesSummary.$inferSelect;
export type InsertCategorySalesSummary = typeof categorySalesSummary.$inferInsert;

/**
 * Saved Reports Table
 * Stores complete bonus reports when bonus is delivered to reps
 * Each report contains all invoice details (delivered + undelivered) for a date range
 */
export const savedReports = mysqlTable("savedReports", {
  id: int("id").autoincrement().primaryKey(),
  startDate: varchar("startDate", { length: 10 }).notNull(), // YYYY-MM-DD
  endDate: varchar("endDate", { length: 10 }).notNull(), // YYYY-MM-DD
  repFilter: varchar("repFilter", { length: 320 }).default("all").notNull(), // المندوب المحدد أو "all"
  totalInvoices: int("totalInvoices").default(0).notNull(), // إجمالي عدد الفواتير
  deliveredCount: int("deliveredCount").default(0).notNull(), // عدد الفواتير المسلمة
  undeliveredCount: int("undeliveredCount").default(0).notNull(), // عدد الفواتير غير المسلمة
  totalSales: varchar("totalSales", { length: 20 }).default("0").notNull(), // إجمالي المبيعات (string لدقة الأرقام العشرية)
  totalBonus: varchar("totalBonus", { length: 20 }).default("0").notNull(), // إجمالي البونص
  deliveredBonus: varchar("deliveredBonus", { length: 20 }).default("0").notNull(), // البونص المسلم
  undeliveredBonus: varchar("undeliveredBonus", { length: 20 }).default("0").notNull(), // البونص غير المسلم
  reportData: mediumtext("reportData").notNull(), // JSON: كل تفاصيل الفواتير والبونص
  createdBy: varchar("createdBy", { length: 320 }), // المستخدم الذي أنشأ التقرير
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SavedReport = typeof savedReports.$inferSelect;
export type InsertSavedReport = typeof savedReports.$inferInsert;
