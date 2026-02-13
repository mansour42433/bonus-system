import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

describe("Rep Settings", () => {
  const mockContext: Context = {
    user: {
      id: 1,
      openId: "test-openid",
      name: "Test User",
      email: "test@example.com",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      loginMethod: "email",
    },
    req: {} as any,
    res: {} as any,
  };

  const caller = appRouter.createCaller(mockContext);

  it("should list rep settings (empty initially)", async () => {
    const result = await caller.reps.list();
    expect(result).toHaveProperty("reps");
    expect(Array.isArray(result.reps)).toBe(true);
  });

  it("should update rep setting with nickname, target, and bonus", async () => {
    const result = await caller.reps.update({
      repEmail: "rep@example.com",
      repNickname: "مندوب الاختبار",
      monthlyTarget: 50000,
      bonusAmount: 5000,
    });
    expect(result).toEqual({ success: true });
  });

  it("should retrieve updated rep setting", async () => {
    // First update
    await caller.reps.update({
      repEmail: "rep@example.com",
      repNickname: "مندوب الاختبار",
      monthlyTarget: 50000,
      bonusAmount: 5000,
    });

    // Then list
    const result = await caller.reps.list();
    const rep = result.reps.find((r) => r.repEmail === "rep@example.com");
    
    expect(rep).toBeDefined();
    expect(rep?.repNickname).toBe("مندوب الاختبار");
    expect(rep?.monthlyTarget).toBe(50000);
    expect(rep?.bonusAmount).toBe(5000);
  });

  it("should update existing rep setting (upsert)", async () => {
    // First insert
    await caller.reps.update({
      repEmail: "rep2@example.com",
      repNickname: "مندوب 2",
      monthlyTarget: 30000,
      bonusAmount: 3000,
    });

    // Then update
    await caller.reps.update({
      repEmail: "rep2@example.com",
      repNickname: "مندوب محدث",
      monthlyTarget: 40000,
      bonusAmount: 4000,
    });

    // Verify update
    const result = await caller.reps.list();
    const rep = result.reps.find((r) => r.repEmail === "rep2@example.com");
    
    expect(rep?.repNickname).toBe("مندوب محدث");
    expect(rep?.monthlyTarget).toBe(40000);
    expect(rep?.bonusAmount).toBe(4000);
  });
});
