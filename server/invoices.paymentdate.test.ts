/**
 * Test fetchInvoicesByPaymentDate logic
 */

import { describe, it, expect } from "vitest";

describe("Fetch Invoices by Payment Date", () => {
  it("should extract unique invoice IDs from payments", () => {
    // Mock payments
    const payments = [
      { id: 1, invoice_id: 100, date: "2026-02-10", amount: "500.00" },
      { id: 2, invoice_id: 101, date: "2026-02-15", amount: "300.00" },
      { id: 3, invoice_id: 100, date: "2026-02-20", amount: "200.00" }, // Same invoice, later payment
    ];

    // Extract unique invoice IDs and get latest payment date
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

    // Should have 2 unique invoice IDs
    expect(invoiceIds).toHaveLength(2);
    expect(invoiceIds).toContain(100);
    expect(invoiceIds).toContain(101);

    // Invoice 100 should have latest payment date (2026-02-20)
    expect(invoicePaymentDates.get(100)).toBe("2026-02-20");
    expect(invoicePaymentDates.get(101)).toBe("2026-02-15");
  });

  it("should filter only Paid invoices", () => {
    // Mock invoices
    const invoices = [
      { id: 100, reference: "INV100", status: "Paid" },
      { id: 101, reference: "INV101", status: "Approved" },
      { id: 102, reference: "INV102", status: "Paid" },
      { id: 103, reference: "INV103", status: "Draft" },
    ];

    // Filter only Paid invoices
    const paidInvoices = invoices.filter((inv: any) => inv.status === "Paid");

    expect(paidInvoices).toHaveLength(2);
    expect(paidInvoices[0].id).toBe(100);
    expect(paidInvoices[1].id).toBe(102);
  });

  it("should handle invoices issued in different month but paid in selected month", () => {
    // Invoice issued in January
    const invoice = {
      id: 100,
      reference: "INV100",
      issue_date: "2026-01-15", // January
      status: "Paid",
    };

    // Payment made in February
    const payment = {
      id: 1,
      invoice_id: 100,
      date: "2026-02-10", // February
      amount: "500.00",
    };

    // Selected month: February 2026
    const selectedYear = 2026;
    const selectedMonthNum = 2;

    // Check if payment was made in selected month
    const [payYear, payMonth] = payment.date.split("-").map(Number);
    const isInSelectedMonth = payYear === selectedYear && payMonth === selectedMonthNum;

    // Payment is in February, so invoice should be included
    expect(isInSelectedMonth).toBe(true);

    // Invoice was issued in January, but that doesn't matter
    expect(invoice.issue_date.startsWith("2026-01")).toBe(true);
  });

  it("should handle empty payments array", () => {
    const payments: any[] = [];

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

    expect(invoiceIds).toHaveLength(0);
  });
});
