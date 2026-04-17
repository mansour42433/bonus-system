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
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string" &&
          dateRegex.test(val.startDate) &&
          dateRegex.test(val.endDate)
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings in YYYY-MM-DD format");
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
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string" &&
          dateRegex.test(val.startDate) &&
          dateRegex.test(val.endDate)
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings in YYYY-MM-DD format");
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
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string" &&
          dateRegex.test(val.startDate) &&
          dateRegex.test(val.endDate)
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings in YYYY-MM-DD format");
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
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (
          typeof val === "object" &&
          val !== null &&
          "startDate" in val &&
          "endDate" in val &&
          typeof val.startDate === "string" &&
          typeof val.endDate === "string" &&
          dateRegex.test(val.startDate) &&
          dateRegex.test(val.endDate)
        ) {
          return { startDate: val.startDate, endDate: val.endDate };
        }
        throw new Error("Invalid input: startDate and endDate must be strings in YYYY-MM-DD format");
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
        console.log(`[Debug] Found ${payments.length} payments`);
        
        // Extract unique invoice IDs from allocations and group by invoice_id to get latest payment date
        const invoicePaymentDates = new Map<number, string>();
        payments.forEach((payment: any) => {
          // invoice_id is allocatee_id when allocatee_type is "Invoice"
          if (payment.allocations && Array.isArray(payment.allocations)) {
            payment.allocations.forEach((allocation: any) => {
              if (allocation.allocatee_type === "Invoice" && allocation.allocatee_id && payment.date) {
                const existing = invoicePaymentDates.get(allocation.allocatee_id);
                if (!existing || payment.date > existing) {
                  invoicePaymentDates.set(allocation.allocatee_id, payment.date);
                }
              }
            });
          }
        });

        const invoiceIds = Array.from(invoicePaymentDates.keys());
        console.log(`[Qoyod] Found ${invoiceIds.length} invoices with payments in selected period`);

        // Fetch invoices by IDs
        const invoices = await fetchQoyodInvoicesByIds(invoiceIds);
        
        // Include all invoices that have a payment in the selected period (Paid or Approved)
        // We already filtered by payment date above, so all these invoices are effectively paid
        console.log(`[Qoyod] Found ${invoices.length} invoices with payments in selected period (Paid + Approved)`);
        
        // Cache the data for 1 hour
        await setCachedData(cacheKey, invoices, 3600);
        
        return { invoices };
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
            bonus1Enabled: "bonus1Enabled" in val ? Boolean(val.bonus1Enabled) : true,
            bonus2Enabled: "bonus2Enabled" in val ? Boolean(val.bonus2Enabled) : true,
          };
        }
        throw new Error("Invalid input for product update");
      })
      .mutation(async ({ input }: { input: { productId: string; productName: string; premiumPrice: number; basePrice: number; bonus1Enabled: boolean; bonus2Enabled: boolean } }) => {
        const { upsertProductSetting } = await import("./db");
        await upsertProductSetting(
          input.productId,
          input.productName,
          input.premiumPrice,
          input.basePrice,
          input.bonus1Enabled,
          input.bonus2Enabled
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

  bonusPayments: router({
    record: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "invoiceId" in val && "invoiceReference" in val && "repEmail" in val && "bonusAmount" in val && "bonusPercentage" in val && "invoiceAmount" in val && "invoiceDate" in val && "paymentDate" in val) {
          return {
            invoiceId: Number(val.invoiceId),
            invoiceReference: String(val.invoiceReference),
            repEmail: String(val.repEmail),
            bonusAmount: Number(val.bonusAmount),
            bonusPercentage: Number(val.bonusPercentage),
            invoiceAmount: Number(val.invoiceAmount),
            invoiceDate: String(val.invoiceDate),
            paymentDate: String(val.paymentDate),
            notes: "notes" in val ? String(val.notes) : undefined,
          };
        }
        throw new Error("Invalid input for bonus payment record");
      })
      .mutation(async ({ input }) => {
        const { recordBonusPayment } = await import("./db");
        await recordBonusPayment(input);
        return { success: true };
      }),

    markAsPaid: protectedProcedure
      .input((val: unknown) => {
        if (Array.isArray(val) && val.every((item: any) => typeof item === "object" && item !== null && typeof item.invoiceId === "number" && typeof item.repEmail === "string")) return val as { invoiceId: number; repEmail: string }[];
        throw new Error("Invalid input: expected array of {invoiceId, repEmail}");
      })
      .mutation(async ({ input }) => {
        const { markBonusAsPaid } = await import("./db");
        await markBonusAsPaid(input);
        return { success: true };
      }),

    exportAll: protectedProcedure
      .query(async () => {
        const { getAllBonusPayments } = await import("./db");
        const payments = await getAllBonusPayments();
        return { payments };
      }),

    list: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null) {
          const statusVal = "status" in val ? val.status : undefined;
          const status = (statusVal === "paid" || statusVal === "unpaid") ? (statusVal as "paid" | "unpaid") : undefined;
          return {
            startDate: "startDate" in val && typeof val.startDate === "string" ? val.startDate : undefined,
            endDate: "endDate" in val && typeof val.endDate === "string" ? val.endDate : undefined,
            repEmail: "repEmail" in val && typeof val.repEmail === "string" ? val.repEmail : undefined,
            status,
          };
        }
        throw new Error("Invalid input for bonus payments list");
      })
      .query(async ({ input }) => {
        const { getBonusPayments } = await import("./db");
        const payments = await getBonusPayments(input);
        return { payments };
      }),

    summary: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null) {
          return {
            startDate: "startDate" in val && typeof val.startDate === "string" ? val.startDate : undefined,
            endDate: "endDate" in val && typeof val.endDate === "string" ? val.endDate : undefined,
            repEmail: "repEmail" in val && typeof val.repEmail === "string" ? val.repEmail : undefined,
          };
        }
        throw new Error("Invalid input for bonus summary");
      })
      .query(async ({ input }) => {
        const { getBonusSummary } = await import("./db");
        const summary = await getBonusSummary(input.startDate, input.endDate, input.repEmail);
        return summary;
      }),
  }),

  // Reports and Analytics
  reports: router({
    repPerformance: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "repEmail" in val && "startDate" in val && "endDate" in val) {
          return {
            repEmail: String(val.repEmail),
            startDate: String(val.startDate),
            endDate: String(val.endDate),
          };
        }
        throw new Error("Invalid input for rep performance");
      })
      .query(async ({ input }) => {
        const { getRepPerformanceSummary } = await import("./db");
        const performance = await getRepPerformanceSummary(input.repEmail, input.startDate, input.endDate);
        return performance;
      }),

    productSales: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "month" in val) {
          return { month: String(val.month) };
        }
        throw new Error("Invalid input for product sales");
      })
      .query(async ({ input }) => {
        const { getProductSalesSummary } = await import("./db");
        const sales = await getProductSalesSummary(input.month);
        return { sales };
      }),

    categorySales: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "month" in val) {
          return { month: String(val.month) };
        }
        throw new Error("Invalid input for category sales");
      })
      .query(async ({ input }) => {
        const { getCategorySalesSummary } = await import("./db");
        const sales = await getCategorySalesSummary(input.month);
        return { sales };
      }),
  }),
});

export type AppRouter = typeof appRouter;
