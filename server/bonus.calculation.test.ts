import { describe, it, expect } from "vitest";
import { calculateBonus } from "./qoyod";

describe("Bonus Calculation Logic - New Rules", () => {
  // ✅ القاعدة الجديدة: premiumPrice هو الحد الفاصل الوحيد
  // >= premiumPrice → 2%, < premiumPrice → 1% (تلقائي)

  it("should calculate 2% for price >= premiumPrice (70)", () => {
    const result = calculateBonus(60.87, 10, 15, 70, 69);
    // 60.87 * 1.15 = 70.0005 >= 70 → 2%
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
    expect(result.priceWithTax).toBeCloseTo(70.0005, 2);
    expect(result.bonus).toBeCloseTo(14.001, 2);
  });

  it("should calculate 1% automatically for price < premiumPrice (رول تاريخ scenario)", () => {
    // رول تاريخ: سعر 62 ريال قبل ضريبة = 71.3 بعد ضريبة
    // لكن لو سعره 54 ريال = 62.1 بعد ضريبة < 70 → يجب 1% تلقائي
    const result = calculateBonus(54, 6, 15, 70, 69);
    // 54 * 1.15 = 62.1 < 70 → 1% automatically
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
    expect(result.priceWithTax).toBeCloseTo(62.1, 1);
    expect(result.bonus).toBeCloseTo(3.726, 2);
  });

  it("should calculate 1% automatically for ANY price > 0 and < premiumPrice", () => {
    // أي منتج بسعر أقل من سعر التميز يحصل على 1% تلقائياً
    const result = calculateBonus(10, 5, 15, 70, 69);
    // 10 * 1.15 = 11.5 < 70 → 1%
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
  });

  it("should return 0% for price = 0 (خدمة فاتورة آجلة)", () => {
    const result = calculateBonus(0, 1, 15, 70, 69);
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.bonus).toBe(0);
  });

  it("should disable 1% when bonus1Enabled=false", () => {
    const result = calculateBonus(50, 5, 15, 70, 69, false, true);
    // 50 * 1.15 = 57.5 < 70, but bonus1 disabled → لا بونص
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.bonus).toBe(0);
  });

  it("should disable 2% when bonus2Enabled=false", () => {
    const result = calculateBonus(65, 5, 15, 70, 69, true, false);
    // 65 * 1.15 = 74.75 >= 70, but bonus2 disabled → falls back to 1%
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
  });

  it("should disable both bonuses when both are false", () => {
    const result = calculateBonus(65, 5, 15, 70, 69, false, false);
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.bonus).toBe(0);
  });

  it("should calculate 2% for باركود 60*40 (price 250 ريال)", () => {
    // باركود 60*40: سعر 250 ريال (بعد ضريبة) >= 70 → 2%
    const result = calculateBonus(217.39, 10, 15, 70, 69);
    // 217.39 * 1.15 ≈ 250 >= 70 → 2%
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
    expect(result.bonus).toBeCloseTo(50, 0);
  });

  it("should calculate 1% for رول تاريخ (price 62 ريال before tax)", () => {
    // رول تاريخ: سعر 62 ريال قبل ضريبة = 71.3 بعد ضريبة >= 70 → 2%
    // لكن لو سعره 53.91 = 62 بعد ضريبة < 70 → 1%
    const result = calculateBonus(53.91, 6, 15, 70, 69);
    // 53.91 * 1.15 = 62.0 < 70 → 1%
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
  });

  it("should handle edge case: price exactly at premiumPrice threshold", () => {
    const result = calculateBonus(70, 1, 0, 70, 69);
    expect(result.priceWithTax).toBe(70);
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
  });

  it("should calculate bonus on total sales (price * quantity)", () => {
    const result = calculateBonus(60.87, 20, 15, 70, 69);
    // 70.0005 * 20 = 1400.01, bonus = 1400.01 * 0.02 = 28.0002
    expect(result.bonus).toBeCloseTo(28.0002, 2);
  });
});
