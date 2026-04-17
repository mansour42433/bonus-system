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

export interface QoyodInvoicePayment {
  id: number;
  reference: string;
  date: string;
  amount: string;
  invoice_id: number;
  description?: string;
  allocations?: Array<{
    id: number;
    amount: string;
    date: string;
    source_id: number;
    source_type: string; // "CreditNote" for credit notes
  }>;
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
 * Fetch ALL invoices from Qoyod API by issue date (no status filter)
 * Frontend filters by status locally (Paid, Approved, etc.)
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

  const allInvoices: QoyodInvoice[] = [];
  let page = 1;
  const perPage = 100; // Max per page to reduce API calls

  try {
    while (true) {
      const url = `${QOYOD_API_BASE}/invoices?q[issue_date_gteq]=${startDate}&q[issue_date_lteq]=${endDate}&page=${page}&per=${perPage}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const invoices = data.invoices || [];
      
      console.log(`[Qoyod] Fetched page ${page}: ${invoices.length} invoices`);
      allInvoices.push(...invoices);

      // If we got fewer than perPage, we've reached the last page
      if (invoices.length < perPage) {
        break;
      }
      
      page++;
      
      // Safety limit to prevent infinite loops
      if (page > 50) {
        console.warn("[Qoyod] Reached max page limit (50)");
        break;
      }
    }

    console.log(`[Qoyod] Total invoices fetched: ${allInvoices.length}`);
    return allInvoices;
  } catch (error) {
    console.error("[Qoyod] Failed to fetch invoices:", error);
    throw error;
  }
}

/**
 * Fetch specific invoices by IDs from Qoyod API
 * @param invoiceIds - Array of invoice IDs
 */
export async function fetchQoyodInvoicesByIds(
  invoiceIds: number[]
): Promise<QoyodInvoice[]> {
  if (invoiceIds.length === 0) return [];

  const headers = {
    "API-KEY": ENV.qoyodApiKey,
    "Content-Type": "application/json",
  };

  // Fetch invoices in batches (Qoyod API might have limits)
  const batchSize = 50;
  const invoices: QoyodInvoice[] = [];

  for (let i = 0; i < invoiceIds.length; i += batchSize) {
    const batch = invoiceIds.slice(i, i + batchSize);
    const idsParam = batch.map(id => `q[id_in][]=${id}`).join("&");
    const url = `${QOYOD_API_BASE}/invoices?${idsParam}`;

    try {
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      invoices.push(...(data.invoices || []));
    } catch (error) {
      console.error("[Qoyod] Failed to fetch invoices by IDs:", error);
      throw error;
    }
  }

  return invoices;
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
 * Fetch invoice payments from Qoyod API
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 */
export async function fetchQoyodInvoicePayments(
  startDate: string,
  endDate: string
): Promise<QoyodInvoicePayment[]> {
  const headers = {
    "API-KEY": ENV.qoyodApiKey,
    "Content-Type": "application/json",
  };

  const allPayments: QoyodInvoicePayment[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const url = `${QOYOD_API_BASE}/invoice_payments?q[date_gteq]=${startDate}&q[date_lteq]=${endDate}&page=${page}&per=${perPage}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const payments = data.receipts || [];
      
      console.log(`[Qoyod] Fetched payments page ${page}: ${payments.length} payments`);
      allPayments.push(...payments);

      if (payments.length < perPage) break;
      page++;
      if (page > 50) break;
    }

    console.log(`[Qoyod] Total payments fetched: ${allPayments.length}`);
    return allPayments;
  } catch (error) {
    console.error("[Qoyod] Failed to fetch invoice payments:", error);
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

  const allCreditNotes: QoyodCreditNote[] = [];
  let page = 1;
  const perPage = 100;

  try {
    while (true) {
      const url = `${QOYOD_API_BASE}/credit_notes?q[issue_date_gteq]=${startDate}&q[issue_date_lteq]=${endDate}&page=${page}&per=${perPage}`;
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`Qoyod API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const creditNotes = data.credit_notes || [];
      
      console.log(`[Qoyod] Fetched credit notes page ${page}: ${creditNotes.length} notes`);
      allCreditNotes.push(...creditNotes);

      if (creditNotes.length < perPage) break;
      page++;
      if (page > 50) break;
    }

    console.log(`[Qoyod] Total credit notes fetched: ${allCreditNotes.length}`);
    return allCreditNotes;
  } catch (error) {
    console.error("[Qoyod] Failed to fetch credit notes:", error);
    return [];
  }
}

/**
 * Calculate bonus for an invoice line item
 * @param unitPrice - Unit price from Qoyod
 * @param quantity - Quantity
 * @param taxPercent - Tax percentage (usually 15)
 * @param premiumPrice - Premium tier price threshold (>= this → 2%)
 * @param basePrice - (deprecated, kept for backward compat) not used in new logic
 * @param bonus1Enabled - Whether 1% bonus is enabled (default: true)
 * @param bonus2Enabled - Whether 2% bonus is enabled (default: true)
 */
export function calculateBonus(
  unitPrice: number,
  quantity: number,
  taxPercent: number,
  premiumPrice: number,
  basePrice: number,
  bonus1Enabled: boolean = true,
  bonus2Enabled: boolean = true
): { bonus: number; percentage: number; category: string; priceWithTax: number } {
  // Calculate price with tax (15% VAT)
  const priceWithTax = unitPrice * (1 + taxPercent / 100);

  let percentage = 0;
  let category = "لا بونص";

  // New logic: premiumPrice is the single threshold
  // >= premiumPrice → 2% (if enabled), < premiumPrice → 1% (if enabled)
  if (priceWithTax > 0) {
    if (priceWithTax >= premiumPrice && bonus2Enabled) {
      percentage = 2;
      category = "تميز";
    } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
      // 2% disabled, fall back to 1%
      percentage = 1;
      category = "أساسي";
    } else if (priceWithTax < premiumPrice && bonus1Enabled) {
      percentage = 1;
      category = "أساسي";
    }
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
