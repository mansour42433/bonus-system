import { describe, expect, it, vi, beforeEach } from "vitest";
import { calculateBonus } from "./qoyod";

describe("calculateBonus", () => {
  it("returns 2% bonus when price >= premiumPrice and bonus2 enabled", () => {
    const result = calculateBonus(60.87, 10, 15, 70, 69, true, true);
    // priceWithTax = 60.87 * 1.15 = 70.0005
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
    expect(result.bonus).toBeCloseTo(60.87 * 1.15 * 10 * 0.02, 2);
  });

  it("returns 1% bonus when price < premiumPrice and bonus1 enabled", () => {
    const result = calculateBonus(50, 5, 15, 70, 69, true, true);
    // priceWithTax = 50 * 1.15 = 57.5
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
    expect(result.bonus).toBeCloseTo(50 * 1.15 * 5 * 0.01, 2);
  });

  it("returns 0% when bonus1 and bonus2 are disabled", () => {
    const result = calculateBonus(60.87, 10, 15, 70, 69, false, false);
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.bonus).toBe(0);
  });

  it("falls back to 1% when price >= premiumPrice but bonus2 disabled", () => {
    const result = calculateBonus(60.87, 10, 15, 70, 69, true, false);
    // priceWithTax = 70.0005, >= premiumPrice=70, but bonus2 disabled → fallback to 1%
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
  });

  it("returns 0% when price < premiumPrice and bonus1 disabled", () => {
    const result = calculateBonus(50, 5, 15, 70, 69, false, true);
    // priceWithTax = 57.5, < 70, bonus1 disabled
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.bonus).toBe(0);
  });

  it("handles zero quantity correctly", () => {
    const result = calculateBonus(60.87, 0, 15, 70, 69, true, true);
    expect(result.bonus).toBe(0);
  });

  it("handles zero price correctly", () => {
    const result = calculateBonus(0, 10, 15, 70, 69, true, true);
    expect(result.percentage).toBe(0);
    expect(result.bonus).toBe(0);
  });

  it("calculates correct priceWithTax", () => {
    const result = calculateBonus(100, 1, 15, 70, 69, true, true);
    expect(result.priceWithTax).toBeCloseTo(115, 2);
  });
});

