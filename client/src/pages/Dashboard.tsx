import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  Settings, RefreshCw, FileSpreadsheet, CheckCircle2,
  Clock, Wallet, BarChart3, Package, Layers,
  ArrowLeft, ArrowRight, Save, CreditCard, FileCheck
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

// ==================== WIZARD STEPS ====================
const STEPS = [
  { id: 1, title: "اختيار الفترة", icon: Clock, description: "حدد الفترة الزمنية والمندوب" },
  { id: 2, title: "مراجعة الفواتير", icon: FileCheck, description: "راجع الفواتير المدفوعة وغير المدفوعة" },
  { id: 3, title: "حفظ وتسليم", icon: CreditCard, description: "حفظ الفواتير المحددة وتسليم البونص" },
];

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  // Wizard step
  const [currentStep, setCurrentStep] = useState(1);

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
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isDelivering, setIsDelivering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedInvoiceKeys, setSavedInvoiceKeys] = useState<Set<string>>(new Set());
  const [invoiceSubTab, setInvoiceSubTab] = useState("paid");
  const [mainTab, setMainTab] = useState("wizard");

  // Validate dates
  const validDates = useMemo(() => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    return dateRegex.test(startDate) && dateRegex.test(endDate);
  }, [startDate, endDate]);

  // Fetch data
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } =
    trpc.qoyod.fetchInvoicesByPaymentDate.useQuery(
      { startDate, endDate },
      { enabled: validDates && currentStep >= 2 }
    );
  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const { data: creditNotesData, refetch: refetchCreditNotes } =
    trpc.qoyod.fetchCreditNotes.useQuery({ startDate, endDate }, { enabled: validDates && currentStep >= 2 });
  const { data: paymentsData, refetch: refetchPayments } =
    trpc.qoyod.fetchInvoicePayments.useQuery({ startDate, endDate }, { enabled: validDates && currentStep >= 2 });
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();

  // Fetch delivered bonuses from DB
  const { data: deliveredBonusData, refetch: refetchDelivered } =
    trpc.bonusPayments.list.useQuery({
      startDate,
      endDate,
      repEmail: undefined,
      status: "paid",
    }, { enabled: validDates });

  // Mutations
  const recordBonusMutation = trpc.bonusPayments.record.useMutation();
  const markAsPaidMutation = trpc.bonusPayments.markAsPaid.useMutation();

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
    const deliveredList = deliveredBonusData?.payments || [];

    // Set of delivered invoice keys (invoiceId-repEmail) for THIS date range
    const deliveredInvoiceKeys = new Set<string>();
    deliveredList.forEach((bp: any) => {
      deliveredInvoiceKeys.add(`${bp.invoiceId}-${bp.repEmail}`);
    });

    // Payment dates map
    const paymentDates = new Map<number, string>();
    payments.forEach((payment: any) => {
      if (payment.allocations && Array.isArray(payment.allocations)) {
        payment.allocations.forEach((allocation: any) => {
          if (allocation.allocatee_type === "Invoice" && allocation.allocatee_id && payment.date) {
            const existing = paymentDates.get(allocation.allocatee_id);
            if (!existing || payment.date > existing) {
              paymentDates.set(allocation.allocatee_id, payment.date);
            }
          }
        });
      }
    });

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

    // Parse date range for filtering
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    let totalSales = 0;
    let sales1Percent = 0;
    let sales2Percent = 0;
    let totalBonus = 0;
    let deliveredBonus = 0;
    let undeliveredBonus = 0;

    const paidInvoices: InvoiceRow[] = [];
    const unpaidInvoices: InvoiceRow[] = [];
    const deliveredInvoices: InvoiceRow[] = [];

    // Product analysis
    const productAnalysis = new Map<string, {
      productId: number;
      name: string;
      quantity: number;
      totalSales: number;
      totalBonus: number;
      sellCount: number;
      category: string;
    }>();

    // Track processed invoice-product combos to prevent duplicates
    const processedKeys = new Set<string>();

    invoices.forEach((invoice: any) => {
      const paymentDate = paymentDates.get(invoice.id);

      // Check if invoice has payment in date range
      let hasPaidInRange = false;
      if (paymentDate) {
        const pd = new Date(paymentDate);
        hasPaidInRange = pd >= rangeStart && pd <= rangeEnd;
      }

      // isPending = Approved but no payment in this range
      const isPending = !hasPaidInRange && (invoice.status === "Approved");
      // isPaid = has payment in this range
      const isPaid = hasPaidInRange;

      if (!isPaid && !isPending) return;

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
            percentage = 2;
            bonusCategory = "تميز";
          } else if (priceWithTax < premiumPrice && bonus1Enabled) {
            percentage = 1;
            bonusCategory = "أساسي";
          } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
            percentage = 1;
            bonusCategory = "أساسي";
          }
        }

        const bonus = itemTotal * (percentage / 100);
        const isDeliveredKey = `${invoice.id}-${invoice.created_by}`;
        const isDelivered = deliveredInvoiceKeys.has(isDeliveredKey);

        const invoiceRow: InvoiceRow = {
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
          date: paymentDate || invoice.issue_date,
          isPending,
          paymentStatus: isPaid ? "مدفوعة" : "آجلة",
        };

        // Track sales
        totalSales += itemTotal;
        if (percentage === 1) sales1Percent += itemTotal;
        if (percentage === 2) sales2Percent += itemTotal;
        totalBonus += bonus;

        // Product analysis
        const prodKey = String(item.product_id);
        const existing = productAnalysis.get(prodKey) || {
          productId: item.product_id,
          name: setting?.productName || item.product_name,
          quantity: 0,
          totalSales: 0,
          totalBonus: 0,
          sellCount: 0,
          category: bonusCategory,
        };
        existing.quantity += actualQuantity;
        existing.totalSales += itemTotal;
        existing.totalBonus += bonus;
        existing.sellCount += 1;
        productAnalysis.set(prodKey, existing);

        // Separate: delivered vs paid-undelivered vs unpaid
        if (isDelivered) {
          deliveredBonus += bonus;
          deliveredInvoices.push(invoiceRow);
        } else if (isPaid) {
          undeliveredBonus += bonus;
          paidInvoices.push(invoiceRow);
        } else {
          // unpaid (آجلة)
          undeliveredBonus += bonus;
          unpaidInvoices.push(invoiceRow);
        }
      });
    });

    // Category analysis
    const categoryAnalysis = new Map<string, {
      name: string;
      totalSales: number;
      totalQuantity: number;
      productCount: number;
    }>();
    productAnalysis.forEach((prod) => {
      const catName = prod.category || "غير مصنف";
      const existing = categoryAnalysis.get(catName) || {
        name: catName,
        totalSales: 0,
        totalQuantity: 0,
        productCount: 0,
      };
      existing.totalSales += prod.totalSales;
      existing.totalQuantity += prod.quantity;
      existing.productCount += 1;
      categoryAnalysis.set(catName, existing);
    });

    return {
      totalSales,
      sales1Percent,
      sales2Percent,
      totalBonus,
      deliveredBonus,
      undeliveredBonus,
      paidInvoices,
      unpaidInvoices,
      deliveredInvoices,
      productAnalysis: Array.from(productAnalysis.values()).sort((a, b) => b.totalSales - a.totalSales),
      categoryAnalysis: Array.from(categoryAnalysis.values()).sort((a, b) => b.totalSales - a.totalSales),
    };
  }, [invoicesData, settingsData, creditNotesData, paymentsData, deliveredBonusData, startDate, endDate]);

  // Unique reps
  const uniqueReps = useMemo(() => {
    if (!bonusData) return [];
    const allInvoices = [...bonusData.paidInvoices, ...bonusData.unpaidInvoices, ...bonusData.deliveredInvoices];
    return Array.from(new Set(allInvoices.map((inv) => inv.rep)));
  }, [bonusData]);

  // Filter by rep
  const filterByRep = useCallback((invoices: InvoiceRow[]) => {
    if (selectedRep === "all") return invoices;
    return invoices.filter((inv) => inv.rep === selectedRep);
  }, [selectedRep]);

  // Toggle invoice selection
  const toggleInvoice = (uniqueKey: string) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(uniqueKey)) next.delete(uniqueKey);
      else next.add(uniqueKey);
      return next;
    });
  };

  // Select all in current sub-tab
  const selectAllInTab = (invoices: InvoiceRow[]) => {
    const allKeys = invoices.map((inv) => inv.uniqueKey);
    const allSelected = allKeys.every(key => selectedInvoices.has(key));
    if (allSelected) {
      setSelectedInvoices(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.delete(key));
        return next;
      });
    } else {
      setSelectedInvoices(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.add(key));
        return next;
      });
    }
  };

  // Save selected invoices to DB (record them as unpaid bonus)
  const saveSelectedInvoices = async () => {
    if (!bonusData || selectedInvoices.size === 0) return;
    setIsSaving(true);
    try {
      const allUndelivered = [...bonusData.paidInvoices, ...bonusData.unpaidInvoices];
      const selectedItems = allUndelivered.filter((inv) => selectedInvoices.has(inv.uniqueKey));

      // Group by invoiceId-rep
      const invoiceGroups = new Map<string, InvoiceRow[]>();
      selectedItems.forEach((inv) => {
        const groupKey = `${inv.invoiceId}-${inv.rep}`;
        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey)!.push(inv);
      });

      // Record each invoice group
      for (const [, items] of Array.from(invoiceGroups.entries())) {
        const totalBonus = items.reduce((sum, inv) => sum + inv.bonus, 0);
        const totalAmount = items.reduce((sum, inv) => sum + inv.itemTotal, 0);
        const firstItem = items[0];
        const avgPercentage = Math.round(items.reduce((sum, inv) => sum + inv.percentage, 0) / items.length);

        await recordBonusMutation.mutateAsync({
          invoiceId: firstItem.invoiceId,
          invoiceReference: firstItem.reference,
          repEmail: firstItem.rep,
          bonusAmount: Math.round(totalBonus * 100),
          bonusPercentage: avgPercentage,
          invoiceAmount: Math.round(totalAmount * 100),
          invoiceDate: firstItem.date,
          paymentDate: firstItem.date,
          notes: `حفظ بونص ${items.length} منتج - ${firstItem.customer} - ${firstItem.paymentStatus}`,
        });
      }

      // Track saved keys locally
      setSavedInvoiceKeys(prev => {
        const next = new Set(prev);
        selectedInvoices.forEach(key => next.add(key));
        return next;
      });

      toast.success(`تم حفظ ${invoiceGroups.size} فاتورة بنجاح - يمكنك الآن تسليم البونص`);
      setCurrentStep(3);
    } catch (error) {
      console.error("Error saving invoices:", error);
      toast.error("فشل حفظ الفواتير");
    } finally {
      setIsSaving(false);
    }
  };

  // Deliver bonus (mark as paid)
  const deliverBonus = async () => {
    if (!bonusData || savedInvoiceKeys.size === 0) return;
    setIsDelivering(true);
    try {
      const allUndelivered = [...bonusData.paidInvoices, ...bonusData.unpaidInvoices];
      const savedItems = allUndelivered.filter((inv) => savedInvoiceKeys.has(inv.uniqueKey));

      // Group by invoiceId-rep
      const invoiceGroups = new Map<string, InvoiceRow[]>();
      savedItems.forEach((inv) => {
        const groupKey = `${inv.invoiceId}-${inv.rep}`;
        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey)!.push(inv);
      });

      // Mark all as paid
      const invoiceItems = Array.from(invoiceGroups.entries()).map(([key]) => ({
        invoiceId: parseInt(key.split("-")[0]),
        repEmail: key.split("-").slice(1).join("-"),
      }));
      if (invoiceItems.length > 0) {
        await markAsPaidMutation.mutateAsync(invoiceItems);
      }

      setSelectedInvoices(new Set());
      setSavedInvoiceKeys(new Set());
      await refetchDelivered();
      toast.success(`تم تسليم البونص لـ ${invoiceGroups.size} فاتورة بنجاح`);
      setCurrentStep(1);
      setMainTab("delivered");
    } catch (error) {
      console.error("Error delivering bonus:", error);
      toast.error("فشل تسليم البونص");
    } finally {
      setIsDelivering(false);
    }
  };

  // Selected bonus total
  const selectedBonusTotal = useMemo(() => {
    if (!bonusData) return 0;
    const allUndelivered = [...bonusData.paidInvoices, ...bonusData.unpaidInvoices];
    return allUndelivered
      .filter((inv) => selectedInvoices.has(inv.uniqueKey))
      .reduce((sum, inv) => sum + inv.bonus, 0);
  }, [bonusData, selectedInvoices]);

  // Saved bonus total
  const savedBonusTotal = useMemo(() => {
    if (!bonusData) return 0;
    const allUndelivered = [...bonusData.paidInvoices, ...bonusData.unpaidInvoices];
    return allUndelivered
      .filter((inv) => savedInvoiceKeys.has(inv.uniqueKey))
      .reduce((sum, inv) => sum + inv.bonus, 0);
  }, [bonusData, savedInvoiceKeys]);

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

    const addTotalRow = (ws: ExcelJS.Worksheet, data: Record<string, any>, color = "FFDBEAFE") => {
      const row = ws.addRow(data);
      row.font = { bold: true, size: 11 };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      return row;
    };

    // ===== ورقة 1: ملخص البونص =====
    const summarySheet = workbook.addWorksheet("ملخص البونص");
    summarySheet.columns = [
      { header: "البيان", key: "label", width: 35 },
      { header: "القيمة", key: "value", width: 25 },
    ];
    styleHeader(summarySheet);
    summarySheet.addRow({ label: "الفترة", value: `${startDate} إلى ${endDate}` });
    summarySheet.addRow({ label: "إجمالي المبيعات", value: bonusData.totalSales.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "مبيعات 1% (أساسي)", value: bonusData.sales1Percent.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "مبيعات 2% (تميز)", value: bonusData.sales2Percent.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "إجمالي البونص المستحق", value: bonusData.totalBonus.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "البونص المسلم", value: bonusData.deliveredBonus.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "البونص غير المسلم", value: bonusData.undeliveredBonus.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "عدد الفواتير المدفوعة (غير مسلم)", value: bonusData.paidInvoices.length });
    summarySheet.addRow({ label: "عدد الفواتير غير المدفوعة", value: bonusData.unpaidInvoices.length });
    summarySheet.addRow({ label: "عدد الفواتير المسلمة", value: bonusData.deliveredInvoices.length });

    // ===== ورقة 2: فواتير مدفوعة (غير مسلم) =====
    const paidSheet = workbook.addWorksheet("مدفوعة - غير مسلم");
    paidSheet.columns = [
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
      { header: "تاريخ الدفع", key: "date", width: 14 },
    ];
    styleHeader(paidSheet, "FF059669");
    filterByRep(bonusData.paidInvoices).forEach((inv) => {
      paidSheet.addRow({
        reference: inv.reference, rep: getRepDisplayName(inv.rep), customer: inv.customer,
        product: inv.product, quantity: inv.quantity, returnedQty: inv.returnedQty || 0,
        price: inv.price.toFixed(2), total: inv.itemTotal.toFixed(2), category: inv.category,
        percentage: `${inv.percentage}%`, bonus: inv.bonus.toFixed(2), date: inv.date,
      });
    });
    const paidTotalSales = filterByRep(bonusData.paidInvoices).reduce((s, i) => s + i.itemTotal, 0);
    const paidTotalBonus = filterByRep(bonusData.paidInvoices).reduce((s, i) => s + i.bonus, 0);
    addTotalRow(paidSheet, {
      reference: "", rep: "", customer: "", product: "الإجمالي",
      quantity: "", returnedQty: "", price: "",
      total: paidTotalSales.toFixed(2), category: "", percentage: "",
      bonus: paidTotalBonus.toFixed(2), date: "",
    }, "FFD1FAE5");

    // ===== ورقة 3: فواتير غير مدفوعة =====
    const unpaidSheet = workbook.addWorksheet("غير مدفوعة");
    unpaidSheet.columns = [
      { header: "رقم الفاتورة", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "العميل", key: "customer", width: 25 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "السعر (شامل الضريبة)", key: "price", width: 18 },
      { header: "الإجمالي", key: "total", width: 15 },
      { header: "الفئة", key: "category", width: 12 },
      { header: "النسبة", key: "percentage", width: 10 },
      { header: "البونص", key: "bonus", width: 12 },
      { header: "التاريخ", key: "date", width: 14 },
    ];
    styleHeader(unpaidSheet, "FFDC2626");
    filterByRep(bonusData.unpaidInvoices).forEach((inv) => {
      unpaidSheet.addRow({
        reference: inv.reference, rep: getRepDisplayName(inv.rep), customer: inv.customer,
        product: inv.product, quantity: inv.quantity,
        price: inv.price.toFixed(2), total: inv.itemTotal.toFixed(2), category: inv.category,
        percentage: `${inv.percentage}%`, bonus: inv.bonus.toFixed(2), date: inv.date,
      });
    });

    // ===== ورقة 4: بونص مسلم =====
    const deliveredSheet = workbook.addWorksheet("بونص مسلم");
    deliveredSheet.columns = [
      { header: "رقم الفاتورة", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "العميل", key: "customer", width: 25 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "السعر (شامل الضريبة)", key: "price", width: 18 },
      { header: "الإجمالي", key: "total", width: 15 },
      { header: "الفئة", key: "category", width: 12 },
      { header: "النسبة", key: "percentage", width: 10 },
      { header: "البونص", key: "bonus", width: 12 },
      { header: "تاريخ الدفع", key: "date", width: 14 },
    ];
    styleHeader(deliveredSheet, "FF7C3AED");
    filterByRep(bonusData.deliveredInvoices).forEach((inv) => {
      deliveredSheet.addRow({
        reference: inv.reference, rep: getRepDisplayName(inv.rep), customer: inv.customer,
        product: inv.product, quantity: inv.quantity,
        price: inv.price.toFixed(2), total: inv.itemTotal.toFixed(2), category: inv.category,
        percentage: `${inv.percentage}%`, bonus: inv.bonus.toFixed(2), date: inv.date,
      });
    });

    // ===== ورقة 5: تقرير المنتجات =====
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

    // ===== ورقة 6: تقرير الأصناف =====
    const categorySheet = workbook.addWorksheet("تقرير الأصناف");
    categorySheet.columns = [
      { header: "الصنف", key: "name", width: 20 },
      { header: "إجمالي المبيعات", key: "totalSales", width: 20 },
      { header: "إجمالي الكمية", key: "totalQuantity", width: 15 },
      { header: "عدد المنتجات", key: "productCount", width: 15 },
    ];
    styleHeader(categorySheet, "FF0891B2");
    bonusData.categoryAnalysis.forEach((cat) => {
      categorySheet.addRow({
        name: cat.name, totalSales: cat.totalSales.toFixed(2),
        totalQuantity: cat.totalQuantity, productCount: cat.productCount,
      });
    });

    // Generate file
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
      await Promise.all([refetchInvoices(), refetchCreditNotes(), refetchPayments(), refetchSettings(), refetchDelivered()]);
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
  const filteredUnpaid = bonusData ? filterByRep(bonusData.unpaidInvoices) : [];
  const filteredDelivered = bonusData ? filterByRep(bonusData.deliveredInvoices) : [];

  const filteredStats = bonusData ? {
    totalSales: [...filteredPaid, ...filteredUnpaid, ...filteredDelivered].reduce((sum, inv) => sum + inv.itemTotal, 0),
    sales1: [...filteredPaid, ...filteredUnpaid, ...filteredDelivered].filter((inv) => inv.percentage === 1).reduce((sum, inv) => sum + inv.itemTotal, 0),
    sales2: [...filteredPaid, ...filteredUnpaid, ...filteredDelivered].filter((inv) => inv.percentage === 2).reduce((sum, inv) => sum + inv.itemTotal, 0),
    totalBonus: [...filteredPaid, ...filteredUnpaid, ...filteredDelivered].reduce((sum, inv) => sum + inv.bonus, 0),
    deliveredBonus: filteredDelivered.reduce((sum, inv) => sum + inv.bonus, 0),
    undeliveredBonus: [...filteredPaid, ...filteredUnpaid].reduce((sum, inv) => sum + inv.bonus, 0),
    paidBonus: filteredPaid.reduce((sum, inv) => sum + inv.bonus, 0),
    unpaidBonus: filteredUnpaid.reduce((sum, inv) => sum + inv.bonus, 0),
  } : null;

  // ==================== INVOICE TABLE COMPONENT ====================
  const InvoiceTable = ({ invoices, showCheckbox = false, headerColor = "bg-gray-50", showReturn = false, showPaymentStatus = false }: {
    invoices: InvoiceRow[];
    showCheckbox?: boolean;
    headerColor?: string;
    showReturn?: boolean;
    showPaymentStatus?: boolean;
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={`border-b ${headerColor}`}>
            {showCheckbox && (
              <th className="p-2 w-10">
                <Checkbox
                  checked={invoices.length > 0 && invoices.every((inv) => selectedInvoices.has(inv.uniqueKey))}
                  onCheckedChange={() => selectAllInTab(invoices)}
                />
              </th>
            )}
            <th className="text-right p-2">رقم الفاتورة</th>
            <th className="text-right p-2">المندوب</th>
            <th className="text-right p-2">العميل</th>
            <th className="text-right p-2">المنتج</th>
            <th className="text-right p-2">الكمية</th>
            {showReturn && <th className="text-right p-2">مرتجع</th>}
            <th className="text-right p-2">السعر</th>
            <th className="text-right p-2">الإجمالي</th>
            <th className="text-right p-2">الفئة</th>
            <th className="text-right p-2">النسبة</th>
            <th className="text-right p-2">البونص</th>
            {showPaymentStatus && <th className="text-right p-2">الحالة</th>}
            <th className="text-right p-2">التاريخ</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.uniqueKey}
              className={`border-b hover:bg-gray-50 ${showCheckbox ? 'cursor-pointer' : ''} ${showCheckbox && selectedInvoices.has(inv.uniqueKey) ? 'bg-blue-50' : ''} ${savedInvoiceKeys.has(inv.uniqueKey) ? 'bg-green-50' : ''}`}
              onClick={showCheckbox ? () => toggleInvoice(inv.uniqueKey) : undefined}
            >
              {showCheckbox && (
                <td className="p-2" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedInvoices.has(inv.uniqueKey)}
                    onCheckedChange={() => toggleInvoice(inv.uniqueKey)}
                  />
                </td>
              )}
              <td className="p-2 font-mono text-xs">{inv.reference}</td>
              <td className="p-2">{getRepDisplayName(inv.rep)}</td>
              <td className="p-2 text-xs">{inv.customer}</td>
              <td className="p-2">{inv.product}</td>
              <td className="p-2">{inv.quantity}</td>
              {showReturn && <td className="p-2 text-red-500">{inv.returnedQty > 0 ? `-${inv.returnedQty}` : "—"}</td>}
              <td className="p-2">{inv.price.toFixed(2)}</td>
              <td className="p-2 font-medium">{inv.itemTotal.toFixed(2)}</td>
              <td className="p-2">
                <span className={`px-2 py-0.5 rounded text-xs ${inv.category === "تميز" ? "bg-green-100 text-green-700" : inv.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                  {inv.category}
                </span>
              </td>
              <td className="p-2">{inv.percentage}%</td>
              <td className="p-2 font-semibold text-blue-600">{inv.bonus.toFixed(2)}</td>
              {showPaymentStatus && (
                <td className="p-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${inv.isPending ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                    {inv.paymentStatus}
                  </span>
                </td>
              )}
              <td className="p-2 text-xs text-gray-500">{inv.date}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-100 font-bold">
            {showCheckbox && <td className="p-2"></td>}
            <td className="p-2" colSpan={showReturn ? 6 : 5}></td>
            <td className="p-2">{invoices.reduce((s, i) => s + i.itemTotal, 0).toFixed(2)}</td>
            <td className="p-2" colSpan={2}></td>
            <td className="p-2 text-blue-600">{invoices.reduce((s, i) => s + i.bonus, 0).toFixed(2)}</td>
            {showPaymentStatus && <td className="p-2"></td>}
            <td className="p-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          <h1 className="text-3xl font-bold text-gray-900">نظام حساب العمولات</h1>
          <div className="flex gap-2">
            <Link href="/settings">
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                الإعدادات
              </Button>
            </Link>
          </div>
        </div>

        {/* Main Tabs: Wizard vs Delivered */}
        <Tabs value={mainTab} onValueChange={(v) => { setMainTab(v); }} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="wizard" className="gap-1 text-xs">
              <Wallet className="w-3 h-3" />
              معالجة البونص
            </TabsTrigger>
            <TabsTrigger value="delivered" className="gap-1 text-xs">
              <CheckCircle2 className="w-3 h-3" />
              مسلم ({filteredDelivered.length})
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1 text-xs">
              <Package className="w-3 h-3" />
              المنتجات
            </TabsTrigger>
            <TabsTrigger value="categories" className="gap-1 text-xs">
              <Layers className="w-3 h-3" />
              الأصناف
            </TabsTrigger>
          </TabsList>

          {/* ==================== TAB: WIZARD ==================== */}
          <TabsContent value="wizard">
            {/* Wizard Steps Indicator */}
            <div className="mb-6">
              <div className="flex items-center justify-center gap-2">
                {STEPS.map((step, idx) => {
                  const StepIcon = step.icon;
                  const isActive = currentStep === step.id;
                  const isCompleted = currentStep > step.id;
                  return (
                    <div key={step.id} className="flex items-center">
                      <div
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all cursor-pointer ${
                          isActive ? "bg-blue-600 text-white shadow-md" :
                          isCompleted ? "bg-green-100 text-green-700" :
                          "bg-gray-100 text-gray-400"
                        }`}
                        onClick={() => {
                          if (isCompleted || isActive) setCurrentStep(step.id);
                        }}
                      >
                        <StepIcon className="w-4 h-4" />
                        <span className="text-sm font-medium hidden md:inline">{step.title}</span>
                        <span className="text-xs font-bold md:hidden">{step.id}</span>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <ArrowLeft className={`w-4 h-4 mx-1 ${isCompleted ? "text-green-500" : "text-gray-300"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-sm text-gray-500 mt-2">
                {STEPS.find(s => s.id === currentStep)?.description}
              </p>
            </div>

            {/* ===== STEP 1: اختيار الفترة ===== */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    الخطوة 1: اختيار الفترة الزمنية
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-4 items-end mb-6">
                    <div>
                      <Label htmlFor="startDate" className="text-sm font-medium">من تاريخ</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => { setStartDate(e.target.value); setSelectedInvoices(new Set()); setSavedInvoiceKeys(new Set()); }}
                        className="max-w-[180px] mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate" className="text-sm font-medium">إلى تاريخ</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => { setEndDate(e.target.value); setSelectedInvoices(new Set()); setSavedInvoiceKeys(new Set()); }}
                        className="max-w-[180px] mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm font-medium">المندوب</Label>
                      <select
                        value={selectedRep}
                        onChange={(e) => setSelectedRep(e.target.value)}
                        className="mt-1 block px-4 py-2 border rounded-md bg-white text-sm"
                      >
                        <option value="all">جميع المناديب</option>
                        {uniqueReps.map((rep: string) => (
                          <option key={rep} value={rep}>{getRepDisplayName(rep)}</option>
                        ))}
                      </select>
                    </div>
                    <Button onClick={refreshData} disabled={clearCacheMutation.isPending} variant="outline">
                      <RefreshCw className={`ml-2 h-4 w-4 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
                      تحديث البيانات
                    </Button>
                  </div>

                  {/* Quick Stats */}
                  {filteredStats && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 rounded-lg p-4 text-center">
                        <div className="text-xs text-blue-600 font-medium">إجمالي المبيعات</div>
                        <div className="text-lg font-bold text-blue-800">{filteredStats.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ر.س</span></div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4 text-center">
                        <div className="text-xs text-green-600 font-medium">إجمالي البونص</div>
                        <div className="text-lg font-bold text-green-800">{filteredStats.totalBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ر.س</span></div>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4 text-center">
                        <div className="text-xs text-purple-600 font-medium">البونص المسلم</div>
                        <div className="text-lg font-bold text-purple-800">{filteredStats.deliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ر.س</span></div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-4 border-t">
                    <div className="text-sm text-gray-500">
                      {validDates ? "حدد الفترة ثم انتقل للخطوة التالية" : "يرجى إدخال تاريخ صحيح"}
                    </div>
                    <Button
                      onClick={() => setCurrentStep(2)}
                      disabled={!validDates}
                      className="gap-2"
                    >
                      التالي
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ===== STEP 2: مراجعة الفواتير ===== */}
            {currentStep === 2 && (
              <div>
                {/* Sub-tabs: مدفوع / غير مدفوع */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap justify-between items-center gap-4">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileCheck className="w-5 h-5 text-blue-600" />
                        الخطوة 2: مراجعة واختيار الفواتير
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {bonusData && (
                          <Button onClick={exportToExcel} variant="secondary" size="sm" className="gap-1">
                            <FileSpreadsheet className="w-3 h-3" />
                            تصدير Excel
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={invoiceSubTab} onValueChange={setInvoiceSubTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="paid" className="gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          مدفوعة ({filteredPaid.length})
                        </TabsTrigger>
                        <TabsTrigger value="unpaid" className="gap-1">
                          <Clock className="w-3 h-3" />
                          غير مدفوعة ({filteredUnpaid.length})
                        </TabsTrigger>
                      </TabsList>

                      {/* Sub-tab: مدفوعة */}
                      <TabsContent value="paid">
                        {invoicesLoading ? (
                          <div className="space-y-3 py-8">
                            {[...Array(5)].map((_, i) => (
                              <div key={i} className="animate-pulse flex space-x-4">
                                <div className="flex-1 space-y-2 py-1"><div className="h-4 bg-gray-200 rounded w-3/4"></div></div>
                              </div>
                            ))}
                          </div>
                        ) : filteredPaid.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                            <Wallet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-lg font-medium">لا توجد فواتير مدفوعة</p>
                            <p className="text-sm">لا توجد فواتير مدفوعة في هذه الفترة</p>
                          </div>
                        ) : (
                          <InvoiceTable invoices={filteredPaid} showCheckbox showReturn headerColor="bg-green-50" />
                        )}
                      </TabsContent>

                      {/* Sub-tab: غير مدفوعة */}
                      <TabsContent value="unpaid">
                        {invoicesLoading ? (
                          <div className="space-y-3 py-8">
                            {[...Array(5)].map((_, i) => (
                              <div key={i} className="animate-pulse flex space-x-4">
                                <div className="flex-1 space-y-2 py-1"><div className="h-4 bg-gray-200 rounded w-3/4"></div></div>
                              </div>
                            ))}
                          </div>
                        ) : filteredUnpaid.length === 0 ? (
                          <div className="text-center py-12 text-gray-500">
                            <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                            <p className="text-lg font-medium">جميع الفواتير مدفوعة</p>
                            <p className="text-sm">لا توجد فواتير غير مدفوعة في هذه الفترة</p>
                          </div>
                        ) : (
                          <InvoiceTable invoices={filteredUnpaid} showCheckbox headerColor="bg-yellow-50" />
                        )}
                      </TabsContent>
                    </Tabs>

                    {/* Selection Summary + Navigation */}
                    <div className="flex flex-wrap justify-between items-center pt-4 border-t mt-4 gap-4">
                      <Button
                        onClick={() => setCurrentStep(1)}
                        variant="outline"
                        className="gap-2"
                      >
                        <ArrowRight className="w-4 h-4" />
                        السابق
                      </Button>

                      <div className="flex items-center gap-4">
                        {selectedInvoices.size > 0 && (
                          <span className="text-sm text-gray-600">
                            محدد: <strong>{selectedInvoices.size}</strong> | البونص: <strong className="text-blue-600">{selectedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</strong>
                          </span>
                        )}
                        <Button
                          onClick={saveSelectedInvoices}
                          disabled={selectedInvoices.size === 0 || isSaving}
                          className="gap-2 bg-blue-600 hover:bg-blue-700"
                        >
                          <Save className="w-4 h-4" />
                          {isSaving ? "جاري الحفظ..." : "حفظ المحدد والتالي"}
                          <ArrowLeft className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ===== STEP 3: تسليم البونص ===== */}
            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-green-600" />
                    الخطوة 3: تسليم البونص للمندوب
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {savedInvoiceKeys.size === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Save className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-lg font-medium">لم يتم حفظ أي فواتير بعد</p>
                      <p className="text-sm">ارجع للخطوة السابقة وحدد الفواتير ثم احفظها</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary of saved invoices */}
                      <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                        <h3 className="text-lg font-bold text-green-800 mb-4">ملخص الفواتير المحفوظة</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-700">{savedInvoiceKeys.size}</div>
                            <div className="text-xs text-green-600">عدد البنود المحفوظة</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-700">{savedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-sm">ر.س</span></div>
                            <div className="text-xs text-blue-600">إجمالي البونص المستحق</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-purple-700">
                              {bonusData ? new Set(
                                [...bonusData.paidInvoices, ...bonusData.unpaidInvoices]
                                  .filter(inv => savedInvoiceKeys.has(inv.uniqueKey))
                                  .map(inv => inv.rep)
                              ).size : 0}
                            </div>
                            <div className="text-xs text-purple-600">عدد المناديب</div>
                          </div>
                        </div>
                      </div>

                      {/* Saved invoices table */}
                      {bonusData && (
                        <div className="mb-6">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">تفاصيل الفواتير المحفوظة:</h4>
                          <InvoiceTable
                            invoices={[...bonusData.paidInvoices, ...bonusData.unpaidInvoices].filter(inv => savedInvoiceKeys.has(inv.uniqueKey))}
                            showReturn
                            showPaymentStatus
                            headerColor="bg-green-50"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Navigation */}
                  <div className="flex flex-wrap justify-between items-center pt-4 border-t gap-4">
                    <Button
                      onClick={() => setCurrentStep(2)}
                      variant="outline"
                      className="gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      السابق
                    </Button>

                    <Button
                      onClick={deliverBonus}
                      disabled={savedInvoiceKeys.size === 0 || isDelivering}
                      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      size="lg"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      {isDelivering ? "جاري التسليم..." : "تسليم البونص للمندوب"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ==================== TAB: DELIVERED (مسلم) ==================== */}
          <TabsContent value="delivered">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <div>
                  <CardTitle className="text-lg text-emerald-700 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    بونص مسلم
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    الفواتير التي تم تسليم بونصها للمندوب في الفترة {startDate} إلى {endDate}
                  </p>
                </div>
                <div className="flex gap-2">
                  {bonusData && (
                    <Button onClick={exportToExcel} variant="secondary" size="sm" className="gap-1">
                      <FileSpreadsheet className="w-3 h-3" />
                      تصدير Excel
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Date filter for delivered */}
                <div className="flex flex-wrap gap-4 items-end mb-4">
                  <div>
                    <Label className="text-sm font-medium">من تاريخ</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); }}
                      className="max-w-[180px] mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); }}
                      className="max-w-[180px] mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">المندوب</Label>
                    <select
                      value={selectedRep}
                      onChange={(e) => setSelectedRep(e.target.value)}
                      className="mt-1 block px-4 py-2 border rounded-md bg-white text-sm"
                    >
                      <option value="all">جميع المناديب</option>
                      {uniqueReps.map((rep: string) => (
                        <option key={rep} value={rep}>{getRepDisplayName(rep)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {filteredDelivered.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium">لا توجد فواتير مسلمة بعد</p>
                    <p className="text-sm">استخدم "معالجة البونص" لتحديد الفواتير وتسليم البونص</p>
                  </div>
                ) : (
                  <>
                    {/* Delivered stats */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-emerald-600">عدد الفواتير المسلمة</div>
                        <div className="text-xl font-bold text-emerald-700">{filteredDelivered.length}</div>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-3 text-center">
                        <div className="text-xs text-emerald-600">إجمالي البونص المسلم</div>
                        <div className="text-xl font-bold text-emerald-700">{filteredDelivered.reduce((s, i) => s + i.bonus, 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
                      </div>
                    </div>
                    <InvoiceTable invoices={filteredDelivered} headerColor="bg-emerald-50" />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB: PRODUCTS ==================== */}
          <TabsContent value="products">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  تقرير المنتجات
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!bonusData || bonusData.productAnalysis.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium">لا توجد بيانات منتجات</p>
                    <p className="text-sm">ابدأ بمعالجة البونص لعرض تقارير المنتجات</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-purple-50">
                          <th className="text-right p-2">المنتج</th>
                          <th className="text-right p-2">إجمالي الكمية</th>
                          <th className="text-right p-2">إجمالي المبيعات</th>
                          <th className="text-right p-2">إجمالي البونص</th>
                          <th className="text-right p-2">عدد مرات البيع</th>
                          <th className="text-right p-2">الفئة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusData.productAnalysis.map((prod, idx) => (
                          <tr key={idx} className="border-b hover:bg-purple-50/50">
                            <td className="p-2 font-medium">{prod.name}</td>
                            <td className="p-2">{prod.quantity}</td>
                            <td className="p-2">{prod.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2 text-blue-600 font-semibold">{prod.totalBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                            <td className="p-2">{prod.sellCount}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${prod.category === "تميز" ? "bg-green-100 text-green-700" : prod.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                {prod.category}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-purple-100 font-bold">
                          <td className="p-2">الإجمالي</td>
                          <td className="p-2">{bonusData.productAnalysis.reduce((s, p) => s + p.quantity, 0)}</td>
                          <td className="p-2">{bonusData.productAnalysis.reduce((s, p) => s + p.totalSales, 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                          <td className="p-2 text-blue-600">{bonusData.productAnalysis.reduce((s, p) => s + p.totalBonus, 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                          <td className="p-2">{bonusData.productAnalysis.reduce((s, p) => s + p.sellCount, 0)}</td>
                          <td className="p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ==================== TAB: CATEGORIES ==================== */}
          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-600" />
                  تقرير الأصناف
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!bonusData || bonusData.categoryAnalysis.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium">لا توجد بيانات أصناف</p>
                    <p className="text-sm">ابدأ بمعالجة البونص لعرض تقارير الأصناف</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-cyan-50">
                          <th className="text-right p-2">الصنف</th>
                          <th className="text-right p-2">إجمالي المبيعات</th>
                          <th className="text-right p-2">إجمالي الكمية</th>
                          <th className="text-right p-2">عدد المنتجات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusData.categoryAnalysis.map((cat, idx) => (
                          <tr key={idx} className="border-b hover:bg-cyan-50/50">
                            <td className="p-2 font-medium">
                              <span className={`px-2 py-0.5 rounded text-xs ${cat.name === "تميز" ? "bg-green-100 text-green-700" : cat.name === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                {cat.name}
                              </span>
                            </td>
                            <td className="p-2">{cat.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                            <td className="p-2">{cat.totalQuantity}</td>
                            <td className="p-2">{cat.productCount}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-cyan-100 font-bold">
                          <td className="p-2">الإجمالي</td>
                          <td className="p-2">{bonusData.categoryAnalysis.reduce((s, c) => s + c.totalSales, 0).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                          <td className="p-2">{bonusData.categoryAnalysis.reduce((s, c) => s + c.totalQuantity, 0)}</td>
                          <td className="p-2">{bonusData.categoryAnalysis.reduce((s, c) => s + c.productCount, 0)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
