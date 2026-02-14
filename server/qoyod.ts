/**
 * Qoyod API Integration
 * Handles fetching invoices and products from Qoyod API v2
 */

import { ENV } from "./_core/env";

const QOYOD_API_BASE = "https://api.qoyod.com/2.0";

export interface QoyodInvoice {
  id: number;
  reference: string;
  issue_date: string;
  status: string;
  total: string;
  created_by: string;
  customer_name?: string;
  line_items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_percent: number;
  }>;
  payments?: Array<{
    id: number;
    date: string;
    amount: string;
  }>;
  allocations?: Array<{
    id: number;
    amount: string;
    date: string;
    source_id: number;
    source_type: string;
  }>;
}

export interface QoyodProduct {
  id: number;
  name_ar: string;
  name_en: string;
  sku?: string;
  price: number;
  selling_price?: string;
  buying_price?: string;
}

export interface QoyodCreditNote {
  id: number;
  reference: string;
  issue_date: string;
  status: string;
  total: string;
  invoice_id?: number;
  line_items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_percent: number;
  }>;
}

/**
 * Fetch invoices from Qoyod API
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function fetchQoyodInvoices(
  startDate: string,
  endDate: string
): Promise<QoyodInvoice[]> {
  const headers = {
    "API-KEY": ENV.qoyodApiKey,
    "Content-Type": "application/json",
  };

  // Fetch both Paid and Approved invoices
  const url = `${QOYOD_API_BASE}/invoices?q[issue_date_gteq]=${startDate}&q[issue_date_lteq]=${endDate}&q[status_in][]=Paid&q[status_in][]=Approved`;

  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.invoices || [];
  } catch (error) {
    console.error("[Qoyod] Failed to fetch invoices:", error);
    throw error;
  }
}

/**
 * Fetch products from Qoyod API
 */
export async function fetchQoyodProducts(): Promise<QoyodProduct[]> {
  const headers = {
    "API-KEY": ENV.qoyodApiKey,
    "Content-Type": "application/json",
  };

  const url = `${QOYOD_API_BASE}/products`;

  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.products || [];
  } catch (error) {
    console.error("[Qoyod] Failed to fetch products:", error);
    throw error;
  }
}

/**
 * Fetch credit notes from Qoyod API
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function fetchQoyodCreditNotes(
  startDate: string,
  endDate: string
): Promise<QoyodCreditNote[]> {
  const headers = {
    "API-KEY": ENV.qoyodApiKey,
    "Content-Type": "application/json",
  };

  const url = `${QOYOD_API_BASE}/credit_notes?q[issue_date_gteq]=${startDate}&q[issue_date_lteq]=${endDate}`;

  try {
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.credit_notes || [];
  } catch (error) {
    console.error("[Qoyod] Failed to fetch credit notes:", error);
    // Return empty array if credit notes endpoint doesn't exist
    return [];
  }
}

/**
 * Calculate bonus for an invoice line item
 * @param unitPrice - Unit price from Qoyod
 * @param quantity - Quantity
 * @param taxPercent - Tax percentage (usually 15)
 * @param premiumPrice - Premium tier price threshold
 * @param basePrice - Base tier price threshold
 */
export function calculateBonus(
  unitPrice: number,
  quantity: number,
  taxPercent: number,
  premiumPrice: number,
  basePrice: number
): { bonus: number; percentage: number; category: string; priceWithTax: number } {
  // Calculate price with tax (15% VAT)
  const priceWithTax = unitPrice * (1 + taxPercent / 100);

  let percentage = 0;
  let category = "لا بونص";

  // Determine bonus percentage based on unit price (not total)
  if (priceWithTax >= premiumPrice) {
    percentage = 2;
    category = "تميز";
  } else if (priceWithTax >= basePrice) {
    percentage = 1;
    category = "أساسي";
  }

  // Calculate bonus on total sales amount (price * quantity)
  const totalSales = priceWithTax * quantity;
  const bonus = totalSales * (percentage / 100);

  return {
    bonus,
    percentage,
    category,
    priceWithTax,
  };
}
