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
    // Save API key
    saveApiKey: protectedProcedure
      .input((val: unknown) => {
        if (typeof val === "object" && val !== null && "apiKey" in val && typeof val.apiKey === "string") {
          return { apiKey: val.apiKey };
        }
        throw new Error("Invalid input: apiKey must be a string");
      })
      .mutation(async ({ ctx, input }) => {
        const { saveApiKey } = await import("./db");
        await saveApiKey(ctx.user.id, input.apiKey);
        return { success: true };
      }),

    // Get API key
    getApiKey: protectedProcedure.query(async ({ ctx }) => {
      const { getApiKey } = await import("./db");
      const apiKey = await getApiKey(ctx.user.id);
      return { apiKey };
    }),

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
        const { getApiKey } = await import("./db");
        const { fetchQoyodInvoices } = await import("./qoyod");

        const apiKey = await getApiKey(ctx.user.id);
        if (!apiKey) {
          throw new Error("يجب حفظ Qoyod API Key أولاً");
        }

        const invoices = await fetchQoyodInvoices(apiKey, input.startDate, input.endDate);
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
        const { getApiKey } = await import("./db");
        const { fetchQoyodCreditNotes } = await import("./qoyod");

        const apiKey = await getApiKey(ctx.user.id);
        if (!apiKey) {
          throw new Error("يجب حفظ Qoyod API Key أولاً");
        }

        const creditNotes = await fetchQoyodCreditNotes(apiKey, input.startDate, input.endDate);
        return { creditNotes };
      }),

    // Fetch products
    fetchProducts: protectedProcedure.query(async ({ ctx }) => {
      const { getApiKey } = await import("./db");
      const { fetchQoyodProducts } = await import("./qoyod");

      const apiKey = await getApiKey(ctx.user.id);
      if (!apiKey) {
        throw new Error("يجب حفظ Qoyod API Key أولاً");
      }

      const products = await fetchQoyodProducts(apiKey);
      return { products };
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
});

export type AppRouter = typeof appRouter;
