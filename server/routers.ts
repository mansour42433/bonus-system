import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Qoyod Integration
  qoyod: router({
    // Fetch invoices
    fetchInvoices: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string"
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings");
      })
      .query(async ({ ctx, input }) => {
        const { getCachedData, setCachedData } = await import("./db");
        const { fetchQoyodInvoices } = await import("./qoyod");

        // Generate cache key based on date range
        const cacheKey = `invoices_${input.startDate}_${input.endDate}`;
        
        // Try to get cached data
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) {
          console.log(`[Cache] Using cached invoices for ${cacheKey}`);
          return { invoices: cachedData };
        }

        // Fetch fresh data from Qoyod
        console.log(`[Cache] Fetching fresh invoices for ${cacheKey}`);
        const invoices = await fetchQoyodInvoices(input.startDate, input.endDate);
        
        // Cache the data for 1 hour
        await setCachedData(cacheKey, invoices, 3600);
        
        return { invoices };
      }),

    // Fetch credit notes
    fetchCreditNotes: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string"
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings");
      })
      .query(async ({ ctx, input }) => {
        const { getCachedData, setCachedData } = await import("./db");
        const { fetchQoyodCreditNotes } = await import("./qoyod");

        // Generate cache key based on date range
        const cacheKey = `creditNotes_${input.startDate}_${input.endDate}`;
        
        // Try to get cached data
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) {
          console.log(`[Cache] Using cached credit notes for ${cacheKey}`);
          return { creditNotes: cachedData };
        }

        // Fetch fresh data from Qoyod
        console.log(`[Cache] Fetching fresh credit notes for ${cacheKey}`);
        const creditNotes = await fetchQoyodCreditNotes(input.startDate, input.endDate);
        
        // Cache the data for 1 hour
        await setCachedData(cacheKey, creditNotes, 3600);
        
        return { creditNotes };
      }),

    // Fetch invoice payments
    fetchInvoicePayments: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string"
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings");
      })
      .query(async ({ ctx, input }) => {
        const { getCachedData, setCachedData } = await import("./db");
        const { fetchQoyodInvoicePayments } = await import("./qoyod");

        // Generate cache key based on date range
        const cacheKey = `invoicePayments_${input.startDate}_${input.endDate}`;
        
        // Try to get cached data
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) {
          console.log(`[Cache] Using cached invoice payments for ${cacheKey}`);
          return { payments: cachedData };
        }

        // Fetch fresh data from Qoyod
        console.log(`[Cache] Fetching fresh invoice payments for ${cacheKey}`);
        const payments = await fetchQoyodInvoicePayments(input.startDate, input.endDate);
        
        // Cache the data for 1 hour
        await setCachedData(cacheKey, payments, 3600);
        
        return { payments };
      }),

    // Fetch invoices by payment date (new logic)
    fetchInvoicesByPaymentDate: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string"
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings");
      })
      .query(async ({ ctx, input }) => {
        const { getCachedData, setCachedData } = await import("./db");
        const { fetchQoyodInvoicePayments, fetchQoyodInvoicesByIds } = await import("./qoyod");

        // Generate cache key based on date range
        const cacheKey = `invoicesByPaymentDate_${input.startDate}_${input.endDate}`;
        
        // Try to get cached data
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) {
          console.log(`[Cache] Using cached invoices by payment date for ${cacheKey}`);
          return { invoices: cachedData };
        }

        // Fetch invoice payments from the selected month
        console.log(`[Cache] Fetching invoices by payment date for ${cacheKey}`);
        const payments = await fetchQoyodInvoicePayments(input.startDate, input.endDate);
        
        // Extract unique invoice IDs and group by invoice_id to get latest payment date
        const invoicePaymentDates = new Map<number, string>();
        payments.forEach((payment: any) => {
          if (payment.invoice_id && payment.date) {
            const existing = invoicePaymentDates.get(payment.invoice_id);
            if (!existing || payment.date > existing) {
              invoicePaymentDates.set(payment.invoice_id, payment.date);
            }
          }
        });

        const invoiceIds = Array.from(invoicePaymentDates.keys());
        console.log(`[Qoyod] Found ${invoiceIds.length} invoices with payments in selected period`);

        // Fetch invoices by IDs
        const invoices = await fetchQoyodInvoicesByIds(invoiceIds);
        
        // Filter only Paid invoices
        const paidInvoices = invoices.filter((inv: any) => inv.status === "Paid");
        console.log(`[Qoyod] Filtered to ${paidInvoices.length} Paid invoices`);
        
        // Cache the data for 1 hour
        await setCachedData(cacheKey, paidInvoices, 3600);
        
        return { invoices: paidInvoices };
      }),

    // Fetch products
    fetchProducts: protectedProcedure.query(async ({ ctx }) => {
      const { getCachedData, setCachedData } = await import("./db");
      const { fetchQoyodProducts } = await import("./qoyod");

      const cacheKey = "products";
      
      // Try to get cached data
      const cachedData = await getCachedData(cacheKey);
      if (cachedData) {
        console.log("[Cache] Using cached products");
        return { products: cachedData };
      }

      // Fetch fresh data from Qoyod
      console.log("[Cache] Fetching fresh products");
      const products = await fetchQoyodProducts();
      
      // Cache the data for 1 hour
      await setCachedData(cacheKey, products, 3600);
      
      return { products };
    }),

    // Clear cache manually
    clearCache: protectedProcedure.mutation(async () => {
      const { clearCache } = await import("./db");
      await clearCache();
      return { success: true };
    }),
  }),

  // Product Settings
  settings: router({
    // Get all product settings
    list: protectedProcedure.query(async () => {
      const { getProductSettings } = await import("./db");
      const settings = await getProductSettings();
      return { settings };
    }),

    // Update product setting
    update: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "productId" in val &&
          "productName" in val &&
          "premiumPrice" in val &&
          "basePrice" in val &&
          typeof val.productId === "string" &&
          typeof val.productName === "string" &&
          typeof val.premiumPrice === "number" &&
          typeof val.basePrice === "number"
        ) {
          return {
            productId: val.productId,
            productName: val.productName,
            premiumPrice: val.premiumPrice,
            basePrice: val.basePrice,
          };
        }
        throw new Error("Invalid input for product update");
      })
      .mutation(async ({ input }: { input: { productId: string; productName: string; premiumPrice: number; basePrice: number } }) => {
        const { upsertProductSetting } = await import("./db");
        await upsertProductSetting(
          input.productId,
          input.productName,
          input.premiumPrice,
          input.basePrice
        );
        return { success: true };
      }),
  }),

  // Rep Settings
  reps: router({
    // Get all rep settings
    list: protectedProcedure.query(async () => {
      const { getRepSettings } = await import("./db");
      const reps = await getRepSettings();
      return { reps };
    }),

    // Update rep setting
    update: protectedProcedure
      .input((val: unknown) => {
        if (
          typeof val === "object" &&
          val !== null &&
          "repEmail" in val &&
          "repNickname" in val &&
          "monthlyTarget" in val &&
          "bonusAmount" in val &&
          typeof val.repEmail === "string" &&
          typeof val.repNickname === "string" &&
          typeof val.monthlyTarget === "number" &&
          typeof val.bonusAmount === "number"
        ) {
          return {
            repEmail: val.repEmail,
            repNickname: val.repNickname,
            monthlyTarget: val.monthlyTarget,
            bonusAmount: val.bonusAmount,
          };
        }
        throw new Error("Invalid input for rep update");
      })
      .mutation(async ({ input }: { input: { repEmail: string; repNickname: string; monthlyTarget: number; bonusAmount: number } }) => {
        const { upsertRepSetting } = await import("./db");
        await upsertRepSetting(
          input.repEmail,
          input.repNickname,
          input.monthlyTarget,
          input.bonusAmount
        );
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
