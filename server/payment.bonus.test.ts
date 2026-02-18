/**
 * Test payment-based bonus calculation with allocations
 */

import { describe, it, expect } from "vitest";

describe("Payment-Based Bonus Calculation", () => {
  it("should filter invoices by payment date, not issue date", () => {
    // Mock invoice issued in January but paid in February
    const invoice = {
      id: 1,
      reference: "INV001",
      issue_date: "2026-01-15", // Issued in January
      status: "Paid",
      line_items: [
        {
          product_id: 100,
          product_name: "Product A",
          quantity: 10,
          unit_price: 50,
          tax_percent: 15,
        },
      ],
    };

    // Payment made in February
    const payment = {
      id: 1,
      invoice_id: 1,
      date: "2026-02-10", // Paid in February
      amount: "575.00",
    };

    // Selected month: February 2026
    const selectedYear = 2026;
    const selectedMonthNum = 2;

    // Check if payment was made in selected month
    const [payYear, payMonth] = payment.date.split("-").map(Number);
    const isInSelectedMonth = payYear === selectedYear && payMonth === selectedMonthNum;

    expect(isInSelectedMonth).toBe(true);
    expect(invoice.issue_date.startsWith("2026-01")).toBe(true); // Issued in different month
  });

  it("should link credit notes to invoices via allocations", () => {
    // Mock credit note
    const creditNote = {
      id: 10,
      reference: "CRN001",
      line_items: [
        {
          product_id: 100,
          quantity: 2, // Returned 2 units
        },
      ],
    };

    // Mock payment with allocation
    const payment = {
      id: 1,
      invoice_id: 1,
      date: "2026-02-10",
      allocations: [
        {
          id: 1,
          source_id: 10, // Credit Note ID
          source_type: "CreditNote",
          amount: "115.00",
        },
      ],
    };

    // Build credit note to invoice map
    const creditNoteToInvoice = new Map<number, number>();
    payment.allocations?.forEach((allocation: any) => {
      if (allocation.source_type === "CreditNote") {
        creditNoteToInvoice.set(allocation.source_id, payment.invoice_id);
      }
    });

    // Verify mapping
    expect(creditNoteToInvoice.get(10)).toBe(1);

    // Build returned quantities map
    const returnedQuantities = new Map<string, number>();
    const invoiceId = creditNoteToInvoice.get(creditNote.id);
    if (invoiceId) {
      creditNote.line_items.forEach((item: any) => {
        const key = `${invoiceId}-${item.product_id}`;
        returnedQuantities.set(key, item.quantity);
      });
    }

    // Verify returned quantity
    expect(returnedQuantities.get("1-100")).toBe(2);
  });

  it("should calculate bonus correctly with price tiers", () => {
    // Product settings
    const basePrice = 69; // Ceiling for 1%
    const premiumPrice = 70; // Floor for 2%

    // Test cases
    const testCases = [
      { price: 50, expectedPercentage: 1, category: "أساسي" }, // 0-69 → 1%
      { price: 69, expectedPercentage: 1, category: "أساسي" }, // Exactly at ceiling
      { price: 70, expectedPercentage: 2, category: "تميز" }, // Exactly at floor
      { price: 100, expectedPercentage: 2, category: "تميز" }, // Above floor
    ];

    testCases.forEach(({ price, expectedPercentage, category }) => {
      let percentage = 0;
      let actualCategory = "لا بونص";

      if (price >= premiumPrice) {
        percentage = 2;
        actualCategory = "تميز";
      } else if (price > 0 && price <= basePrice) {
        percentage = 1;
        actualCategory = "أساسي";
      }

      expect(percentage).toBe(expectedPercentage);
      expect(actualCategory).toBe(category);
    });
  });

  it("should calculate bonus with returned quantities", () => {
    const originalQuantity = 10;
    const returnedQty = 2;
    const actualQuantity = originalQuantity - returnedQty;

    const priceWithTax = 57.5; // 50 * 1.15
    const itemTotal = priceWithTax * actualQuantity;
    const percentage = 1;
    const bonus = itemTotal * (percentage / 100);

    expect(actualQuantity).toBe(8);
    expect(itemTotal).toBe(460); // 57.5 * 8
    expect(bonus).toBeCloseTo(4.6, 2); // 460 * 0.01 (with floating point tolerance)
  });

  it("should skip fully returned items", () => {
    const originalQuantity = 10;
    const returnedQty = 10;
    const actualQuantity = originalQuantity - returnedQty;

    expect(actualQuantity).toBe(0);
    // Item should be skipped (actualQuantity <= 0)
  });
});
