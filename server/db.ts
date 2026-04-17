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
export async function recordBonusPayment(
  invoiceId: number,
  invoiceReference: string,
  repEmail: string,
  bonusAmount: number,
  bonusPercentage: number,
  invoiceAmount: number,
  invoiceDate: string,
  paymentDate: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  
  await db.insert(bonusPayments)
    .values({
      invoiceId,
      invoiceReference,
      repEmail,
      bonusAmount,
      bonusPercentage,
      invoiceAmount,
      invoiceDate,
      paymentDate,
      status: "unpaid",
      notes,
    })
    .onDuplicateKeyUpdate({
      set: {
        bonusAmount,
        bonusPercentage,
        invoiceAmount,
        notes,
      },
    });
}

export async function markBonusAsPaid(invoiceIds: number[]) {
  const db = await getDb();
  if (!db) return;
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { inArray } = await import("drizzle-orm");
  
  await db.update(bonusPayments)
    .set({ status: "paid", bonusPaymentDate: new Date() })
    .where(inArray(bonusPayments.invoiceId, invoiceIds));
}

export async function getBonusPayments(
  startDate?: string,
  endDate?: string,
  repEmail?: string,
  status?: "paid" | "unpaid"
) {
  const db = await getDb();
  if (!db) return [];
  
  const { bonusPayments } = await import("../drizzle/schema");
  const { and, gte, lte, eq } = await import("drizzle-orm");
  
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
  if (status) {
    conditions.push(eq(bonusPayments.status, status));
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
