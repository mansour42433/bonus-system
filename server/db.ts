import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Product Settings
export async function getProductSettings() {
  const db = await getDb();
  if (!db) return [];
  
  const { productSettings } = await import("../drizzle/schema");
  return await db.select().from(productSettings);
}

export async function upsertProductSetting(
  productId: string,
  productName: string,
  premiumPrice: number,
  basePrice: number,
  bonus1Enabled: boolean = true,
  bonus2Enabled: boolean = true
) {
  const db = await getDb();
  if (!db) return;
  
  const { productSettings } = await import("../drizzle/schema");
  
  await db.insert(productSettings)
    .values({
      productId,
      productName,
      premiumPrice,
      basePrice,
      bonus1Enabled,
      bonus2Enabled,
    })
    .onDuplicateKeyUpdate({
      set: {
        productName,
        premiumPrice,
        basePrice,
        bonus1Enabled,
        bonus2Enabled,
      },
    });
}


// Rep Settings
export async function getRepSettings() {
  const db = await getDb();
  if (!db) return [];
  
  const { repSettings } = await import("../drizzle/schema");
  return await db.select().from(repSettings);
}

export async function upsertRepSetting(
  repEmail: string,
  repNickname: string,
  monthlyTarget: number,
  bonusAmount: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { repSettings } = await import("../drizzle/schema");
  
  await db.insert(repSettings)
    .values({
      repEmail,
      repNickname,
      monthlyTarget,
      bonusAmount,
    })
    .onDuplicateKeyUpdate({
      set: {
        repNickname,
        monthlyTarget,
        bonusAmount,
      },
    });
}


// Qoyod Cache Functions
export async function getCachedData(cacheKey: string) {
  const db = await getDb();
  if (!db) return null;
  
  const { qoyodCache } = await import("../drizzle/schema");
  
  const result = await db
    .select()
    .from(qoyodCache)
    .where(eq(qoyodCache.cacheKey, cacheKey))
    .limit(1);
  
  if (result.length === 0) return null;
  
  const cache = result[0];
  
  // Check if cache is expired
  if (new Date() > cache.expiresAt) {
    // Delete expired cache
    await db.delete(qoyodCache).where(eq(qoyodCache.cacheKey, cacheKey));
    return null;
  }
  
  try {
    return JSON.parse(cache.cacheData);
  } catch (error) {
    console.error("[Cache] Failed to parse cache data:", error);
    return null;
  }
}

export async function setCachedData(cacheKey: string, data: any, ttlSeconds: number = 3600) {
  const db = await getDb();
  if (!db) return;
  
  const { qoyodCache } = await import("../drizzle/schema");
  
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const cacheData = JSON.stringify(data);
  
  await db.insert(qoyodCache)
    .values({
      cacheKey,
      cacheData,
      expiresAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        cacheData,
        expiresAt,
      },
    });
}

export async function clearCache(cacheKeyPattern?: string) {
  const db = await getDb();
  if (!db) return;
  
  const { qoyodCache } = await import("../drizzle/schema");
  
  if (cacheKeyPattern) {
    // Clear specific cache pattern (e.g., "invoices_*")
    const allCache = await db.select().from(qoyodCache);
    const toDelete = allCache.filter(c => c.cacheKey.startsWith(cacheKeyPattern.replace('*', '')));
    
    for (const cache of toDelete) {
      await db.delete(qoyodCache).where(eq(qoyodCache.cacheKey, cache.cacheKey));
    }
  } else {
    // Clear all cache
    await db.delete(qoyodCache);
  }
}


