import { describe, it, expect } from "vitest";
import { fetchQoyodProducts } from "./qoyod";

describe("Qoyod API Key Validation", () => {
  it("should successfully fetch products with the configured API key", async () => {
    // This test validates that the QOYOD_API_KEY environment variable is correctly set
    // and can authenticate with Qoyod API
    const products = await fetchQoyodProducts();
    
    // Should return an array (even if empty)
    expect(Array.isArray(products)).toBe(true);
    
    // If products exist, they should have the expected structure
    if (products.length > 0) {
      const product = products[0];
      expect(product).toHaveProperty("id");
      expect(product).toHaveProperty("name_ar");
      expect(typeof product.id).toBe("number");
      expect(typeof product.name_ar).toBe("string");
    }
  }, 30000); // 30 second timeout for API call
});
