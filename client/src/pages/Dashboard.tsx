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
import { Settings, RefreshCw, FileSpreadsheet, CheckCircle2, Clock, Wallet, BarChart3 } from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedRep, setSelectedRep] = useState<string>("all");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [isDelivering, setIsDelivering] = useState(false);

  // Calculate date range from selected month
  const [startDate, endDate] = useMemo(() => {
    const parts = selectedMonth ? selectedMonth.split("-").map(Number) : [];
    const year = parts[0] || new Date().getFullYear();
    const month = parts[1] || (new Date().getMonth() + 1);
    if (!year || !month || isNaN(year) || isNaN(month)) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      return [
        `${y}-${String(m).padStart(2, "0")}-01`,
        `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`,
      ];
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return [
      start.toISOString().split("T")[0],
      end.toISOString().split("T")[0],
    ];
  }, [selectedMonth]);

  // Fetch data
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = trpc.qoyod.fetchInvoicesByPaymentDate.useQuery({ startDate, endDate });
  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const { data: creditNotesData, refetch: refetchCreditNotes } = trpc.qoyod.fetchCreditNotes.useQuery({ startDate, endDate });
  const { data: paymentsData, refetch: refetchPayments } = trpc.qoyod.fetchInvoicePayments.useQuery({ startDate, endDate });
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();
  
  // Fetch delivered bonuses from DB
  const { data: deliveredBonusData, refetch: refetchDelivered } = trpc.bonusPayments.list.useQuery({
    startDate,
    endDate,
    repEmail: undefined,
    status: undefined,
  });

  // Record bonus mutation
  const recordBonusMutation = trpc.bonusPayments.record.useMutation();
  const markAsPaidMutation = trpc.bonusPayments.markAsPaid.useMutation();

  // Helper function to get rep display name
  const getRepDisplayName = useCallback((repEmail: string) => {
    const repSetting = repsData?.reps.find((r: any) => r.repEmail === repEmail);
    return repSetting?.repNickname || repEmail;
  }, [repsData]);

  // Calculate bonus data
  const bonusData = useMemo(() => {
    if (!invoicesData?.invoices || !settingsData?.settings) return null;

    const invoices = invoicesData.invoices;
    const settings = settingsData.settings;
    const creditNotes = creditNotesData?.creditNotes || [];
    const payments = paymentsData?.payments || [];
    const deliveredList = deliveredBonusData?.payments || [];

    // Build set of delivered invoice IDs (already marked as paid/delivered)
    const deliveredInvoiceKeys = new Set<string>();
    deliveredList.forEach((bp: any) => {
      deliveredInvoiceKeys.add(`${bp.invoiceId}-${bp.repEmail}`);
    });

    // Build payment dates map
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

    // Build credit note to invoice map
    const creditNoteToInvoice = new Map<number, number>();
    payments.forEach((payment: any) => {
      payment.allocations?.forEach((allocation: any) => {
        if (allocation.source_type === "CreditNote" && allocation.allocatee_type === "Invoice") {
          creditNoteToInvoice.set(allocation.source_id, allocation.allocatee_id);
        }
      });
    });

    // Build returned quantities map
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

    const [selectedYear, selectedMonthNum] = selectedMonth.split("-").map(Number);

    let totalSales = 0;
    let sales1Percent = 0;
    let sales2Percent = 0;
    let totalBonus = 0;
    let deliveredBonus = 0;
    let undeliveredBonus = 0;

    const undeliveredInvoices: any[] = [];
    const deliveredInvoices: any[] = [];
    const pendingInvoices: any[] = [];

    invoices.forEach((invoice: any) => {
      const paymentDate = paymentDates.get(invoice.id);
      
      let isInSelectedMonth = false;
      if (paymentDate) {
        const [payYear, payMonth] = paymentDate.split("-").map(Number);
        isInSelectedMonth = payYear === selectedYear && payMonth === selectedMonthNum;
      }
      
      const isPaid = isInSelectedMonth;
      const isPending = !isInSelectedMonth && (invoice.status === "Approved");
      
      if (!isPaid && !isPending) return;
      
      invoice.line_items?.forEach((item: any) => {
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
        let category = "لا بونص";
        if (priceWithTax > 0) {
          if (priceWithTax >= premiumPrice && bonus2Enabled) {
            percentage = 2;
            category = "تميز";
          } else if (priceWithTax < premiumPrice && bonus1Enabled) {
            percentage = 1;
            category = "أساسي";
          } else if (priceWithTax >= premiumPrice && !bonus2Enabled && bonus1Enabled) {
            percentage = 1;
            category = "أساسي";
          }
        }

        const bonus = itemTotal * (percentage / 100);
        const uniqueKey = `${invoice.id}-${item.product_id}-${invoice.created_by}`;
        const isDelivered = deliveredInvoiceKeys.has(`${invoice.id}-${invoice.created_by}`);

        const invoiceRow = {
          uniqueKey,
          invoiceId: invoice.id,
          reference: invoice.reference,
          rep: invoice.created_by,
          product: setting?.productName || item.product_name,
          productId: item.product_id,
          quantity: actualQuantity,
          returnedQty: returnedQty,
          price: priceWithTax,
          itemTotal,
          category,
          percentage,
          bonus,
          date: paymentDate || invoice.issue_date,
        };

        if (isPaid) {
          totalSales += itemTotal;
          if (percentage === 1) sales1Percent += itemTotal;
          if (percentage === 2) sales2Percent += itemTotal;
          totalBonus += bonus;

          if (isDelivered) {
            deliveredBonus += bonus;
            deliveredInvoices.push(invoiceRow);
          } else {
            undeliveredBonus += bonus;
            undeliveredInvoices.push(invoiceRow);
          }
        } else {
          pendingInvoices.push({
            ...invoiceRow,
            status: "آجل - غير مدفوعة",
            expectedBonus: bonus,
          });
        }
      });
    });

    return {
      totalSales,
      sales1Percent,
      sales2Percent,
      totalBonus,
      deliveredBonus,
      undeliveredBonus,
      undeliveredInvoices,
      deliveredInvoices,
      pendingInvoices,
    };
  }, [invoicesData, settingsData, creditNotesData, paymentsData, deliveredBonusData, selectedMonth]);

  // Get unique reps
  const uniqueReps = useMemo(() => {
    if (!bonusData) return [];
    const allInvoices = [...bonusData.undeliveredInvoices, ...bonusData.deliveredInvoices];
    return Array.from(new Set(allInvoices.map((inv: any) => inv.rep)));
  }, [bonusData]);

  // Filter invoices by selected rep
  const filterByRep = useCallback((invoices: any[]) => {
    if (selectedRep === "all") return invoices;
    return invoices.filter((inv: any) => inv.rep === selectedRep);
  }, [selectedRep]);

  // Toggle invoice selection
  const toggleInvoice = (uniqueKey: string) => {
    setSelectedInvoices(prev => {
      const next = new Set(prev);
      if (next.has(uniqueKey)) {
        next.delete(uniqueKey);
      } else {
        next.add(uniqueKey);
      }
      return next;
    });
  };

  // Select all undelivered invoices
  const selectAllUndelivered = () => {
    if (!bonusData) return;
    const filtered = filterByRep(bonusData.undeliveredInvoices);
    const allKeys = filtered.map((inv: any) => inv.uniqueKey);
    const allSelected = allKeys.every(key => selectedInvoices.has(key));
    
    if (allSelected) {
      // Deselect all
      setSelectedInvoices(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.delete(key));
        return next;
      });
    } else {
      // Select all
      setSelectedInvoices(prev => {
        const next = new Set(prev);
        allKeys.forEach(key => next.add(key));
        return next;
      });
    }
  };

  // Deliver bonus for selected invoices
  const deliverBonus = async () => {
    if (!bonusData || selectedInvoices.size === 0) return;
    
    setIsDelivering(true);
    try {
      // Group selected invoices by invoiceId + rep
      const invoiceGroups = new Map<string, any[]>();
      bonusData.undeliveredInvoices
        .filter((inv: any) => selectedInvoices.has(inv.uniqueKey))
        .forEach((inv: any) => {
          const groupKey = `${inv.invoiceId}-${inv.rep}`;
          if (!invoiceGroups.has(groupKey)) {
            invoiceGroups.set(groupKey, []);
          }
          invoiceGroups.get(groupKey)!.push(inv);
        });

      // Record each invoice group as a bonus payment
      for (const [, items] of Array.from(invoiceGroups.entries())) {
        const totalBonus = items.reduce((sum: number, inv: any) => sum + inv.bonus, 0);
        const totalAmount = items.reduce((sum: number, inv: any) => sum + inv.itemTotal, 0);
        const firstItem = items[0];
        const avgPercentage = Math.round(items.reduce((sum: number, inv: any) => sum + inv.percentage, 0) / items.length);

        await recordBonusMutation.mutateAsync({
          invoiceId: firstItem.invoiceId,
          invoiceReference: firstItem.reference,
          repEmail: firstItem.rep,
          bonusAmount: Math.round(totalBonus * 100), // Store as cents
          bonusPercentage: avgPercentage,
          invoiceAmount: Math.round(totalAmount * 100),
          invoiceDate: firstItem.date,
          paymentDate: firstItem.date,
          notes: `تسليم بونص ${items.length} منتج`,
        });
      }

      // Mark all as paid
      const invoiceIds = Array.from(invoiceGroups.keys()).map(key => parseInt(key.split("-")[0]));
      if (invoiceIds.length > 0) {
        await markAsPaidMutation.mutateAsync(invoiceIds);
      }

      // Clear selection and refresh
      setSelectedInvoices(new Set());
      await refetchDelivered();
      
      toast.success(`تم تسليم البونص لـ ${invoiceGroups.size} فاتورة بنجاح`);
    } catch (error) {
      console.error("Error delivering bonus:", error);
      toast.error("فشل تسليم البونص");
    } finally {
      setIsDelivering(false);
    }
  };

  // Calculate selected bonus total
  const selectedBonusTotal = useMemo(() => {
    if (!bonusData) return 0;
    return bonusData.undeliveredInvoices
      .filter((inv: any) => selectedInvoices.has(inv.uniqueKey))
      .reduce((sum: number, inv: any) => sum + inv.bonus, 0);
  }, [bonusData, selectedInvoices]);

  // Export to Excel
  const exportToExcel = async () => {
    if (!bonusData) return;

    const workbook = new ExcelJS.Workbook();
    
    // Helper: style header row
    const styleHeader = (ws: ExcelJS.Worksheet) => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      ws.getRow(1).alignment = { horizontal: "center" };
    };

    // Sheet 1: ملخص البونص
    const summarySheet = workbook.addWorksheet("ملخص البونص");
    summarySheet.columns = [
      { header: "البيان", key: "label", width: 30 },
      { header: "القيمة", key: "value", width: 20 },
    ];
    styleHeader(summarySheet);
    summarySheet.addRow({ label: "الشهر", value: selectedMonth });
    summarySheet.addRow({ label: "إجمالي المبيعات", value: bonusData.totalSales.toFixed(2) });
    summarySheet.addRow({ label: "مبيعات 1% (أساسي)", value: bonusData.sales1Percent.toFixed(2) });
    summarySheet.addRow({ label: "مبيعات 2% (تميز)", value: bonusData.sales2Percent.toFixed(2) });
    summarySheet.addRow({ label: "إجمالي البونص المستحق", value: bonusData.totalBonus.toFixed(2) });
    summarySheet.addRow({ label: "البونص المسلم", value: bonusData.deliveredBonus.toFixed(2) });
    summarySheet.addRow({ label: "البونص غير المسلم", value: bonusData.undeliveredBonus.toFixed(2) });
    summarySheet.addRow({ label: "عدد الفواتير المدفوعة", value: bonusData.undeliveredInvoices.length + bonusData.deliveredInvoices.length });
    summarySheet.addRow({ label: "عدد الفواتير الآجلة", value: bonusData.pendingInvoices.length });

    // Sheet 2: بونص غير مسلم
    const undeliveredSheet = workbook.addWorksheet("بونص غير مسلم");
    undeliveredSheet.columns = [
      { header: "المرجع", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "مرتجع", key: "returnedQty", width: 10 },
      { header: "السعر", key: "price", width: 12 },
      { header: "الإجمالي", key: "total", width: 15 },
      { header: "الفئة", key: "category", width: 12 },
      { header: "النسبة", key: "percentage", width: 10 },
      { header: "البونص", key: "bonus", width: 12 },
      { header: "التاريخ", key: "date", width: 12 },
    ];
    styleHeader(undeliveredSheet);
    filterByRep(bonusData.undeliveredInvoices).forEach((inv: any) => {
      undeliveredSheet.addRow({
        reference: inv.reference,
        rep: getRepDisplayName(inv.rep),
        product: inv.product,
        quantity: inv.quantity,
        returnedQty: inv.returnedQty || 0,
        price: inv.price.toFixed(2),
        total: inv.itemTotal.toFixed(2),
        category: inv.category,
        percentage: `${inv.percentage}%`,
        bonus: inv.bonus.toFixed(2),
        date: inv.date,
      });
    });
    // Add total row
    const undeliveredTotal = filterByRep(bonusData.undeliveredInvoices).reduce((s: number, i: any) => s + i.bonus, 0);
    const totalRow1 = undeliveredSheet.addRow({ reference: "", rep: "", product: "الإجمالي", quantity: "", returnedQty: "", price: "", total: "", category: "", percentage: "", bonus: undeliveredTotal.toFixed(2), date: "" });
    totalRow1.font = { bold: true };
    totalRow1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };

    // Sheet 3: بونص مسلم
    const deliveredSheet = workbook.addWorksheet("بونص مسلم");
    deliveredSheet.columns = [
      { header: "المرجع", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "السعر", key: "price", width: 12 },
      { header: "الإجمالي", key: "total", width: 15 },
      { header: "الفئة", key: "category", width: 12 },
      { header: "النسبة", key: "percentage", width: 10 },
      { header: "البونص", key: "bonus", width: 12 },
      { header: "التاريخ", key: "date", width: 12 },
    ];
    styleHeader(deliveredSheet);
    filterByRep(bonusData.deliveredInvoices).forEach((inv: any) => {
      deliveredSheet.addRow({
        reference: inv.reference,
        rep: getRepDisplayName(inv.rep),
        product: inv.product,
        quantity: inv.quantity,
        price: inv.price.toFixed(2),
        total: inv.itemTotal.toFixed(2),
        category: inv.category,
        percentage: `${inv.percentage}%`,
        bonus: inv.bonus.toFixed(2),
        date: inv.date,
      });
    });
    const deliveredTotal = filterByRep(bonusData.deliveredInvoices).reduce((s: number, i: any) => s + i.bonus, 0);
    const totalRow2 = deliveredSheet.addRow({ reference: "", rep: "", product: "الإجمالي", quantity: "", price: "", total: "", category: "", percentage: "", bonus: deliveredTotal.toFixed(2), date: "" });
    totalRow2.font = { bold: true };
    totalRow2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };

    // Sheet 4: الفواتير الآجلة
    const pendingSheet = workbook.addWorksheet("فواتير آجلة");
    pendingSheet.columns = [
      { header: "المرجع", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "البونص المتوقع", key: "expectedBonus", width: 15 },
      { header: "الحالة", key: "status", width: 20 },
    ];
    styleHeader(pendingSheet);
    bonusData.pendingInvoices.forEach((inv: any) => {
      pendingSheet.addRow({
        reference: inv.reference,
        rep: getRepDisplayName(inv.rep),
        product: inv.product,
        quantity: inv.quantity,
        expectedBonus: inv.expectedBonus.toFixed(2),
        status: inv.status,
      });
    });

    // Sheet 5: تحليل المنتجات
    const productSheet = workbook.addWorksheet("تحليل المنتجات");
    productSheet.columns = [
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 12 },
      { header: "إجمالي المبيعات", key: "totalSales", width: 18 },
      { header: "إجمالي البونص", key: "totalBonus", width: 15 },
      { header: "عدد الفواتير", key: "invoiceCount", width: 15 },
    ];
    styleHeader(productSheet);
    
    // Aggregate by product
    const productMap = new Map<string, { quantity: number; totalSales: number; totalBonus: number; count: number }>();
    [...bonusData.undeliveredInvoices, ...bonusData.deliveredInvoices].forEach((inv: any) => {
      const existing = productMap.get(inv.product) || { quantity: 0, totalSales: 0, totalBonus: 0, count: 0 };
      existing.quantity += inv.quantity;
      existing.totalSales += inv.itemTotal;
      existing.totalBonus += inv.bonus;
      existing.count += 1;
      productMap.set(inv.product, existing);
    });
    productMap.forEach((data, product) => {
      productSheet.addRow({
        product,
        quantity: data.quantity,
        totalSales: data.totalSales.toFixed(2),
        totalBonus: data.totalBonus.toFixed(2),
        invoiceCount: data.count,
      });
    });

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `بونص-${selectedMonth}${selectedRep !== "all" ? `-${getRepDisplayName(selectedRep)}` : ""}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير البيانات بنجاح");
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
    const loginUrl = getLoginUrl();
    window.location.href = loginUrl;
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  const filteredUndelivered = bonusData ? filterByRep(bonusData.undeliveredInvoices) : [];
  const filteredDelivered = bonusData ? filterByRep(bonusData.deliveredInvoices) : [];
  const filteredPending = bonusData ? filterByRep(bonusData.pendingInvoices) : [];

  const filteredStats = bonusData ? {
    totalSales: [...filteredUndelivered, ...filteredDelivered].reduce((sum, inv: any) => sum + inv.itemTotal, 0),
    sales1: [...filteredUndelivered, ...filteredDelivered].filter((inv: any) => inv.percentage === 1).reduce((sum, inv: any) => sum + inv.itemTotal, 0),
    sales2: [...filteredUndelivered, ...filteredDelivered].filter((inv: any) => inv.percentage === 2).reduce((sum, inv: any) => sum + inv.itemTotal, 0),
    totalBonus: [...filteredUndelivered, ...filteredDelivered].reduce((sum, inv: any) => sum + inv.bonus, 0),
    deliveredBonus: filteredDelivered.reduce((sum: number, inv: any) => sum + inv.bonus, 0),
    undeliveredBonus: filteredUndelivered.reduce((sum: number, inv: any) => sum + inv.bonus, 0),
  } : null;

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

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-end mb-6">
          <div>
            <Label htmlFor="month" className="text-sm font-medium">اختر الشهر</Label>
            <Input
              id="month"
              type="month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setSelectedInvoices(new Set()); }}
              className="max-w-xs mt-1"
            />
          </div>
          <Button onClick={refreshData} disabled={invoicesLoading || clearCacheMutation.isPending} variant="outline">
            <RefreshCw className={`ml-2 h-4 w-4 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
            {clearCacheMutation.isPending ? "جاري التحديث..." : "تحديث البيانات"}
          </Button>
          {bonusData && (
            <>
              <div>
                <Label className="text-sm font-medium">المندوب</Label>
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="mt-1 block px-4 py-2 border rounded-md bg-white"
                >
                  <option value="all">جميع المناديب</option>
                  {uniqueReps.map((rep: string) => (
                    <option key={rep} value={rep}>{getRepDisplayName(rep)}</option>
                  ))}
                </select>
              </div>
              <Button onClick={exportToExcel} variant="secondary" className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                تصدير Excel
              </Button>
            </>
          )}
        </div>

        {/* Stats Cards */}
        {filteredStats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-gray-500 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3" /> إجمالي المبيعات
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold">{filteredStats.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs text-gray-500">ريال</span></div>
              </CardContent>
            </Card>
            <Card className="border-orange-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-orange-600">مبيعات 1%</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-orange-600">{filteredStats.sales1.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ريال</span></div>
              </CardContent>
            </Card>
            <Card className="border-green-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-green-600">مبيعات 2%</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-green-600">{filteredStats.sales2.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ريال</span></div>
              </CardContent>
            </Card>
            <Card className="border-blue-200">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-blue-600 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> إجمالي البونص
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-blue-600">{filteredStats.totalBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ريال</span></div>
              </CardContent>
            </Card>
            <Card className="border-emerald-300 bg-emerald-50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> بونص مسلم
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-emerald-700">{filteredStats.deliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ريال</span></div>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> بونص غير مسلم
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-bold text-red-600">{filteredStats.undeliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} <span className="text-xs">ريال</span></div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="undelivered" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="undelivered" className="gap-1">
              <Clock className="w-3 h-3" />
              بونص غير مسلم ({filteredUndelivered.length})
            </TabsTrigger>
            <TabsTrigger value="delivered" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              بونص مسلم ({filteredDelivered.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1">
              فواتير آجلة ({filteredPending.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: بونص غير مسلم */}
          <TabsContent value="undelivered">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">بونص غير مسلم - حدد الفواتير التي تم تسليم بونصها</CardTitle>
                {selectedInvoices.size > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      محدد: <strong>{selectedInvoices.size}</strong> | البونص: <strong className="text-blue-600">{selectedBonusTotal.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ريال</strong>
                    </span>
                    <Button 
                      onClick={deliverBonus} 
                      disabled={isDelivering}
                      className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {isDelivering ? "جاري التسليم..." : "تم التسليم"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse flex space-x-4">
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredUndelivered.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                    <p className="text-lg font-medium">جميع البونصات مسلمة</p>
                    <p className="text-sm">لا توجد فواتير بونص غير مسلم لهذا الشهر</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-2 w-10">
                            <Checkbox
                              checked={filteredUndelivered.length > 0 && filteredUndelivered.every((inv: any) => selectedInvoices.has(inv.uniqueKey))}
                              onCheckedChange={selectAllUndelivered}
                            />
                          </th>
                          <th className="text-right p-2">المرجع</th>
                          <th className="text-right p-2">المندوب</th>
                          <th className="text-right p-2">المنتج</th>
                          <th className="text-right p-2">الكمية</th>
                          <th className="text-right p-2">السعر</th>
                          <th className="text-right p-2">الإجمالي</th>
                          <th className="text-right p-2">الفئة</th>
                          <th className="text-right p-2">النسبة</th>
                          <th className="text-right p-2">البونص</th>
                          <th className="text-right p-2">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUndelivered.map((inv: any) => (
                          <tr 
                            key={inv.uniqueKey} 
                            className={`border-b hover:bg-gray-50 cursor-pointer ${selectedInvoices.has(inv.uniqueKey) ? 'bg-blue-50' : ''}`}
                            onClick={() => toggleInvoice(inv.uniqueKey)}
                          >
                            <td className="p-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedInvoices.has(inv.uniqueKey)}
                                onCheckedChange={() => toggleInvoice(inv.uniqueKey)}
                              />
                            </td>
                            <td className="p-2 font-mono text-xs">{inv.reference}</td>
                            <td className="p-2">{getRepDisplayName(inv.rep)}</td>
                            <td className="p-2">{inv.product}</td>
                            <td className="p-2">{inv.quantity}{inv.returnedQty > 0 && <span className="text-red-500 text-xs mr-1">(-{inv.returnedQty})</span>}</td>
                            <td className="p-2">{inv.price.toFixed(2)}</td>
                            <td className="p-2 font-medium">{inv.itemTotal.toFixed(2)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${inv.category === "تميز" ? "bg-green-100 text-green-700" : inv.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                {inv.category}
                              </span>
                            </td>
                            <td className="p-2">{inv.percentage}%</td>
                            <td className="p-2 font-semibold text-blue-600">{inv.bonus.toFixed(2)}</td>
                            <td className="p-2 text-xs text-gray-500">{inv.date}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 font-bold">
                          <td className="p-2" colSpan={6}></td>
                          <td className="p-2">{filteredUndelivered.reduce((s: number, i: any) => s + i.itemTotal, 0).toFixed(2)}</td>
                          <td className="p-2" colSpan={2}></td>
                          <td className="p-2 text-blue-600">{filteredUndelivered.reduce((s: number, i: any) => s + i.bonus, 0).toFixed(2)}</td>
                          <td className="p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: بونص مسلم */}
          <TabsContent value="delivered">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-emerald-700">بونص مسلم</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredDelivered.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium">لا توجد فواتير مسلمة بعد</p>
                    <p className="text-sm">حدد الفواتير من تبويب "بونص غير مسلم" ثم اضغط "تم التسليم"</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-emerald-50">
                          <th className="text-right p-2">المرجع</th>
                          <th className="text-right p-2">المندوب</th>
                          <th className="text-right p-2">المنتج</th>
                          <th className="text-right p-2">الكمية</th>
                          <th className="text-right p-2">السعر</th>
                          <th className="text-right p-2">الإجمالي</th>
                          <th className="text-right p-2">الفئة</th>
                          <th className="text-right p-2">النسبة</th>
                          <th className="text-right p-2">البونص</th>
                          <th className="text-right p-2">التاريخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDelivered.map((inv: any) => (
                          <tr key={inv.uniqueKey} className="border-b hover:bg-emerald-50/50">
                            <td className="p-2 font-mono text-xs">{inv.reference}</td>
                            <td className="p-2">{getRepDisplayName(inv.rep)}</td>
                            <td className="p-2">{inv.product}</td>
                            <td className="p-2">{inv.quantity}</td>
                            <td className="p-2">{inv.price.toFixed(2)}</td>
                            <td className="p-2 font-medium">{inv.itemTotal.toFixed(2)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-0.5 rounded text-xs ${inv.category === "تميز" ? "bg-green-100 text-green-700" : inv.category === "أساسي" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700"}`}>
                                {inv.category}
                              </span>
                            </td>
                            <td className="p-2">{inv.percentage}%</td>
                            <td className="p-2 font-semibold text-emerald-600">{inv.bonus.toFixed(2)}</td>
                            <td className="p-2 text-xs text-gray-500">{inv.date}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-emerald-100 font-bold">
                          <td className="p-2" colSpan={5}></td>
                          <td className="p-2">{filteredDelivered.reduce((s: number, i: any) => s + i.itemTotal, 0).toFixed(2)}</td>
                          <td className="p-2" colSpan={2}></td>
                          <td className="p-2 text-emerald-700">{filteredDelivered.reduce((s: number, i: any) => s + i.bonus, 0).toFixed(2)}</td>
                          <td className="p-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: فواتير آجلة */}
          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">الفواتير الآجلة (غير مدفوعة)</CardTitle>
              </CardHeader>
              <CardContent>
                {filteredPending.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <p className="text-lg font-medium">لا توجد فواتير آجلة</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-yellow-50">
                          <th className="text-right p-2">المرجع</th>
                          <th className="text-right p-2">المندوب</th>
                          <th className="text-right p-2">المنتج</th>
                          <th className="text-right p-2">الكمية</th>
                          <th className="text-right p-2">البونص المتوقع</th>
                          <th className="text-right p-2">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPending.map((inv: any, idx: number) => (
                          <tr key={idx} className="border-b hover:bg-yellow-50/50">
                            <td className="p-2 font-mono text-xs">{inv.reference}</td>
                            <td className="p-2">{getRepDisplayName(inv.rep)}</td>
                            <td className="p-2">{inv.product}</td>
                            <td className="p-2">{inv.quantity}</td>
                            <td className="p-2 font-semibold">{inv.expectedBonus.toFixed(2)}</td>
                            <td className="p-2">
                              <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">{inv.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
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