// Bonus Payments Management
export async function recordBonusPayment(params: {
  invoiceId: number;
  invoiceReference: string;
  repEmail: string;
  bonusAmount: number;
  bonusPercentage: number;
  invoiceAmount: number;
  invoiceDate: string;
  paymentDate: string;
  status?: "paid" | "unpaid";
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { sql } = await import("drizzle-orm");
  
  await db.insert(bonusPayments)
    .values({
      invoiceId: params.invoiceId,
      invoiceReference: params.invoiceReference,
      repEmail: params.repEmail,
      bonusAmount: params.bonusAmount,
      bonusPercentage: params.bonusPercentage,
      invoiceAmount: params.invoiceAmount,
      invoiceDate: params.invoiceDate,
      paymentDate: params.paymentDate,
      status: params.status || "unpaid",
      notes: params.notes,
    })
    .onDuplicateKeyUpdate({
      set: {
        bonusAmount: sql`VALUES(bonusAmount)`,
        bonusPercentage: sql`VALUES(bonusPercentage)`,
        invoiceAmount: sql`VALUES(invoiceAmount)`,
      },
    });
  return true;
}

export async function markBonusAsPaid(items: { invoiceId: number; repEmail: string }[], deliveryInfo?: {
  deliveryMethod?: "cash" | "transfer" | "cheque";
  deliveryDate?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  
  // Update each item individually to ensure correct rep matching
  for (const item of items) {
    const updateSet: any = { status: "paid", bonusPaymentDate: new Date() };
    if (deliveryInfo?.deliveryMethod) updateSet.deliveryMethod = deliveryInfo.deliveryMethod;
    if (deliveryInfo?.deliveryDate) updateSet.deliveryDate = deliveryInfo.deliveryDate;
    if (deliveryInfo?.notes !== undefined) updateSet.notes = deliveryInfo.notes;
    
    await db.update(bonusPayments)
      .set(updateSet)
      .where(and(
        eq(bonusPayments.invoiceId, item.invoiceId),
        eq(bonusPayments.repEmail, item.repEmail)
      ));
  }
  return true;
}

// Undo delivery - revert paid status back to unpaid
export async function undoDelivery(items: { invoiceId: number; repEmail: string }[]) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  
  for (const item of items) {
    await db.update(bonusPayments)
      .set({ status: "unpaid", deliveryMethod: null, deliveryDate: null, notes: null } as any)
      .where(and(
        eq(bonusPayments.invoiceId, item.invoiceId),
        eq(bonusPayments.repEmail, item.repEmail)
      ));
  }
  return true;
}

// Delete bonus payment record entirely
export async function deleteBonusPayment(invoiceId: number, repEmail: string) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  
  await db.delete(bonusPayments)
    .where(and(
      eq(bonusPayments.invoiceId, invoiceId),
      eq(bonusPayments.repEmail, repEmail)
    ));
  return true;
}

// Export all bonus payments (no filters) for backup
export async function getAllBonusPayments() {
  const db = await getDb();
  if (!db) return [];
  
  const { bonusPayments } = await import("../drizzle/schema");
  return await db.select().from(bonusPayments);
}

export async function getBonusPayments(params?: {
  startDate?: string;
  endDate?: string;
  repEmail?: string;
  status?: "paid" | "unpaid";
}) {
  const db = await getDb();
  if (!db) return [];
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, gte, lte, eq } = await import("drizzle-orm");
  
  let conditions = [];
  
  if (params?.startDate) {
    conditions.push(gte(bonusPayments.paymentDate, params.startDate));
  }
  if (params?.endDate) {
    conditions.push(lte(bonusPayments.paymentDate, params.endDate));
  }
  if (params?.repEmail) {
    conditions.push(eq(bonusPayments.repEmail, params.repEmail));
  }
  if (params?.status) {
    conditions.push(eq(bonusPayments.status, params.status));
  }
  
  const query = db.select().from(bonusPayments);
  if (conditions.length > 0) {
    return await query.where(and(...conditions));
  }
  return await query;
}

