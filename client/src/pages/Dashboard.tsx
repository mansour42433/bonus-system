import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  Settings, RefreshCw, FileSpreadsheet, CheckCircle2,
  Clock, Wallet, Package, Layers,
  Save, CreditCard, FileDown, CalendarDays
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

// ==================== ARABIC MONTHS ====================
const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  // Current month/year
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedRep, setSelectedRep] = useState<string>("all");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isDelivering, setIsDelivering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedInvoiceKeys, setSavedInvoiceKeys] = useState<Set<string>>(new Set());
  const [paymentTab, setPaymentTab] = useState("paid");
  const [deliveryTab, setDeliveryTab] = useState("undelivered");

  // Compute date range from selected month
  const { start: startDate, end: endDate } = useMemo(
    () => getMonthRange(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  // Fetch data
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } =
    trpc.qoyod.fetchInvoicesByPaymentDate.useQuery({ startDate, endDate });
  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const { data: creditNotesData, refetch: refetchCreditNotes } =
    trpc.qoyod.fetchCreditNotes.useQuery({ startDate, endDate });
  const { data: paymentsData, refetch: refetchPayments } =
    trpc.qoyod.fetchInvoicePayments.useQuery({ startDate, endDate });
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();

  // Fetch delivered bonuses from DB
  const { data: deliveredBonusData, refetch: refetchDelivered } =
    trpc.bonusPayments.list.useQuery({
      startDate,
      endDate,
      repEmail: undefined,
      status: "paid",
    });

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

    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    let totalSales = 0, sales1Percent = 0, sales2Percent = 0, totalBonus = 0;
    let deliveredBonus = 0, undeliveredBonus = 0;

    const paidDelivered: InvoiceRow[] = [];
    const paidUndelivered: InvoiceRow[] = [];
    const unpaidInvoices: InvoiceRow[] = [];

    const productAnalysis = new Map<string, {
      productId: number; name: string; quantity: number;
      totalSales: number; totalBonus: number; sellCount: number; category: string;
    }>();

    const processedKeys = new Set<string>();

    invoices.forEach((invoice: any) => {
      const paymentDate = paymentDates.get(invoice.id);

      let hasPaidInRange = false;
      if (paymentDate) {
        const pd = new Date(paymentDate);
        hasPaidInRange = pd >= rangeStart && pd <= rangeEnd;
      }

      const isPending = !hasPaidInRange && (invoice.status === "Approved");
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
            percentage = 2; bonusCategory = "تميز";
          } else if (priceWithTax < premiumPrice && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
          } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
            percentage = 1; bonusCategory = "أساسي";
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

        // Categorize
        if (isDelivered) {
          deliveredBonus += bonus;
          paidDelivered.push(invoiceRow);
        } else if (isPaid) {
          undeliveredBonus += bonus;
          paidUndelivered.push(invoiceRow);
        } else {
          undeliveredBonus += bonus;
          unpaidInvoices.push(invoiceRow);
        }
      });
    });

    // Category analysis
    const categoryAnalysis = new Map<string, {
      name: string; totalSales: number; totalQuantity: number; productCount: number;
    }>();
    productAnalysis.forEach((prod) => {
      const catName = prod.category || "غير مصنف";
      const existing = categoryAnalysis.get(catName) || {
        name: catName, totalSales: 0, totalQuantity: 0, productCount: 0,
      };
      existing.totalSales += prod.totalSales;
      existing.totalQuantity += prod.quantity;
      existing.productCount += 1;
      categoryAnalysis.set(catName, existing);
    });

    return {
      totalSales, sales1Percent, sales2Percent, totalBonus,
      deliveredBonus, undeliveredBonus,
      paidDelivered, paidUndelivered, unpaidInvoices,
      productAnalysis: Array.from(productAnalysis.values()).sort((a, b) => b.totalSales - a.totalSales),
      categoryAnalysis: Array.from(categoryAnalysis.values()).sort((a, b) => b.totalSales - a.totalSales),
    };
  }, [invoicesData, settingsData, creditNotesData, paymentsData, deliveredBonusData, startDate, endDate]);

  // Unique reps
  const uniqueReps = useMemo(() => {
    if (!bonusData) return [];
    const allInvoices = [...bonusData.paidDelivered, ...bonusData.paidUndelivered, ...bonusData.unpaidInvoices];
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
      if (next.has(uniqueKey)) next.delete(uniqueKey); else next.add(uniqueKey);
      return next;
    });
  };

  // Select all
  const selectAllInTab = (invoices: InvoiceRow[]) => {
    const allKeys = invoices.map((inv) => inv.uniqueKey);
    const allSelected = allKeys.every(key => selectedInvoices.has(key));
    if (allSelected) {
      setSelectedInvoices(prev => { const next = new Set(prev); allKeys.forEach(key => next.delete(key)); return next; });
    } else {
      setSelectedInvoices(prev => { const next = new Set(prev); allKeys.forEach(key => next.add(key)); return next; });
    }
  };

  // Save selected invoices to DB
  const saveSelectedInvoices = async () => {
    if (!bonusData || selectedInvoices.size === 0) return;
    setIsSaving(true);
    try {
      const allUndelivered = [...bonusData.paidUndelivered, ...bonusData.unpaidInvoices];
      const selectedItems = allUndelivered.filter((inv) => selectedInvoices.has(inv.uniqueKey));

      const invoiceGroups = new Map<string, InvoiceRow[]>();
      selectedItems.forEach((inv) => {
        const groupKey = `${inv.invoiceId}-${inv.rep}`;
        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey)!.push(inv);
      });

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

      setSavedInvoiceKeys(prev => {
        const next = new Set(prev);
        selectedInvoices.forEach(key => next.add(key));
        return next;
      });

      toast.success(`تم حفظ ${invoiceGroups.size} فاتورة بنجاح`);
    } catch (error) {
      console.error("Error saving invoices:", error);
      toast.error("فشل حفظ الفواتير");
    } finally {
      setIsSaving(false);
    }
  };

  // Deliver bonus
  const deliverBonus = async () => {
    if (!bonusData || savedInvoiceKeys.size === 0) return;
    setIsDelivering(true);
    try {
      const allUndelivered = [...bonusData.paidUndelivered, ...bonusData.unpaidInvoices];
      const savedItems = allUndelivered.filter((inv) => savedInvoiceKeys.has(inv.uniqueKey));

      const invoiceGroups = new Map<string, InvoiceRow[]>();
      savedItems.forEach((inv) => {
        const groupKey = `${inv.invoiceId}-${inv.rep}`;
        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey)!.push(inv);
      });

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
      setDeliveryTab("delivered");
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
    const allUndelivered = [...bonusData.paidUndelivered, ...bonusData.unpaidInvoices];
    return allUndelivered
      .filter((inv) => selectedInvoices.has(inv.uniqueKey))
      .reduce((sum, inv) => sum + inv.bonus, 0);
  }, [bonusData, selectedInvoices]);

  // Saved bonus total
  const savedBonusTotal = useMemo(() => {
    if (!bonusData) return 0;
    const allUndelivered = [...bonusData.paidUndelivered, ...bonusData.unpaidInvoices];
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

    // ===== ملخص =====
    const summarySheet = workbook.addWorksheet("ملخص البونص");
    summarySheet.columns = [
      { header: "البيان", key: "label", width: 35 },
      { header: "القيمة", key: "value", width: 25 },
    ];
    styleHeader(summarySheet);
    summarySheet.addRow({ label: "الشهر", value: `${ARABIC_MONTHS[selectedMonth]} ${selectedYear}` });
    summarySheet.addRow({ label: "إجمالي المبيعات", value: bonusData.totalSales.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "مبيعات 1% (أساسي)", value: bonusData.sales1Percent.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "مبيعات 2% (تميز)", value: bonusData.sales2Percent.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "إجمالي البونص", value: bonusData.totalBonus.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "البونص المسلم", value: bonusData.deliveredBonus.toFixed(2) + " ريال" });
    summarySheet.addRow({ label: "البونص غير المسلم", value: bonusData.undeliveredBonus.toFixed(2) + " ريال" });

    // ===== مدفوعة - غير مسلم =====
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

    addInvoiceSheet("مدفوعة - غير مسلم", filterByRep(bonusData.paidUndelivered), "FF059669");
    addInvoiceSheet("مدفوعة - مسلم", filterByRep(bonusData.paidDelivered), "FF7C3AED");
    addInvoiceSheet("غير مدفوعة", filterByRep(bonusData.unpaidInvoices), "FFDC2626");

    // ===== المنتجات =====
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
    link.download = `تقرير-البونص-${ARABIC_MONTHS[selectedMonth]}-${selectedYear}${selectedRep !== "all" ? `-${getRepDisplayName(selectedRep)}` : ""}.xlsx`;
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

  // When month changes, reset selections
  const changeMonth = (monthIdx: number) => {
    setSelectedMonth(monthIdx);
    setSelectedInvoices(new Set());
    setSavedInvoiceKeys(new Set());
    setPaymentTab("paid");
    setDeliveryTab("undelivered");
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
  const filteredPaidUndelivered = bonusData ? filterByRep(bonusData.paidUndelivered) : [];
  const filteredPaidDelivered = bonusData ? filterByRep(bonusData.paidDelivered) : [];
  const filteredUnpaid = bonusData ? filterByRep(bonusData.unpaidInvoices) : [];

  const filteredStats = bonusData ? {
    totalSales: [...filteredPaidUndelivered, ...filteredPaidDelivered, ...filteredUnpaid].reduce((s, i) => s + i.itemTotal, 0),
    totalBonus: [...filteredPaidUndelivered, ...filteredPaidDelivered, ...filteredUnpaid].reduce((s, i) => s + i.bonus, 0),
    deliveredBonus: filteredPaidDelivered.reduce((s, i) => s + i.bonus, 0),
    undeliveredBonus: [...filteredPaidUndelivered, ...filteredUnpaid].reduce((s, i) => s + i.bonus, 0),
    paidCount: filteredPaidUndelivered.length + filteredPaidDelivered.length,
    unpaidCount: filteredUnpaid.length,
    deliveredCount: filteredPaidDelivered.length,
  } : null;

  // ==================== INVOICE TABLE COMPONENT ====================
  const InvoiceTable = ({ invoices, showCheckbox = false, headerColor = "bg-gray-50", showReturn = false }: {
    invoices: InvoiceRow[];
    showCheckbox?: boolean;
    headerColor?: string;
    showReturn?: boolean;
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
            <th className="text-right p-2 text-xs">رقم الفاتورة</th>
            <th className="text-right p-2 text-xs">المندوب</th>
            <th className="text-right p-2 text-xs">العميل</th>
            <th className="text-right p-2 text-xs">المنتج</th>
            <th className="text-right p-2 text-xs">الكمية</th>
            {showReturn && <th className="text-right p-2 text-xs">مرتجع</th>}
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
            <tr>
              <td colSpan={showCheckbox ? (showReturn ? 14 : 13) : (showReturn ? 13 : 12)} className="text-center py-8 text-gray-400">
                لا توجد فواتير
              </td>
            </tr>
          ) : invoices.map((inv) => (
            <tr
              key={inv.uniqueKey}
              className={`border-b hover:bg-gray-50/80 transition-colors ${showCheckbox ? 'cursor-pointer' : ''} ${showCheckbox && selectedInvoices.has(inv.uniqueKey) ? 'bg-blue-50' : ''} ${savedInvoiceKeys.has(inv.uniqueKey) ? 'bg-green-50' : ''}`}
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
              <td className="p-2 text-xs">{getRepDisplayName(inv.rep)}</td>
              <td className="p-2 text-xs">{inv.customer}</td>
              <td className="p-2 text-xs">{inv.product}</td>
              <td className="p-2 text-xs">{inv.quantity}</td>
              {showReturn && <td className="p-2 text-xs text-red-500">{inv.returnedQty > 0 ? `-${inv.returnedQty}` : "—"}</td>}
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
              {showCheckbox && <td className="p-2"></td>}
              <td className="p-2" colSpan={showReturn ? 6 : 5}></td>
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
                <h1 className="text-lg font-bold text-gray-900">معالجة وتصدير</h1>
                <p className="text-[10px] text-gray-500">نظام حساب العمولات</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Year selector */}
              <select
                value={selectedYear}
                onChange={(e) => { setSelectedYear(parseInt(e.target.value)); setSelectedInvoices(new Set()); setSavedInvoiceKeys(new Set()); }}
                className="px-3 py-1.5 border rounded-lg bg-white text-sm font-medium"
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              {/* Rep filter */}
              <select
                value={selectedRep}
                onChange={(e) => setSelectedRep(e.target.value)}
                className="px-3 py-1.5 border rounded-lg bg-white text-sm"
              >
                <option value="all">جميع المناديب</option>
                {uniqueReps.map((rep: string) => (
                  <option key={rep} value={rep}>{getRepDisplayName(rep)}</option>
                ))}
              </select>

              <Button onClick={refreshData} disabled={clearCacheMutation.isPending} variant="outline" size="sm" className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">تحديث</span>
              </Button>

              <Button onClick={exportToExcel} disabled={!bonusData} variant="outline" size="sm" className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">تصدير</span>
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
        {/* ===== MONTH TABS ===== */}
        <Tabs value={String(selectedMonth)} onValueChange={(v) => changeMonth(parseInt(v))} className="w-full">
          <div className="overflow-x-auto pb-2">
            <TabsList className="inline-flex w-auto min-w-full bg-white border shadow-sm rounded-xl p-1 gap-0.5">
              {ARABIC_MONTHS.map((month, idx) => (
                <TabsTrigger
                  key={idx}
                  value={String(idx)}
                  className="px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
                >
                  <CalendarDays className="w-3 h-3 ml-1 inline-block" />
                  {month}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Each month content */}
          {ARABIC_MONTHS.map((_, monthIdx) => (
            <TabsContent key={monthIdx} value={String(monthIdx)} className="mt-4">

              {/* Quick Stats */}
              {filteredStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card className="border-blue-200 bg-blue-50/50">
                    <CardContent className="p-3 text-center">
                      <div className="text-[10px] text-blue-600 font-medium">إجمالي المبيعات</div>
                      <div className="text-sm font-bold text-blue-800">{filteredStats.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="p-3 text-center">
                      <div className="text-[10px] text-green-600 font-medium">إجمالي البونص</div>
                      <div className="text-sm font-bold text-green-800">{filteredStats.totalBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
                    </CardContent>
                  </Card>
                  <Card className="border-purple-200 bg-purple-50/50">
                    <CardContent className="p-3 text-center">
                      <div className="text-[10px] text-purple-600 font-medium">بونص مسلم</div>
                      <div className="text-sm font-bold text-purple-800">{filteredStats.deliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
                    </CardContent>
                  </Card>
                  <Card className="border-orange-200 bg-orange-50/50">
                    <CardContent className="p-3 text-center">
                      <div className="text-[10px] text-orange-600 font-medium">بونص غير مسلم</div>
                      <div className="text-sm font-bold text-orange-800">{filteredStats.undeliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-[10px]">ر.س</span></div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Loading */}
              {invoicesLoading && (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500">جاري تحميل بيانات {ARABIC_MONTHS[monthIdx]}...</p>
                </div>
              )}

              {/* Payment Status Tabs: مدفوع / غير مدفوع */}
              {!invoicesLoading && (
                <Tabs value={paymentTab} onValueChange={setPaymentTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="paid" className="gap-1.5 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      مدفوع ({filteredPaidUndelivered.length + filteredPaidDelivered.length})
                    </TabsTrigger>
                    <TabsTrigger value="unpaid" className="gap-1.5 text-sm">
                      <Clock className="w-4 h-4" />
                      غير مدفوع ({filteredUnpaid.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* ===== TAB: مدفوع ===== */}
                  <TabsContent value="paid">
                    {/* Sub-tabs: مسلم / غير مسلم */}
                    <Tabs value={deliveryTab} onValueChange={setDeliveryTab} className="w-full">
                      <TabsList className="grid w-full grid-cols-2 mb-3 bg-gray-100">
                        <TabsTrigger value="undelivered" className="gap-1.5 text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                          <Wallet className="w-3.5 h-3.5" />
                          غير مسلم للمندوب ({filteredPaidUndelivered.length})
                        </TabsTrigger>
                        <TabsTrigger value="delivered" className="gap-1.5 text-xs data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          مسلم للمندوب ({filteredPaidDelivered.length})
                        </TabsTrigger>
                      </TabsList>

                      {/* غير مسلم للمندوب */}
                      <TabsContent value="undelivered">
                        <Card>
                          <CardContent className="p-3">
                            <InvoiceTable invoices={filteredPaidUndelivered} showCheckbox showReturn headerColor="bg-orange-50" />

                            {/* Action bar */}
                            {filteredPaidUndelivered.length > 0 && (
                              <div className="flex flex-wrap justify-between items-center pt-3 border-t mt-3 gap-3">
                                <div className="text-xs text-gray-500">
                                  {selectedInvoices.size > 0 && (
                                    <span>
                                      محدد: <strong>{selectedInvoices.size}</strong> | البونص: <strong className="text-blue-600">{selectedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</strong>
                                    </span>
                                  )}
                                  {savedInvoiceKeys.size > 0 && (
                                    <span className="mr-4 text-green-600">
                                      | محفوظ: <strong>{savedInvoiceKeys.size}</strong> ({savedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س)
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    onClick={saveSelectedInvoices}
                                    disabled={selectedInvoices.size === 0 || isSaving}
                                    size="sm"
                                    className="gap-1 bg-blue-600 hover:bg-blue-700"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    {isSaving ? "جاري الحفظ..." : "حفظ المحدد"}
                                  </Button>
                                  <Button
                                    onClick={deliverBonus}
                                    disabled={savedInvoiceKeys.size === 0 || isDelivering}
                                    size="sm"
                                    className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    {isDelivering ? "جاري التسليم..." : "تسليم البونص"}
                                  </Button>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>

                      {/* مسلم للمندوب */}
                      <TabsContent value="delivered">
                        <Card>
                          <CardContent className="p-3">
                            {filteredPaidDelivered.length === 0 ? (
                              <div className="text-center py-8 text-gray-400">
                                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                                <p className="text-sm font-medium">لا توجد فواتير مسلمة</p>
                                <p className="text-xs">حدد الفواتير من "غير مسلم" ثم اضغط "تسليم البونص"</p>
                              </div>
                            ) : (
                              <InvoiceTable invoices={filteredPaidDelivered} showReturn headerColor="bg-emerald-50" />
                            )}
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  {/* ===== TAB: غير مدفوع ===== */}
                  <TabsContent value="unpaid">
                    <Card>
                      <CardContent className="p-3">
                        {filteredUnpaid.length === 0 ? (
                          <div className="text-center py-8 text-gray-400">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400" />
                            <p className="text-sm font-medium">جميع الفواتير مدفوعة</p>
                            <p className="text-xs">لا توجد فواتير آجلة في هذا الشهر</p>
                          </div>
                        ) : (
                          <>
                            <InvoiceTable invoices={filteredUnpaid} showCheckbox headerColor="bg-yellow-50" />
                            {/* Action bar for unpaid */}
                            <div className="flex flex-wrap justify-between items-center pt-3 border-t mt-3 gap-3">
                              <div className="text-xs text-gray-500">
                                {selectedInvoices.size > 0 && (
                                  <span>
                                    محدد: <strong>{selectedInvoices.size}</strong> | البونص: <strong className="text-blue-600">{selectedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</strong>
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={saveSelectedInvoices}
                                  disabled={selectedInvoices.size === 0 || isSaving}
                                  size="sm"
                                  className="gap-1 bg-blue-600 hover:bg-blue-700"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  {isSaving ? "جاري الحفظ..." : "حفظ المحدد"}
                                </Button>
                                <Button
                                  onClick={deliverBonus}
                                  disabled={savedInvoiceKeys.size === 0 || isDelivering}
                                  size="sm"
                                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                                >
                                  <CreditCard className="w-3.5 h-3.5" />
                                  {isDelivering ? "جاري التسليم..." : "تسليم البونص"}
                                </Button>
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
