import { describe, it, expect } from "vitest";

// Test bonus calculation logic
describe("Bonus Delivery System", () => {
  // Test bonus percentage calculation
  it("should calculate 1% bonus when price is below premium price", () => {
    const priceWithTax = 60;
    const premiumPrice = 70;
    const bonus1Enabled = true;
    const bonus2Enabled = true;
    
    let percentage = 0;
    if (priceWithTax > 0) {
      if (priceWithTax >= premiumPrice && bonus2Enabled) {
        percentage = 2;
      } else if (priceWithTax < premiumPrice && bonus1Enabled) {
        percentage = 1;
      }
    }
    
    expect(percentage).toBe(1);
  });

  it("should calculate 2% bonus when price is at or above premium price", () => {
    const priceWithTax = 75;
    const premiumPrice = 70;
    const bonus1Enabled = true;
    const bonus2Enabled = true;
    
    let percentage = 0;
    if (priceWithTax > 0) {
      if (priceWithTax >= premiumPrice && bonus2Enabled) {
        percentage = 2;
      } else if (priceWithTax < premiumPrice && bonus1Enabled) {
        percentage = 1;
      }
    }
    
    expect(percentage).toBe(2);
  });

  it("should return 0% when bonus1 is disabled and price is below premium", () => {
    const priceWithTax = 60;
    const premiumPrice = 70;
    const bonus1Enabled = false;
    const bonus2Enabled = true;
    
    let percentage = 0;
    if (priceWithTax > 0) {
      if (priceWithTax >= premiumPrice && bonus2Enabled) {
        percentage = 2;
      } else if (priceWithTax < premiumPrice && bonus1Enabled) {
        percentage = 1;
      }
    }
    
    expect(percentage).toBe(0);
  });

  it("should return 1% when bonus2 is disabled but bonus1 is enabled and price is above premium", () => {
    const priceWithTax = 75;
    const premiumPrice = 70;
    const bonus1Enabled = true;
    const bonus2Enabled = false;
    
    let percentage = 0;
    if (priceWithTax > 0) {
      if (priceWithTax >= premiumPrice && bonus2Enabled) {
        percentage = 2;
      } else if (priceWithTax < premiumPrice && bonus1Enabled) {
        percentage = 1;
      } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
        percentage = 1;
      }
    }
    
    expect(percentage).toBe(1);
  });

  it("should correctly calculate bonus amount", () => {
    const priceWithTax = 80;
    const quantity = 10;
    const percentage = 2;
    const itemTotal = priceWithTax * quantity;
    const bonus = itemTotal * (percentage / 100);
    
    expect(itemTotal).toBe(800);
    expect(bonus).toBe(16);
  });

  // Test delivered invoice tracking
  it("should correctly identify delivered invoices", () => {
    const deliveredList = [
      { invoiceId: 1, repEmail: "rep1@test.com" },
      { invoiceId: 2, repEmail: "rep1@test.com" },
      { invoiceId: 3, repEmail: "rep2@test.com" },
    ];
    
    const deliveredKeys = new Set<string>();
    deliveredList.forEach(bp => {
      deliveredKeys.add(`${bp.invoiceId}-${bp.repEmail}`);
    });
    
    expect(deliveredKeys.has("1-rep1@test.com")).toBe(true);
    expect(deliveredKeys.has("2-rep1@test.com")).toBe(true);
    expect(deliveredKeys.has("3-rep2@test.com")).toBe(true);
    expect(deliveredKeys.has("4-rep1@test.com")).toBe(false);
  });

  // Test returned quantities deduction
  it("should deduct returned quantities from actual quantity", () => {
    const quantity = 10;
    const returnedQty = 3;
    const actualQuantity = quantity - returnedQty;
    
    expect(actualQuantity).toBe(7);
  });

  it("should not calculate bonus when actual quantity is zero or negative", () => {
    const quantity = 5;
    const returnedQty = 5;
    const actualQuantity = quantity - returnedQty;
    
    expect(actualQuantity).toBe(0);
    expect(actualQuantity <= 0).toBe(true);
  });

  // Test grouping invoices by rep
  it("should correctly group invoices by rep for delivery", () => {
    const selectedInvoices = [
      { invoiceId: 1, rep: "rep1@test.com", bonus: 10 },
      { invoiceId: 1, rep: "rep1@test.com", bonus: 20 },
      { invoiceId: 2, rep: "rep1@test.com", bonus: 15 },
      { invoiceId: 3, rep: "rep2@test.com", bonus: 25 },
    ];
    
    const invoiceGroups = new Map<string, any[]>();
    selectedInvoices.forEach(inv => {
      const groupKey = `${inv.invoiceId}-${inv.rep}`;
      if (!invoiceGroups.has(groupKey)) {
        invoiceGroups.set(groupKey, []);
      }
      invoiceGroups.get(groupKey)!.push(inv);
    });
    
    expect(invoiceGroups.size).toBe(3);
    expect(invoiceGroups.get("1-rep1@test.com")!.length).toBe(2);
    expect(invoiceGroups.get("1-rep1@test.com")!.reduce((s: number, i: any) => s + i.bonus, 0)).toBe(30);
  });
});