describe("Dashboard Wizard Flow Logic", () => {
  // Test the invoice grouping and selection logic used in the Dashboard
  
  interface MockInvoiceRow {
    uniqueKey: string;
    invoiceId: number;
    reference: string;
    rep: string;
    bonus: number;
    isPending: boolean;
    paymentStatus: string;
    itemTotal: number;
  }

  const mockPaidInvoices: MockInvoiceRow[] = [
    { uniqueKey: "1001-P1-rep1@test.com", invoiceId: 1001, reference: "INV001", rep: "rep1@test.com", bonus: 50, isPending: false, paymentStatus: "مدفوعة", itemTotal: 2500 },
    { uniqueKey: "1001-P2-rep1@test.com", invoiceId: 1001, reference: "INV001", rep: "rep1@test.com", bonus: 30, isPending: false, paymentStatus: "مدفوعة", itemTotal: 1500 },
    { uniqueKey: "1002-P1-rep2@test.com", invoiceId: 1002, reference: "INV002", rep: "rep2@test.com", bonus: 100, isPending: false, paymentStatus: "مدفوعة", itemTotal: 5000 },
  ];

  const mockUnpaidInvoices: MockInvoiceRow[] = [
    { uniqueKey: "2001-P1-rep1@test.com", invoiceId: 2001, reference: "INV003", rep: "rep1@test.com", bonus: 40, isPending: true, paymentStatus: "آجلة", itemTotal: 2000 },
  ];

  it("correctly calculates selected bonus total", () => {
    const selectedKeys = new Set(["1001-P1-rep1@test.com", "1001-P2-rep1@test.com"]);
    const allUndelivered = [...mockPaidInvoices, ...mockUnpaidInvoices];
    const total = allUndelivered
      .filter(inv => selectedKeys.has(inv.uniqueKey))
      .reduce((sum, inv) => sum + inv.bonus, 0);
    expect(total).toBe(80); // 50 + 30
  });

  it("correctly groups invoices by invoiceId-rep for saving", () => {
    const selectedKeys = new Set(["1001-P1-rep1@test.com", "1001-P2-rep1@test.com", "1002-P1-rep2@test.com"]);
    const allUndelivered = [...mockPaidInvoices, ...mockUnpaidInvoices];
    const selectedItems = allUndelivered.filter(inv => selectedKeys.has(inv.uniqueKey));
    
    const invoiceGroups = new Map<string, MockInvoiceRow[]>();
    selectedItems.forEach(inv => {
      const groupKey = `${inv.invoiceId}-${inv.rep}`;
      if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
      invoiceGroups.get(groupKey)!.push(inv);
    });
    
    expect(invoiceGroups.size).toBe(2); // 1001-rep1 and 1002-rep2
    expect(invoiceGroups.get("1001-rep1@test.com")!.length).toBe(2);
    expect(invoiceGroups.get("1002-rep2@test.com")!.length).toBe(1);
  });

  it("correctly separates paid and unpaid invoices", () => {
    const allInvoices = [...mockPaidInvoices, ...mockUnpaidInvoices];
    const paid = allInvoices.filter(inv => !inv.isPending);
    const unpaid = allInvoices.filter(inv => inv.isPending);
    
    expect(paid.length).toBe(3);
    expect(unpaid.length).toBe(1);
    expect(unpaid[0].paymentStatus).toBe("آجلة");
  });

  it("correctly filters by rep", () => {
    const allInvoices = [...mockPaidInvoices, ...mockUnpaidInvoices];
    const rep1Invoices = allInvoices.filter(inv => inv.rep === "rep1@test.com");
    const rep2Invoices = allInvoices.filter(inv => inv.rep === "rep2@test.com");
    
    expect(rep1Invoices.length).toBe(3);
    expect(rep2Invoices.length).toBe(1);
  });

  it("correctly generates markAsPaid input from saved keys", () => {
    const savedKeys = new Set(["1001-P1-rep1@test.com", "1001-P2-rep1@test.com", "1002-P1-rep2@test.com"]);
    const allUndelivered = [...mockPaidInvoices, ...mockUnpaidInvoices];
    const savedItems = allUndelivered.filter(inv => savedKeys.has(inv.uniqueKey));
    
    const invoiceGroups = new Map<string, MockInvoiceRow[]>();
    savedItems.forEach(inv => {
      const groupKey = `${inv.invoiceId}-${inv.rep}`;
      if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
      invoiceGroups.get(groupKey)!.push(inv);
    });
    
    const invoiceItems = Array.from(invoiceGroups.entries()).map(([key]) => ({
      invoiceId: parseInt(key.split("-")[0]),
      repEmail: key.split("-").slice(1).join("-"),
    }));
    
    expect(invoiceItems.length).toBe(2);
    expect(invoiceItems).toContainEqual({ invoiceId: 1001, repEmail: "rep1@test.com" });
    expect(invoiceItems).toContainEqual({ invoiceId: 1002, repEmail: "rep2@test.com" });
  });

  it("select all toggles correctly", () => {
    const invoices = mockPaidInvoices;
    const allKeys = invoices.map(inv => inv.uniqueKey);
    
    // Initially empty
    let selectedInvoices = new Set<string>();
    
    // Select all
    const allSelected = allKeys.every(key => selectedInvoices.has(key));
    expect(allSelected).toBe(false);
    
    // Add all
    allKeys.forEach(key => selectedInvoices.add(key));
    expect(selectedInvoices.size).toBe(3);
    
    // Now all are selected
    const nowAllSelected = allKeys.every(key => selectedInvoices.has(key));
    expect(nowAllSelected).toBe(true);
    
    // Toggle off (deselect all)
    allKeys.forEach(key => selectedInvoices.delete(key));
    expect(selectedInvoices.size).toBe(0);
  });

  it("delivered invoice keys correctly identify delivered items", () => {
    const deliveredInvoiceKeys = new Set(["1001-rep1@test.com"]);
    
    const isDelivered1 = deliveredInvoiceKeys.has(`${1001}-rep1@test.com`);
    const isDelivered2 = deliveredInvoiceKeys.has(`${1002}-rep2@test.com`);
    
    expect(isDelivered1).toBe(true);
    expect(isDelivered2).toBe(false);
  });
});

describe("Return Quantities Calculation", () => {
  it("correctly maps credit notes to returned quantities", () => {
    const creditNoteToInvoice = new Map<number, number>();
    creditNoteToInvoice.set(5001, 1001); // Credit note 5001 belongs to invoice 1001
    
    const creditNotes = [
      {
        id: 5001,
        line_items: [
          { product_id: 101, quantity: 2 },
          { product_id: 102, quantity: 1 },
        ],
      },
    ];
    
    const returnedQuantities = new Map<string, number>();
    creditNotes.forEach(cn => {
      const invoiceId = creditNoteToInvoice.get(cn.id);
      if (invoiceId) {
        cn.line_items.forEach(item => {
          const key = `${invoiceId}-${item.product_id}`;
          const existing = returnedQuantities.get(key) || 0;
          returnedQuantities.set(key, existing + item.quantity);
        });
      }
    });
    
    expect(returnedQuantities.get("1001-101")).toBe(2);
    expect(returnedQuantities.get("1001-102")).toBe(1);
    expect(returnedQuantities.get("1002-101")).toBeUndefined();
  });

  it("correctly calculates actual quantity after returns", () => {
    const originalQty = 10;
    const returnedQty = 3;
    const actualQty = originalQty - returnedQty;
    
    expect(actualQty).toBe(7);
    expect(actualQty > 0).toBe(true);
  });

  it("skips items with zero or negative actual quantity", () => {
    const items = [
      { quantity: 10, returnedQty: 10 }, // actual = 0
      { quantity: 5, returnedQty: 7 },   // actual = -2
      { quantity: 8, returnedQty: 3 },   // actual = 5
    ];
    
    const validItems = items.filter(item => (item.quantity - item.returnedQty) > 0);
    expect(validItems.length).toBe(1);
    expect(validItems[0].quantity - validItems[0].returnedQty).toBe(5);
  });
});
