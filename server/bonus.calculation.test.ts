import { describe, it, expect } from "vitest";
import { calculateBonus } from "./qoyod";

describe("Bonus Calculation Logic", () => {
  it("should calculate 2% bonus for premium tier (price >= 70)", () => {
    const result = calculateBonus(
      60.87, // unit price (before tax)
      10,    // quantity
      15,    // tax percent
      70,    // premium price threshold
      69     // base price threshold
    );

    // Price with tax: 60.87 * 1.15 = 70.0005 (>= 70)
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
    expect(result.priceWithTax).toBeCloseTo(70.0005, 2);
    
    // Bonus = (70.0005 * 10) * 0.02 = 14.001
    expect(result.bonus).toBeCloseTo(14.001, 2);
  });

  it("should calculate 1% bonus for base tier (price >= 69 and < 70)", () => {
    const result = calculateBonus(
      60.00, // unit price (before tax)
      5,     // quantity
      15,    // tax percent
      70,    // premium price threshold
      69     // base price threshold
    );

    // Price with tax: 60 * 1.15 = 69 (>= 69 and < 70)
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
    expect(result.priceWithTax).toBe(69);
    
    // Bonus = (69 * 5) * 0.01 = 3.45
    expect(result.bonus).toBe(3.45);
  });

  it("should calculate 0% bonus for prices below base threshold", () => {
    const result = calculateBonus(
      50.00, // unit price (before tax)
      10,    // quantity
      15,    // tax percent
      70,    // premium price threshold
      69     // base price threshold
    );

    // Price with tax: 50 * 1.15 = 57.5 (< 69)
    expect(result.percentage).toBe(0);
    expect(result.category).toBe("لا بونص");
    expect(result.priceWithTax).toBeCloseTo(57.5, 1);
    expect(result.bonus).toBe(0);
  });

  it("should calculate bonus on total sales amount (price * quantity)", () => {
    const result = calculateBonus(
      60.87, // unit price
      20,    // quantity (doubled)
      15,    // tax percent
      70,    // premium price threshold
      69     // base price threshold
    );

    // Total sales: 70.0005 * 20 = 1400.01
    // Bonus: 1400.01 * 0.02 = 28.0002
    expect(result.bonus).toBeCloseTo(28.0002, 2);
  });

  it("should handle edge case: price exactly at premium threshold", () => {
    const result = calculateBonus(
      70, // Price after tax = 70 (no tax calculation needed for this test)
      1,
      0,  // No tax for simplicity
      70,
      69
    );

    expect(result.priceWithTax).toBe(70);
    expect(result.percentage).toBe(2);
    expect(result.category).toBe("تميز");
  });

  it("should handle edge case: price exactly at base threshold", () => {
    const result = calculateBonus(
      60.00, // Exact price to get 69 after tax
      1,
      15,
      70,
      69
    );

    expect(result.priceWithTax).toBe(69);
    expect(result.percentage).toBe(1);
    expect(result.category).toBe("أساسي");
  });
});
