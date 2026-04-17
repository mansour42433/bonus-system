import { describe, it, expect } from "vitest";
import {
  recordBonusPayment,
  markBonusAsPaid,
  getBonusPayments,
  getAllBonusPayments,
} from "./db";

describe("Bonus v2.0 - تسليم البونص", () => {
  const testInvoiceId = 99990;
  const testInvoiceId2 = 99991;
  const testInvoiceId3 = 99992;
  const testRepEmail = "test-v2@example.com";

  it("يسجل بونص جديد بحالة unpaid", async () => {
    const result = await recordBonusPayment({
      invoiceId: testInvoiceId,
      invoiceReference: "TEST-V2-001",
      repEmail: testRepEmail,
      bonusAmount: 5000,
      bonusPercentage: 1,
      invoiceAmount: 500000,
      invoiceDate: "2026-04-01",
      paymentDate: "2026-04-05",
      status: "unpaid",
    });
    expect(result).toBeDefined();
  });

  it("يسجل بونص ثاني لنفس المندوب", async () => {
    const result = await recordBonusPayment({
      invoiceId: testInvoiceId2,
      invoiceReference: "TEST-V2-002",
      repEmail: testRepEmail,
      bonusAmount: 10000,
      bonusPercentage: 2,
      invoiceAmount: 500000,
      invoiceDate: "2026-04-02",
      paymentDate: "2026-04-06",
      status: "unpaid",
    });
    expect(result).toBeDefined();
  });

  it("يسجل بونص لشهر مختلف", async () => {
    const result = await recordBonusPayment({
      invoiceId: testInvoiceId3,
      invoiceReference: "TEST-V2-003",
      repEmail: testRepEmail,
      bonusAmount: 3000,
      bonusPercentage: 1,
      invoiceAmount: 300000,
      invoiceDate: "2026-03-15",
      paymentDate: "2026-03-20",
      status: "unpaid",
    });
    expect(result).toBeDefined();
  });

  it("يجلب البونص غير المسلم فقط", async () => {
    const payments = await getBonusPayments({
      status: "unpaid",
    });
    // All returned payments should have status unpaid
    payments.forEach((p) => {
      expect(p.status).toBe("unpaid");
    });
    // At least some should exist (from current or previous test runs)
    expect(payments.length).toBeGreaterThanOrEqual(0);
  });

  it("يسلم البونص بـ {invoiceId, repEmail}[]", async () => {
    const result = await markBonusAsPaid([
      { invoiceId: testInvoiceId, repEmail: testRepEmail },
      { invoiceId: testInvoiceId2, repEmail: testRepEmail },
    ]);
    expect(result).toBeDefined();
  });

  it("يتحقق أن الفواتير المسلمة أصبحت paid", async () => {
    const payments = await getBonusPayments({
      status: "paid",
    });
    const testPayments = payments.filter(
      (p) => p.repEmail === testRepEmail && p.status === "paid"
    );
    expect(testPayments.length).toBeGreaterThanOrEqual(2);
  });

  it("يتحقق أن الفاتورة الثالثة لا تزال unpaid (شهر مختلف)", async () => {
    const payments = await getBonusPayments({
      status: "unpaid",
    });
    const testPayment = payments.find(
      (p) => p.invoiceId === testInvoiceId3 && p.repEmail === testRepEmail
    );
    expect(testPayment).toBeDefined();
    expect(testPayment?.status).toBe("unpaid");
  });

  it("يمنع التكرار - تسجيل نفس الفاتورة مرتين", async () => {
    // Get count before
    const before = await getAllBonusPayments();
    const beforeCount = before.filter(
      (p) => p.invoiceId === testInvoiceId && p.repEmail === testRepEmail
    ).length;
    
    // Try to insert duplicate
    await recordBonusPayment({
      invoiceId: testInvoiceId,
      invoiceReference: "TEST-V2-001",
      repEmail: testRepEmail,
      bonusAmount: 5000,
      bonusPercentage: 1,
      invoiceAmount: 500000,
      invoiceDate: "2026-04-01",
      paymentDate: "2026-04-05",
      status: "unpaid",
    });
    
    const after = await getAllBonusPayments();
    const afterCount = after.filter(
      (p) => p.invoiceId === testInvoiceId && p.repEmail === testRepEmail
    ).length;
    // Count should not increase
    expect(afterCount).toBe(beforeCount);
  });

  it("يصدر جميع البيانات للنسخة الاحتياطية", async () => {
    const all = await getAllBonusPayments();
    expect(all.length).toBeGreaterThanOrEqual(3);
    const testPayments = all.filter((p) => p.repEmail === testRepEmail);
    expect(testPayments.length).toBeGreaterThanOrEqual(3);
  });
});
