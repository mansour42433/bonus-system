import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  Settings, RefreshCw, CheckCircle2,
  Clock, Wallet, Package, Layers,
  FileDown, ArrowLeft, Undo2, ClipboardList,
  Target, TrendingUp, Archive
} from "lucide-react";

// ==================== TYPES ====================
interface InvoiceRow {
  uniqueKey: string;
  invoiceId: number;
  reference: string;
  rep: string;
  customer: string;
  product: string;
  productId: number;
  quantity: number;
  returnedQty: number;
  price: number;
  itemTotal: number;
  category: string;
  percentage: number;
  bonus: number;
  date: string;
  isPending: boolean;
  paymentStatus: string;
}

interface ReturnRow {
  creditNoteId: number;
  creditNoteRef: string;
  invoiceId: number;
  invoiceRef: string;
  product: string;
  productId: number;
  quantity: number;
  unitPrice: number;
  total: number;
  date: string;
  rep: string;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  // Date range: default to current month
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return last.toISOString().split("T")[0];
  });

  const [selectedRep, setSelectedRep] = useState<string>("all");
  const [mainTab, setMainTab] = useState("paid");

  // Validate dates
  const validDates = useMemo(() => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(startDate) && dateRegex.test(endDate);
  }, [startDate, endDate]);

  // Fetch ALL invoices by issue date (both Paid and Approved)
  const { data: allInvoicesData, isLoading: allInvoicesLoading, refetch: refetchAllInvoices } =
    trpc.qoyod.fetchInvoices.useQuery(
      { startDate, endDate },
      { 
        enabled: validDates,
        staleTime: 0,
        gcTime: 0
      }
    );

  // Derive paid invoices from allInvoicesData (status === "Paid")
  const invoicesData = useMemo(() => {
    if (!allInvoicesData?.invoices) return null;
    return { invoices: allInvoicesData.invoices.filter((inv: any) => inv.status === "Paid") };
  }, [allInvoicesData]);
  const invoicesLoading = allInvoicesLoading;
  const refetchInvoices = refetchAllInvoices;

  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const { data: creditNotesData, refetch: refetchCreditNotes } =
    trpc.qoyod.fetchCreditNotes.useQuery({ startDate, endDate }, { enabled: validDates, staleTime: 0, gcTime: 0 });
  const { data: paymentsData, refetch: refetchPayments } =
    trpc.qoyod.fetchInvoicePayments.useQuery({ startDate, endDate }, { enabled: validDates, staleTime: 0, gcTime: 0 });
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();

  // Helper: rep display name
  const getRepDisplayName = useCallback((repEmail: string) => {
    const repSetting = repsData?.reps.find((r: any) => r.repEmail === repEmail);
    return repSetting?.repNickname || repEmail;
  }, [repsData]);

  // ==================== BONUS CALCULATION ====================
  const bonusData = useMemo(() => {
    if (!invoicesData?.invoices || !settingsData?.settings) return null;

    const invoices = invoicesData.invoices;
    const settings = settingsData.settings;
    const creditNotes = creditNotesData?.creditNotes || [];
    const payments = paymentsData?.payments || [];

    // Credit note to invoice map
    const creditNoteToInvoice = new Map<number, number>();
    payments.forEach((payment: any) => {
      payment.allocations?.forEach((allocation: any) => {
        if (allocation.source_type === "CreditNote" && allocation.allocatee_type === "Invoice") {
          creditNoteToInvoice.set(allocation.source_id, allocation.allocatee_id);
        }
      });
    });

    // Returned quantities map
    const returnedQuantities = new Map<string, number>();
    creditNotes.forEach((cn: any) => {
      const invoiceId = creditNoteToInvoice.get(cn.id);
      if (invoiceId) {
        cn.line_items?.forEach((item: any) => {
          const key = `${invoiceId}-${item.product_id}`;
          const existing = returnedQuantities.get(key) || 0;
          returnedQuantities.set(key, existing + item.quantity);
        });
      }
    });

    let totalSales = 0, sales1Percent = 0, sales2Percent = 0, totalBonus = 0;
    const paidInvoices: InvoiceRow[] = [];
    const processedKeys = new Set<string>();

    const productAnalysis = new Map<string, {
      productId: number; name: string; quantity: number;
      totalSales: number; totalBonus: number; sellCount: number; category: string;
    }>();

    invoices.forEach((invoice: any) => {
      // Use issue_date as the primary date

      invoice.line_items?.forEach((item: any) => {
        const dedupeKey = `${invoice.id}-${item.product_id}`;
        if (processedKeys.has(dedupeKey)) return;
        processedKeys.add(dedupeKey);

        const setting = settings.find((s: any) => String(s.productId) === String(item.product_id));
        const premiumPrice = setting?.premiumPrice ?? 70;

        const returnKey = `${invoice.id}-${item.product_id}`;
        const returnedQty = returnedQuantities.get(returnKey) || 0;
        const actualQuantity = item.quantity - returnedQty;
        if (actualQuantity <= 0) return;

        const priceWithTax = item.unit_price * (1 + (item.tax_percent || 15) / 100);
        const itemTotal = priceWithTax * actualQuantity;

        const bonus1Enabled = setting?.bonus1Enabled !== undefined ? setting.bonus1Enabled : true;
        const bonus2Enabled = setting?.bonus2Enabled !== undefined ? setting.bonus2Enabled : true;

        let percentage = 0;
        let bonusCategory = "لا بونص";
        if (priceWithTax > 0) {
          if (priceWithTax >= premiumPrice && bonus2Enabled) {
            percentage = 2; bonusCategory = "تميز";
          } else if (priceWithTax < premiumPrice && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
          } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
          }
        }

        const bonus = itemTotal * (percentage / 100);

        paidInvoices.push({
          uniqueKey: `${invoice.id}-${item.product_id}-${invoice.created_by}`,
          invoiceId: invoice.id,
          reference: invoice.reference,
          rep: invoice.created_by,
          customer: invoice.customer_name || "—",
          product: setting?.productName || item.product_name,
          productId: item.product_id,
          quantity: actualQuantity,
          returnedQty,
          price: priceWithTax,
          itemTotal,
          category: bonusCategory,
          percentage,
          bonus,
          date: invoice.issue_date,
          isPending: false,
          paymentStatus: "مدفوعة",
        });

        totalSales += itemTotal;
        if (percentage === 1) sales1Percent += itemTotal;
        if (percentage === 2) sales2Percent += itemTotal;
        totalBonus += bonus;

        // Product analysis
        const prodKey = String(item.product_id);
        const existing = productAnalysis.get(prodKey) || {
          productId: item.product_id, name: setting?.productName || item.product_name,
          quantity: 0, totalSales: 0, totalBonus: 0, sellCount: 0, category: bonusCategory,
        };
        existing.quantity += actualQuantity;
        existing.totalSales += itemTotal;
        existing.totalBonus += bonus;
        existing.sellCount += 1;
        productAnalysis.set(prodKey, existing);
      });
    });

    return {
      totalSales, sales1Percent, sales2Percent, totalBonus,
      paidInvoices,
      productAnalysis: Array.from(productAnalysis.values()).sort((a, b) => b.totalSales - a.totalSales),
    };
  }, [invoicesData, settingsData, creditNotesData, paymentsData]);

  // ==================== UNPAID (APPROVED) INVOICES ====================
  const unpaidInvoices = useMemo(() => {
    if (!allInvoicesData?.invoices || !settingsData?.settings) return [];

    const allInvoices = allInvoicesData.invoices;
    const settings = settingsData.settings;
    const paidInvoiceIds = new Set((invoicesData?.invoices || []).map((inv: any) => inv.id));

    const unpaid: InvoiceRow[] = [];
    const processedKeys = new Set<string>();

    allInvoices.forEach((invoice: any) => {
      // Only Approved invoices that are NOT in the paid list
      if (invoice.status !== "Approved" || paidInvoiceIds.has(invoice.id)) return;

      invoice.line_items?.forEach((item: any) => {
        const dedupeKey = `${invoice.id}-${item.product_id}`;
        if (processedKeys.has(dedupeKey)) return;
        processedKeys.add(dedupeKey);

        const setting = settings.find((s: any) => String(s.productId) === String(item.product_id));
        const premiumPrice = setting?.premiumPrice ?? 70;

        const priceWithTax = item.unit_price * (1 + (item.tax_percent || 15) / 100);
        const itemTotal = priceWithTax * item.quantity;

        const bonus1Enabled = setting?.bonus1Enabled !== undefined ? setting.bonus1Enabled : true;
        const bonus2Enabled = setting?.bonus2Enabled !== undefined ? setting.bonus2Enabled : true;

        let percentage = 0;
        let bonusCategory = "لا بونص";
        if (priceWithTax > 0) {
          if (priceWithTax >= premiumPrice && bonus2Enabled) {
            percentage = 2; bonusCategory = "تميز";
          } else if (priceWithTax < premiumPrice && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
          } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
          }
        }

        const bonus = itemTotal * (percentage / 100);

        unpaid.push({
          uniqueKey: `unpaid-${invoice.id}-${item.product_id}-${invoice.created_by}`,
          invoiceId: invoice.id,
          reference: invoice.reference,
          rep: invoice.created_by,
          customer: invoice.customer_name || "—",
          product: setting?.productName || item.product_name,
          productId: item.product_id,
          quantity: item.quantity,
          returnedQty: 0,
          price: priceWithTax,
          itemTotal,
          category: bonusCategory,
          percentage,
          bonus,
          date: invoice.issue_date,
          isPending: true,
          paymentStatus: "آجلة",
        });
      });
    });

    return unpaid;
  }, [allInvoicesData, settingsData, invoicesData]);

  // ==================== RETURNS (CREDIT NOTES) ====================
  const returnRows = useMemo(() => {
    if (!creditNotesData?.creditNotes) return [];

    const creditNotes = creditNotesData.creditNotes;
    const payments = paymentsData?.payments || [];
    const allInvoices = allInvoicesData?.invoices || [];

    // Credit note to invoice map
    const creditNoteToInvoice = new Map<number, number>();
    payments.forEach((payment: any) => {
      payment.allocations?.forEach((allocation: any) => {
        if (allocation.source_type === "CreditNote" && allocation.allocatee_type === "Invoice") {
          creditNoteToInvoice.set(allocation.source_id, allocation.allocatee_id);
        }
      });
    });

    // Also check credit note's own invoice_id field
    creditNotes.forEach((cn: any) => {
      if (cn.invoice_id && !creditNoteToInvoice.has(cn.id)) {
        creditNoteToInvoice.set(cn.id, cn.invoice_id);
      }
    });

    // Invoice reference map
    const invoiceRefMap = new Map<number, { reference: string; created_by: string }>();
    allInvoices.forEach((inv: any) => {
      invoiceRefMap.set(inv.id, { reference: inv.reference, created_by: inv.created_by });
    });
    (invoicesData?.invoices || []).forEach((inv: any) => {
      invoiceRefMap.set(inv.id, { reference: inv.reference, created_by: inv.created_by });
    });

    const rows: ReturnRow[] = [];

    creditNotes.forEach((cn: any) => {
      const invoiceId = creditNoteToInvoice.get(cn.id);
      const invoiceInfo = invoiceId ? invoiceRefMap.get(invoiceId) : null;

      cn.line_items?.forEach((item: any) => {
        rows.push({
          creditNoteId: cn.id,
          creditNoteRef: cn.reference || `CN-${cn.id}`,
          invoiceId: invoiceId || 0,
          invoiceRef: invoiceInfo?.reference || "—",
          product: item.product_name,
          productId: item.product_id,
          quantity: item.quantity,
          unitPrice: (item.unit_price || 0) * (1 + (item.tax_percent || 15) / 100),
          total: (item.unit_price || 0) * (1 + (item.tax_percent || 15) / 100) * (item.quantity || 0),
          date: cn.issue_date,
          rep: invoiceInfo?.created_by || "—",
        });
      });
    });

    return rows;
  }, [creditNotesData, paymentsData, allInvoicesData, invoicesData]);

  // Unique reps
  const uniqueReps = useMemo(() => {
    const allInvoices = [...(bonusData?.paidInvoices || []), ...unpaidInvoices];
    return Array.from(new Set(allInvoices.map((inv) => inv.rep)));
  }, [bonusData, unpaidInvoices]);

  // Filter by rep
  const filterByRep = useCallback((invoices: InvoiceRow[]) => {
    if (selectedRep === "all") return invoices;
    return invoices.filter((inv) => inv.rep === selectedRep);
  }, [selectedRep]);

  const filterReturnsByRep = useCallback((rows: ReturnRow[]) => {
    if (selectedRep === "all") return rows;
    return rows.filter((r) => r.rep === selectedRep);
  }, [selectedRep]);

  // ==================== EXPORT TO EXCEL ====================
  const exportToExcel = async () => {
    if (!bonusData) return;
    const workbook = new ExcelJS.Workbook();

    const styleHeader = (ws: ExcelJS.Worksheet, color = "FF1E40AF") => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 25;
    };

    const addInvoiceSheet = (name: string, invoices: InvoiceRow[], color: string) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = [
        { header: "رقم الفاتورة", key: "reference", width: 15 },
        { header: "المندوب", key: "rep", width: 20 },
        { header: "العميل", key: "customer", width: 25 },
        { header: "المنتج", key: "product", width: 30 },
        { header: "الكمية", key: "quantity", width: 10 },
        { header: "مرتجع", key: "returnedQty", width: 10 },
        { header: "السعر (شامل الضريبة)", key: "price", width: 18 },
        { header: "الإجمالي", key: "total", width: 15 },
        { header: "الفئة", key: "category", width: 12 },
        { header: "النسبة", key: "percentage", width: 10 },
        { header: "البونص", key: "bonus", width: 12 },
        { header: "التاريخ", key: "date", width: 14 },
      ];
      styleHeader(ws, color);
      invoices.forEach((inv) => {
        ws.addRow({
          reference: inv.reference, rep: getRepDisplayName(inv.rep), customer: inv.customer,
          product: inv.product, quantity: inv.quantity, returnedQty: inv.returnedQty || 0,
          price: inv.price.toFixed(2), total: inv.itemTotal.toFixed(2), category: inv.category,
          percentage: `${inv.percentage}%`, bonus: inv.bonus.toFixed(2), date: inv.date,
        });
      });
      const totalRow = ws.addRow({
        reference: "", rep: "", customer: "", product: "الإجمالي",
        quantity: "", returnedQty: "", price: "",
        total: invoices.reduce((s, i) => s + i.itemTotal, 0).toFixed(2),
        category: "", percentage: "",
        bonus: invoices.reduce((s, i) => s + i.bonus, 0).toFixed(2), date: "",
      });
      totalRow.font = { bold: true };
    };

    // Summary sheet first
    const summaryWs = workbook.addWorksheet("ملخص شامل");
    summaryWs.columns = [
      { header: "البيان", key: "label", width: 30 },
      { header: "القيمة", key: "value", width: 25 },
    ];
    styleHeader(summaryWs, "FF1E3A5F");
    const fp = filterByRep(bonusData.paidInvoices);
    const fu = filterByRep(unpaidInvoices);
    const fr = filterReturnsByRep(returnRows);
    summaryWs.addRow({ label: "الفترة", value: `${startDate} إلى ${endDate}` });
    summaryWs.addRow({ label: "المندوب", value: selectedRep === "all" ? "جميع المناديب" : getRepDisplayName(selectedRep) });
    summaryWs.addRow({ label: "", value: "" });
    summaryWs.addRow({ label: "مبيعات مدفوعة", value: fp.reduce((s, i) => s + i.itemTotal, 0).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "بونص مدفوع", value: fp.reduce((s, i) => s + i.bonus, 0).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "مبيعات آجلة", value: fu.reduce((s, i) => s + i.itemTotal, 0).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "بونص آجل", value: fu.reduce((s, i) => s + i.bonus, 0).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "مرتجعات", value: fr.reduce((s, r) => s + (isNaN(r.total) ? 0 : r.total), 0).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "", value: "" });
    summaryWs.addRow({ label: "إجمالي المبيعات (مدفوع + آجل)", value: (fp.reduce((s, i) => s + i.itemTotal, 0) + fu.reduce((s, i) => s + i.itemTotal, 0)).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "إجمالي البونص (مدفوع + آجل)", value: (fp.reduce((s, i) => s + i.bonus, 0) + fu.reduce((s, i) => s + i.bonus, 0)).toFixed(2) + " ر.س" });
    summaryWs.addRow({ label: "عدد الفواتير المدفوعة", value: String(fp.length) });
    summaryWs.addRow({ label: "عدد الفواتير غير المدفوعة", value: String(fu.length) });
    summaryWs.addRow({ label: "عدد المرتجعات", value: String(fr.length) });

    // Target info if rep selected
    if (selectedRep !== "all" && repsData?.reps) {
      const repSetting = repsData.reps.find((r: any) => r.repEmail === selectedRep);
      if (repSetting?.monthlyTarget && repSetting.monthlyTarget > 0) {
        const currentSales = fp.reduce((s, i) => s + i.itemTotal, 0) + fu.reduce((s, i) => s + i.itemTotal, 0);
        const progressPercent = Math.min(100, (currentSales / repSetting.monthlyTarget) * 100);
        summaryWs.addRow({ label: "", value: "" });
        summaryWs.addRow({ label: "التارجت الشهري", value: repSetting.monthlyTarget.toLocaleString() + " ر.س" });
        summaryWs.addRow({ label: "نسبة التحقيق", value: progressPercent.toFixed(1) + "%" });
      }
    }

    // Per-rep breakdown if "all" selected
    if (selectedRep === "all" && uniqueReps.length > 1) {
      const repSummaryWs = workbook.addWorksheet("ملخص المناديب");
      repSummaryWs.columns = [
        { header: "المندوب", key: "rep", width: 25 },
        { header: "مبيعات مدفوعة", key: "paidSales", width: 18 },
        { header: "بونص مدفوع", key: "paidBonus", width: 15 },
        { header: "مبيعات آجلة", key: "unpaidSales", width: 18 },
        { header: "بونص آجل", key: "unpaidBonus", width: 15 },
        { header: "إجمالي البونص", key: "totalBonus", width: 15 },
        { header: "التارجت", key: "target", width: 15 },
        { header: "نسبة التحقيق", key: "progress", width: 12 },
      ];
      styleHeader(repSummaryWs, "FF6D28D9");
      uniqueReps.forEach((rep: string) => {
        const repPaid = bonusData.paidInvoices.filter((i) => i.rep === rep);
        const repUnpaid = unpaidInvoices.filter((i) => i.rep === rep);
        const repSetting = repsData?.reps?.find((r: any) => r.repEmail === rep);
        const target = repSetting?.monthlyTarget || 0;
        const totalSales = repPaid.reduce((s, i) => s + i.itemTotal, 0) + repUnpaid.reduce((s, i) => s + i.itemTotal, 0);
        repSummaryWs.addRow({
          rep: getRepDisplayName(rep),
          paidSales: repPaid.reduce((s, i) => s + i.itemTotal, 0).toFixed(2),
          paidBonus: repPaid.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          unpaidSales: repUnpaid.reduce((s, i) => s + i.itemTotal, 0).toFixed(2),
          unpaidBonus: repUnpaid.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          totalBonus: (repPaid.reduce((s, i) => s + i.bonus, 0) + repUnpaid.reduce((s, i) => s + i.bonus, 0)).toFixed(2),
          target: target > 0 ? target.toLocaleString() : "—",
          progress: target > 0 ? ((totalSales / target) * 100).toFixed(1) + "%" : "—",
        });
      });
    }

    addInvoiceSheet("فواتير مدفوعة", filterByRep(bonusData.paidInvoices), "FF059669");
    addInvoiceSheet("فواتير غير مدفوعة", filterByRep(unpaidInvoices), "FFDC2626");

    // Returns sheet
    const filteredReturns = filterReturnsByRep(returnRows);
    if (filteredReturns.length > 0) {
      const retWs = workbook.addWorksheet("مرتجعات (إشعارات دائنة)");
      retWs.columns = [
        { header: "رقم الإشعار", key: "cnRef", width: 15 },
        { header: "رقم الفاتورة", key: "invRef", width: 15 },
        { header: "المندوب", key: "rep", width: 20 },
        { header: "المنتج", key: "product", width: 30 },
        { header: "الكمية المرتجعة", key: "quantity", width: 15 },
        { header: "السعر", key: "price", width: 15 },
        { header: "الإجمالي", key: "total", width: 15 },
        { header: "التاريخ", key: "date", width: 14 },
      ];
      styleHeader(retWs, "FFDC2626");
      filteredReturns.forEach((r) => {
        retWs.addRow({
          cnRef: r.creditNoteRef, invRef: r.invoiceRef, rep: getRepDisplayName(r.rep),
          product: r.product, quantity: r.quantity, price: r.unitPrice.toFixed(2),
          total: r.total.toFixed(2), date: r.date,
        });
      });
    }

    // Products sheet
    const productSheet = workbook.addWorksheet("تقرير المنتجات");
    productSheet.columns = [
      { header: "المنتج", key: "name", width: 35 },
      { header: "إجمالي الكمية", key: "quantity", width: 15 },
      { header: "إجمالي المبيعات", key: "totalSales", width: 20 },
      { header: "إجمالي البونص", key: "totalBonus", width: 15 },
      { header: "عدد مرات البيع", key: "sellCount", width: 15 },
      { header: "الفئة", key: "category", width: 12 },
    ];
    styleHeader(productSheet, "FF7C3AED");
    bonusData.productAnalysis.forEach((prod) => {
      productSheet.addRow({
        name: prod.name, quantity: prod.quantity,
        totalSales: prod.totalSales.toFixed(2), totalBonus: prod.totalBonus.toFixed(2),
        sellCount: prod.sellCount, category: prod.category,
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `تقرير-البونص-${startDate}-${endDate}${selectedRep !== "all" ? `-${getRepDisplayName(selectedRep)}` : ""}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير التقرير بنجاح");
  };

  // Refresh all data
  const refreshData = async () => {
    try {
      await clearCacheMutation.mutateAsync();
      await Promise.all([refetchAllInvoices(), refetchCreditNotes(), refetchPayments(), refetchSettings()]);
      toast.success("تم تحديث البيانات بنجاح");
    } catch (error) {
      toast.error("فشل تحديث البيانات");
    }
  };

  // ==================== AUTH CHECK ====================
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  // ==================== FILTERED DATA ====================
  const filteredPaid = bonusData ? filterByRep(bonusData.paidInvoices) : [];
  const filteredUnpaid = filterByRep(unpaidInvoices);
  const filteredReturns = filterReturnsByRep(returnRows);

  const isLoading = invoicesLoading || allInvoicesLoading;

  const paidTotal = filteredPaid.reduce((s, i) => s + i.itemTotal, 0);
  const paidBonus = filteredPaid.reduce((s, i) => s + i.bonus, 0);
  const unpaidTotal = filteredUnpaid.reduce((s, i) => s + i.itemTotal, 0);
  const unpaidBonus = filteredUnpaid.reduce((s, i) => s + i.bonus, 0);
  const returnsTotal = filteredReturns.reduce((s, r) => s + (isNaN(r.total) ? 0 : r.total), 0);

  // ==================== INVOICE TABLE ====================
  const InvoiceTable = ({ invoices, headerColor = "bg-gray-50" }: {
    invoices: InvoiceRow[];
    headerColor?: string;
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`border-b ${headerColor}`}>
            <th className="text-right p-2 text-xs">رقم الفاتورة</th>
            <th className="text-right p-2 text-xs">المندوب</th>
            <th className="text-right p-2 text-xs">العميل</th>
            <th className="text-right p-2 text-xs">المنتج</th>
            <th className="text-right p-2 text-xs">الكمية</th>
            <th className="text-right p-2 text-xs">مرتجع</th>
            <th className="text-right p-2 text-xs">السعر</th>
            <th className="text-right p-2 text-xs">الإجمالي</th>
            <th className="text-right p-2 text-xs">الفئة</th>
            <th className="text-right p-2 text-xs">النسبة</th>
            <th className="text-right p-2 text-xs">البونص</th>
            <th className="text-right p-2 text-xs">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <tr><td colSpan={12} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>
          ) : invoices.map((inv) => (
            <tr key={inv.uniqueKey} className={`border-b hover:bg-gray-50/80 transition-colors ${inv.isPending ? 'bg-yellow-50/50' : ''}`}>
              <td className="p-2 font-mono text-xs">{inv.reference}</td>
              <td className="p-2 text-xs">{getRepDisplayName(inv.rep)}</td>
              <td className="p-2 text-xs">{inv.customer}</td>
              <td className="p-2 text-xs">{inv.product}</td>
              <td className="p-2 text-xs">{inv.quantity}</td>
              <td className="p-2 text-xs text-red-500">{inv.returnedQty > 0 ? `-${inv.returnedQty}` : "—"}</td>
              <td className="p-2 text-xs">{inv.price.toFixed(2)}</td>
              <td className="p-2 text-xs font-medium">{inv.itemTotal.toFixed(2)}</td>
              <td className="p-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${inv.category === "تميز" ? "bg-green-100 text-green-700" : inv.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                  {inv.category}
                </span>
              </td>
              <td className="p-2 text-xs">{inv.percentage}%</td>
              <td className="p-2 text-xs font-semibold text-blue-600">{inv.bonus.toFixed(2)}</td>
              <td className="p-2 text-[10px] text-gray-500">{inv.date}</td>
            </tr>
          ))}
        </tbody>
        {invoices.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-bold text-xs">
              <td className="p-2" colSpan={6}></td>
              <td className="p-2"></td>
              <td className="p-2">{invoices.reduce((s, i) => s + i.itemTotal, 0).toFixed(2)}</td>
              <td className="p-2" colSpan={2}></td>
              <td className="p-2 text-blue-600">{invoices.reduce((s, i) => s + i.bonus, 0).toFixed(2)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  // ==================== RETURNS TABLE ====================
  const ReturnsTable = ({ rows }: { rows: ReturnRow[] }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-red-50">
            <th className="text-right p-2 text-xs">رقم الإشعار الدائن</th>
            <th className="text-right p-2 text-xs">رقم الفاتورة</th>
            <th className="text-right p-2 text-xs">المندوب</th>
            <th className="text-right p-2 text-xs">المنتج</th>
            <th className="text-right p-2 text-xs">الكمية المرتجعة</th>
            <th className="text-right p-2 text-xs">السعر</th>
            <th className="text-right p-2 text-xs">الإجمالي</th>
            <th className="text-right p-2 text-xs">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={8} className="text-center py-8 text-gray-400">لا توجد مرتجعات</td></tr>
          ) : rows.map((r, idx) => (
            <tr key={`${r.creditNoteId}-${r.productId}-${idx}`} className="border-b hover:bg-red-50/50 transition-colors">
              <td className="p-2 font-mono text-xs text-red-600">{r.creditNoteRef}</td>
              <td className="p-2 font-mono text-xs">{r.invoiceRef}</td>
              <td className="p-2 text-xs">{getRepDisplayName(r.rep)}</td>
              <td className="p-2 text-xs">{r.product}</td>
              <td className="p-2 text-xs text-red-600 font-medium">{r.quantity}</td>
              <td className="p-2 text-xs">{r.unitPrice.toFixed(2)}</td>
              <td className="p-2 text-xs font-medium text-red-600">{r.total.toFixed(2)}</td>
              <td className="p-2 text-[10px] text-gray-500">{r.date}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-red-100 font-bold text-xs">
              <td className="p-2" colSpan={4}></td>
              <td className="p-2 text-red-700">{rows.reduce((s, r) => s + r.quantity, 0)}</td>
              <td className="p-2"></td>
              <td className="p-2 text-red-700">{rows.reduce((s, r) => s + r.total, 0).toFixed(2)}</td>
              <td className="p-2"></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            {/* Logo + Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">نظام حساب العمولات</h1>
                <p className="text-[10px] text-gray-500">عرض الفواتير والبونص (حسب تاريخ الإصدار)</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Link href="/processing">
                <Button size="sm" className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-md">
                  <FileDown className="h-3.5 w-3.5" />
                  معالجة وتصدير
                </Button>
              </Link>

              <Link href="/delivery-log">
                <Button variant="outline" size="sm" className="gap-1 border-blue-300 text-blue-700 hover:bg-blue-50">
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">سجل التسليمات</span>
                </Button>
              </Link>

              <Link href="/saved-reports">
                <Button variant="outline" size="sm" className="gap-1 border-purple-300 text-purple-700 hover:bg-purple-50">
                  <Archive className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">التقارير</span>
                </Button>
              </Link>

              <Button onClick={refreshData} disabled={clearCacheMutation.isPending} variant="outline" size="sm" className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">تحديث</span>
              </Button>

              <Button onClick={exportToExcel} disabled={!bonusData} variant="outline" size="sm" className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">تصدير شامل</span>
              </Button>

              <Link href="/settings">
                <Button variant="ghost" size="sm">
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* ===== DATE FILTER ===== */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs text-gray-600 mb-1 block">من تاريخ الإصدار</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <Label className="text-xs text-gray-600 mb-1 block">إلى تاريخ الإصدار</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs text-gray-600 mb-1 block">المندوب</Label>
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-sm"
                >
                  <option value="all">جميع المناديب</option>
                  {uniqueReps.map((rep: string) => (
                    <option key={rep} value={rep}>{getRepDisplayName(rep)}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== TARGET PROGRESS ===== */}
        {selectedRep !== "all" && repsData?.reps && (() => {
          const repSetting = repsData.reps.find((r: any) => r.repEmail === selectedRep);
          const monthlyTarget = repSetting?.monthlyTarget || 0;
          if (monthlyTarget <= 0) return null;
          const currentSales = paidTotal + unpaidTotal;
          const progressPercent = Math.min(100, (currentSales / monthlyTarget) * 100);
          return (
            <Card className="mb-4 border-indigo-200 bg-gradient-to-l from-indigo-50 to-white">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-gray-800">التارجت الشهري - {getRepDisplayName(selectedRep)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{currentSales.toLocaleString("ar-SA", { minimumFractionDigits: 0 })} / {monthlyTarget.toLocaleString("ar-SA")} ر.س</span>
                    <span className={`text-sm font-bold ${progressPercent >= 100 ? 'text-green-600' : progressPercent >= 70 ? 'text-indigo-600' : 'text-orange-600'}`}>
                      {progressPercent.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressPercent >= 100 ? 'bg-green-500' : progressPercent >= 70 ? 'bg-indigo-500' : 'bg-orange-500'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {progressPercent >= 100 && (
                  <div className="flex items-center gap-1 mt-2 text-green-600">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium">تم تحقيق التارجت! تجاوز بمبلغ {(currentSales - monthlyTarget).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* ===== QUICK STATS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-blue-600 font-medium">مبيعات مدفوعة</div>
              <div className="text-sm font-bold text-blue-800">{paidTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-green-600 font-medium">بونص مدفوع</div>
              <div className="text-sm font-bold text-green-800">{paidBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-yellow-600 font-medium">مبيعات آجلة</div>
              <div className="text-sm font-bold text-yellow-800">{unpaidTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-orange-600 font-medium">بونص آجل</div>
              <div className="text-sm font-bold text-orange-800">{unpaidBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-red-600 font-medium">مرتجعات</div>
              <div className="text-sm font-bold text-red-800">{returnsTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
            </CardContent>
          </Card>
        </div>

        {/* ===== LOADING ===== */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل البيانات...</p>
          </div>
        )}

        {/* ===== MAIN TABS ===== */}
        {!isLoading && (
          <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-3">
              <TabsTrigger value="paid" className="gap-1.5 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                مدفوعة ({filteredPaid.length})
              </TabsTrigger>
              <TabsTrigger value="unpaid" className="gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5" />
                غير مدفوعة ({filteredUnpaid.length})
              </TabsTrigger>
              <TabsTrigger value="returns" className="gap-1.5 text-xs">
                <Undo2 className="w-3.5 h-3.5" />
                مرتجعات ({filteredReturns.length})
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5 text-xs">
                <Package className="w-3.5 h-3.5" />
                المنتجات
              </TabsTrigger>
            </TabsList>

            {/* مدفوعة */}
            <TabsContent value="paid">
              <Card>
                <CardContent className="p-3">
                  <InvoiceTable invoices={filteredPaid} headerColor="bg-green-50" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* غير مدفوعة */}
            <TabsContent value="unpaid">
              <Card>
                <CardContent className="p-3">
                  {filteredUnpaid.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                      <p className="text-sm font-medium">جميع الفواتير مدفوعة</p>
                      <p className="text-xs">لا توجد فواتير آجلة (موافق عليها) في هذه الفترة</p>
                    </div>
                  ) : (
                    <InvoiceTable invoices={filteredUnpaid} headerColor="bg-yellow-50" />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* مرتجعات */}
            <TabsContent value="returns">
              <Card>
                <CardContent className="p-3">
                  {filteredReturns.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Undo2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">لا توجد مرتجعات</p>
                      <p className="text-xs">لا توجد إشعارات دائنة في هذه الفترة</p>
                    </div>
                  ) : (
                    <ReturnsTable rows={filteredReturns} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* المنتجات */}
            <TabsContent value="products">
              <Card>
                <CardContent className="p-3">
                  {bonusData && bonusData.productAnalysis.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-purple-50">
                            <th className="text-right p-2 text-xs">المنتج</th>
                            <th className="text-right p-2 text-xs">إجمالي الكمية</th>
                            <th className="text-right p-2 text-xs">إجمالي المبيعات</th>
                            <th className="text-right p-2 text-xs">إجمالي البونص</th>
                            <th className="text-right p-2 text-xs">عدد مرات البيع</th>
                            <th className="text-right p-2 text-xs">الفئة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bonusData.productAnalysis.map((prod) => (
                            <tr key={prod.productId} className="border-b hover:bg-gray-50/80 transition-colors">
                              <td className="p-2 text-xs font-medium">{prod.name}</td>
                              <td className="p-2 text-xs">{prod.quantity}</td>
                              <td className="p-2 text-xs">{prod.totalSales.toFixed(2)}</td>
                              <td className="p-2 text-xs font-semibold text-blue-600">{prod.totalBonus.toFixed(2)}</td>
                              <td className="p-2 text-xs">{prod.sellCount}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${prod.category === "تميز" ? "bg-green-100 text-green-700" : prod.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                  {prod.category}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">لا توجد بيانات منتجات</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