export async function getBonusSummary(
  startDate?: string,
  endDate?: string,
  repEmail?: string
) {
  const db = await getDb();
  if (!db) return { paid: 0, unpaid: 0, total: 0 };
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, gte, lte, eq, sql } = await import("drizzle-orm");
  
  let conditions = [];
  
  if (startDate) {
    conditions.push(gte(bonusPayments.paymentDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(bonusPayments.paymentDate, endDate));
  }
  if (repEmail) {
    conditions.push(eq(bonusPayments.repEmail, repEmail));
  }
  
  const query = db.select({
    status: bonusPayments.status,
    total: sql<number>`SUM(${bonusPayments.bonusAmount})`,
  })
  .from(bonusPayments)
  .groupBy(bonusPayments.status);
  
  const results = conditions.length > 0 
    ? await query.where(and(...conditions))
    : await query;
  
  let paid = 0, unpaid = 0;
  results.forEach((row: any) => {
    if (row.status === "paid") paid = row.total || 0;
    if (row.status === "unpaid") unpaid = row.total || 0;
  });
  
  return { paid, unpaid, total: paid + unpaid };
}


// ============ Invoices Management ============

export async function upsertInvoice(
  invoiceId: number,
  invoiceReference: string,
  repEmail: string,
  clientName: string,
  invoiceDate: string,
  invoiceAmount: number,
  invoiceStatus: "Paid" | "Approved" | "Draft" | "Cancelled",
  paymentDate?: string
) {
  const db = await getDb();
  if (!db) return;
  
  const { invoices } = await import("../drizzle/schema");
  
  await db.insert(invoices)
    .values({
      invoiceId,
      invoiceReference,
      repEmail,
      clientName,
      invoiceDate,
      invoiceAmount,
      invoiceStatus,
      paymentDate,
    })
    .onDuplicateKeyUpdate({
      set: {
        clientName,
        invoiceStatus,
        paymentDate,
        invoiceAmount,
      },
    });
}

export async function getInvoicesByRep(
  repEmail: string,
  startDate?: string,
  endDate?: string
) {
  const db = await getDb();
  if (!db) return [];
  
  const { invoices } = await import("../drizzle/schema");
  const { eq, and, gte, lte } = await import("drizzle-orm");
  
  let conditions = [eq(invoices.repEmail, repEmail)];
  
  if (startDate) {
    conditions.push(gte(invoices.invoiceDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(invoices.invoiceDate, endDate));
  }
  
  return await db.select().from(invoices).where(and(...conditions));
}

export async function getInvoicesByStatus(
  status: "Paid" | "Approved" | "Draft" | "Cancelled",
  startDate?: string,
  endDate?: string
) {
  const db = await getDb();
  if (!db) return [];
  
  const { invoices } = await import("../drizzle/schema");
  const { eq, and, gte, lte } = await import("drizzle-orm");
  
  let conditions = [eq(invoices.invoiceStatus, status)];
  
  if (startDate) {
    conditions.push(gte(invoices.invoiceDate, startDate));
  }
  if (endDate) {
    conditions.push(lte(invoices.invoiceDate, endDate));
  }
  
  return await db.select().from(invoices).where(and(...conditions));
}

// ============ Invoice Items Management ============

export async function upsertInvoiceItem(
  invoiceId: number,
  productId: string,
  productName: string,
  category: string,
  quantity: number,
  price: number,
  total: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { invoiceItems } = await import("../drizzle/schema");
  
  await db.insert(invoiceItems)
    .values({
      invoiceId,
      productId,
      productName,
      category,
      quantity,
      price,
      total,
    })
    .onDuplicateKeyUpdate({
      set: {
        quantity,
        price,
        total,
      },
    });
}

export async function getInvoiceItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { invoiceItems } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

// ============ Products Management ============

export async function upsertProduct(
  productId: string,
  productName: string,
  category: string,
  price: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { products } = await import("../drizzle/schema");
  
  await db.insert(products)
    .values({
      productId,
      productName,
      category,
      price,
    })
    .onDuplicateKeyUpdate({
      set: {
        productName,
        category,
        price,
      },
    });
}

export async function getProducts() {
  const db = await getDb();
  if (!db) return [];
  
  const { products } = await import("../drizzle/schema");
  return await db.select().from(products);
}

// ============ Credit Notes Management ============

export async function upsertCreditNote(
  creditNoteId: string,
  invoiceId: number,
  invoiceReference: string,
  productId: string,
  productName: string,
  quantity: number,
  amount: number,
  creditNoteDate: string
) {
  const db = await getDb();
  if (!db) return;
  
  const { creditNotes } = await import("../drizzle/schema");
  
  await db.insert(creditNotes)
    .values({
      creditNoteId,
      invoiceId,
      invoiceReference,
      productId,
      productName,
      quantity,
      amount,
      creditNoteDate,
    })
    .onDuplicateKeyUpdate({
      set: {
        quantity,
        amount,
      },
    });
}

export async function getCreditNotesByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { creditNotes } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  return await db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId));
}

