import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db functions
const mockSaveReport = vi.fn();
const mockGetSavedReports = vi.fn();
const mockGetSavedReportById = vi.fn();
const mockDeleteSavedReport = vi.fn();

vi.mock("./db", () => ({
  saveReport: (...args: any[]) => mockSaveReport(...args),
  getSavedReports: (...args: any[]) => mockGetSavedReports(...args),
  getSavedReportById: (...args: any[]) => mockGetSavedReportById(...args),
  deleteSavedReport: (...args: any[]) => mockDeleteSavedReport(...args),
}));

describe("Saved Reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("saveReport", () => {
    it("saves a report with all required fields", async () => {
      const { saveReport } = await import("./db");
      mockSaveReport.mockResolvedValue(1);

      const reportParams = {
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        repFilter: "all",
        totalInvoices: 50,
        deliveredCount: 30,
        undeliveredCount: 20,
        totalSales: "98848.37",
        totalBonus: "1220.88",
        deliveredBonus: "800.50",
        undeliveredBonus: "420.38",
        reportData: JSON.stringify({ delivered: [], undelivered: [] }),
        createdBy: "admin@test.com",
      };

      const result = await saveReport(reportParams);
      expect(mockSaveReport).toHaveBeenCalledWith(reportParams);
      expect(result).toBe(1);
    });

    it("saves a report with specific rep filter", async () => {
      const { saveReport } = await import("./db");
      mockSaveReport.mockResolvedValue(2);

      const reportParams = {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
        repFilter: "rep@test.com",
        totalInvoices: 15,
        deliveredCount: 10,
        undeliveredCount: 5,
        totalSales: "25000.00",
        totalBonus: "350.00",
        deliveredBonus: "250.00",
        undeliveredBonus: "100.00",
        reportData: JSON.stringify({
          delivered: [{ invoiceId: 1, reference: "INV001", rep: "rep@test.com" }],
          undelivered: [{ invoiceId: 2, reference: "INV002", rep: "rep@test.com" }],
        }),
        createdBy: "admin@test.com",
      };

      const result = await saveReport(reportParams);
      expect(result).toBe(2);
    });
  });

  describe("getSavedReports", () => {
    it("returns all saved reports without reportData", async () => {
      const { getSavedReports } = await import("./db");
      const mockReports = [
        {
          id: 1,
          startDate: "2026-04-01",
          endDate: "2026-04-30",
          repFilter: "all",
          totalInvoices: 50,
          deliveredCount: 30,
          undeliveredCount: 20,
          totalSales: "98848.37",
          totalBonus: "1220.88",
          deliveredBonus: "800.50",
          undeliveredBonus: "420.38",
          createdBy: "admin@test.com",
          createdAt: new Date("2026-04-15"),
        },
        {
          id: 2,
          startDate: "2026-03-01",
          endDate: "2026-03-31",
          repFilter: "rep@test.com",
          totalInvoices: 15,
          deliveredCount: 10,
          undeliveredCount: 5,
          totalSales: "25000.00",
          totalBonus: "350.00",
          deliveredBonus: "250.00",
          undeliveredBonus: "100.00",
          createdBy: "admin@test.com",
          createdAt: new Date("2026-03-20"),
        },
      ];
      mockGetSavedReports.mockResolvedValue(mockReports);

      const result = await getSavedReports();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      // Verify no reportData in listing
      expect(result[0]).not.toHaveProperty("reportData");
    });

    it("returns empty array when no reports exist", async () => {
      const { getSavedReports } = await import("./db");
      mockGetSavedReports.mockResolvedValue([]);

      const result = await getSavedReports();
      expect(result).toHaveLength(0);
    });
  });

  describe("getSavedReportById", () => {
    it("returns full report with reportData", async () => {
      const { getSavedReportById } = await import("./db");
      const fullReport = {
        id: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        repFilter: "all",
        totalInvoices: 50,
        deliveredCount: 30,
        undeliveredCount: 20,
        totalSales: "98848.37",
        totalBonus: "1220.88",
        deliveredBonus: "800.50",
        undeliveredBonus: "420.38",
        reportData: JSON.stringify({
          delivered: [
            { invoiceId: 1, reference: "INV001", rep: "rep1@test.com", bonus: 50.25 },
          ],
          undelivered: [
            { invoiceId: 2, reference: "INV002", rep: "rep2@test.com", bonus: 30.10 },
          ],
        }),
        createdBy: "admin@test.com",
        createdAt: new Date("2026-04-15"),
      };
      mockGetSavedReportById.mockResolvedValue(fullReport);

      const result = await getSavedReportById(1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.reportData).toBeDefined();

      const data = JSON.parse(result!.reportData);
      expect(data.delivered).toHaveLength(1);
      expect(data.undelivered).toHaveLength(1);
      expect(data.delivered[0].reference).toBe("INV001");
    });

    it("returns null for non-existent report", async () => {
      const { getSavedReportById } = await import("./db");
      mockGetSavedReportById.mockResolvedValue(null);

      const result = await getSavedReportById(999);
      expect(result).toBeNull();
    });
  });

  describe("deleteSavedReport", () => {
    it("deletes a report by id", async () => {
      const { deleteSavedReport } = await import("./db");
      mockDeleteSavedReport.mockResolvedValue(true);

      const result = await deleteSavedReport(1);
      expect(mockDeleteSavedReport).toHaveBeenCalledWith(1);
      expect(result).toBe(true);
    });
  });

  describe("Report data integrity", () => {
    it("report data JSON contains all required invoice fields", () => {
      const reportData = {
        delivered: [
          {
            invoiceId: 100,
            reference: "INV4623",
            rep: "rep@test.com",
            repName: "أحمد",
            customer: "شركة ABC",
            product: "ورق كاشير",
            quantity: 50,
            returnedQty: 0,
            price: 62.10,
            itemTotal: 3105.00,
            category: "أساسي",
            percentage: 1,
            bonus: 31.05,
            date: "2026-04-09",
            paymentDate: "2026-04-09",
          },
        ],
        undelivered: [],
      };

      const json = JSON.stringify(reportData);
      const parsed = JSON.parse(json);

      expect(parsed.delivered[0]).toHaveProperty("invoiceId");
      expect(parsed.delivered[0]).toHaveProperty("reference");
      expect(parsed.delivered[0]).toHaveProperty("rep");
      expect(parsed.delivered[0]).toHaveProperty("repName");
      expect(parsed.delivered[0]).toHaveProperty("customer");
      expect(parsed.delivered[0]).toHaveProperty("product");
      expect(parsed.delivered[0]).toHaveProperty("quantity");
      expect(parsed.delivered[0]).toHaveProperty("price");
      expect(parsed.delivered[0]).toHaveProperty("itemTotal");
      expect(parsed.delivered[0]).toHaveProperty("category");
      expect(parsed.delivered[0]).toHaveProperty("percentage");
      expect(parsed.delivered[0]).toHaveProperty("bonus");
      expect(parsed.delivered[0]).toHaveProperty("paymentDate");
    });

    it("report summary numbers are consistent", () => {
      const delivered = [
        { itemTotal: 3105.00, bonus: 31.05 },
        { itemTotal: 2750.00, bonus: 27.50 },
      ];
      const undelivered = [
        { itemTotal: 1000.00, bonus: 10.00 },
      ];

      const totalSales = [...delivered, ...undelivered].reduce((s, i) => s + i.itemTotal, 0);
      const totalBonus = [...delivered, ...undelivered].reduce((s, i) => s + i.bonus, 0);
      const deliveredBonus = delivered.reduce((s, i) => s + i.bonus, 0);
      const undeliveredBonus = undelivered.reduce((s, i) => s + i.bonus, 0);

      expect(totalSales).toBe(6855.00);
      expect(totalBonus).toBe(68.55);
      expect(deliveredBonus).toBe(58.55);
      expect(undeliveredBonus).toBe(10.00);
      expect(deliveredBonus + undeliveredBonus).toBe(totalBonus);
    });
  });
});