// ============ Rep Performance Summary ============

export async function upsertRepPerformance(
  repEmail: string,
  month: string,
  totalSales: number,
  paidInvoices: number,
  unpaidInvoices: number,
  bonusEarned: number,
  bonusPaid: number,
  bonusRemaining: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { repPerformance } = await import("../drizzle/schema");
  
  await db.insert(repPerformance)
    .values({
      repEmail,
      month,
      totalSales,
      paidInvoices,
      unpaidInvoices,
      bonusEarned,
      bonusPaid,
      bonusRemaining,
    })
    .onDuplicateKeyUpdate({
      set: {
        totalSales,
        paidInvoices,
        unpaidInvoices,
        bonusEarned,
        bonusPaid,
        bonusRemaining,
      },
    });
}

export async function getRepPerformance(
  repEmail: string,
  month: string
) {
  const db = await getDb();
  if (!db) return null;
  
  const { repPerformance } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  
  const result = await db.select().from(repPerformance)
    .where(and(eq(repPerformance.repEmail, repEmail), eq(repPerformance.month, month)))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

// ============ Product Sales Summary ============

export async function upsertProductSalesSummary(
  productId: string,
  productName: string,
  category: string,
  month: string,
  totalQuantity: number,
  totalSales: number,
  salesCount: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { productSalesSummary } = await import("../drizzle/schema");
  
  await db.insert(productSalesSummary)
    .values({
      productId,
      productName,
      category,
      month,
      totalQuantity,
      totalSales,
      salesCount,
    })
    .onDuplicateKeyUpdate({
      set: {
        totalQuantity,
        totalSales,
        salesCount,
      },
    });
}

export async function getProductSalesSummary(month: string) {
  const db = await getDb();
  if (!db) return [];
  
  const { productSalesSummary } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  return await db.select().from(productSalesSummary).where(eq(productSalesSummary.month, month));
}

// ============ Category Sales Summary ============

export async function upsertCategorySalesSummary(
  category: string,
  month: string,
  totalQuantity: number,
  totalSales: number,
  productCount: number
) {
  const db = await getDb();
  if (!db) return;
  
  const { categorySalesSummary } = await import("../drizzle/schema");
  
  await db.insert(categorySalesSummary)
    .values({
      category,
      month,
      totalQuantity,
      totalSales,
      productCount,
    })
    .onDuplicateKeyUpdate({
      set: {
        totalQuantity,
        totalSales,
        productCount,
      },
    });
}

export async function getCategorySalesSummary(month: string) {
  const db = await getDb();
  if (!db) return [];
  
  const { categorySalesSummary } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  return await db.select().from(categorySalesSummary).where(eq(categorySalesSummary.month, month));
}

// ============ Advanced Queries ============

export async function getRepPerformanceSummary(
  repEmail: string,
  startDate: string,
  endDate: string
) {
  const db = await getDb();
  if (!db) return null;
  
  const { invoices, bonusPayments } = await import("../drizzle/schema");
  const { eq, and, gte, lte, sql } = await import("drizzle-orm");
  
  // Get invoices for this rep in the period
  const repInvoices = await db.select({
    total: sql<number>`SUM(${invoices.invoiceAmount})`,
    count: sql<number>`COUNT(*)`,
    paidCount: sql<number>`SUM(CASE WHEN ${invoices.invoiceStatus} = 'Paid' THEN 1 ELSE 0 END)`,
  })
  .from(invoices)
  .where(and(
    eq(invoices.repEmail, repEmail),
    gte(invoices.invoiceDate, startDate),
    lte(invoices.invoiceDate, endDate)
  ));
  
  // Get bonus summary for this rep in the period
  const bonusSummary = await db.select({
    earned: sql<number>`SUM(CASE WHEN ${bonusPayments.status} = 'unpaid' THEN ${bonusPayments.bonusAmount} ELSE 0 END)`,
    paid: sql<number>`SUM(CASE WHEN ${bonusPayments.status} = 'paid' THEN ${bonusPayments.bonusAmount} ELSE 0 END)`,
  })
  .from(bonusPayments)
  .where(and(
    eq(bonusPayments.repEmail, repEmail),
    gte(bonusPayments.paymentDate, startDate),
    lte(bonusPayments.paymentDate, endDate)
  ));
  
  const invoiceData = repInvoices[0] || {};
  const bonusData = bonusSummary[0] || {};
  
  return {
    totalSales: invoiceData.total || 0,
    totalInvoices: invoiceData.count || 0,
    paidInvoices: invoiceData.paidCount || 0,
    unpaidInvoices: (invoiceData.count || 0) - (invoiceData.paidCount || 0),
    bonusEarned: bonusData.earned || 0,
    bonusPaid: bonusData.paid || 0,
    bonusRemaining: (bonusData.earned || 0) - (bonusData.paid || 0),
  };
}


// ============ Saved Reports Management ============

export async function saveReport(params: {
  startDate: string;
  endDate: string;
  repFilter: string;
  totalInvoices: number;
  deliveredCount: number;
  undeliveredCount: number;
  totalSales: string;
  totalBonus: string;
  deliveredBonus: string;
  undeliveredBonus: string;
  reportData: string; // JSON string
  createdBy?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  
  const { savedReports } = await import("../drizzle/schema");
  
  const result = await db.insert(savedReports).values({
    startDate: params.startDate,
    endDate: params.endDate,
    repFilter: params.repFilter,
    totalInvoices: params.totalInvoices,
    deliveredCount: params.deliveredCount,
    undeliveredCount: params.undeliveredCount,
    totalSales: params.totalSales,
    totalBonus: params.totalBonus,
    deliveredBonus: params.deliveredBonus,
    undeliveredBonus: params.undeliveredBonus,
    reportData: params.reportData,
    createdBy: params.createdBy,
  });
  
  return result[0].insertId;
}

export async function getSavedReports() {
  const db = await getDb();
  if (!db) return [];
  
  const { savedReports } = await import("../drizzle/schema");
  const { desc } = await import("drizzle-orm");
  
  // Return all reports without the full reportData (for listing)
  const reports = await db.select({
    id: savedReports.id,
    startDate: savedReports.startDate,
    endDate: savedReports.endDate,
    repFilter: savedReports.repFilter,
    totalInvoices: savedReports.totalInvoices,
    deliveredCount: savedReports.deliveredCount,
    undeliveredCount: savedReports.undeliveredCount,
    totalSales: savedReports.totalSales,
    totalBonus: savedReports.totalBonus,
    deliveredBonus: savedReports.deliveredBonus,
    undeliveredBonus: savedReports.undeliveredBonus,
    createdBy: savedReports.createdBy,
    createdAt: savedReports.createdAt,
  }).from(savedReports).orderBy(desc(savedReports.createdAt));
  
  return reports;
}

export async function getSavedReportById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const { savedReports } = await import("../drizzle/schema");
  
  const result = await db.select().from(savedReports).where(eq(savedReports.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function deleteSavedReport(id: number) {
  const db = await getDb();
  if (!db) return false;
  
  const { savedReports } = await import("../drizzle/schema");
  
  await db.delete(savedReports).where(eq(savedReports.id, id));
  return true;
}
