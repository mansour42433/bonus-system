import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link, useLocation } from "wouter";
import {
  ArrowRight, RefreshCw, Wallet, FileDown, Save,
  ClipboardList, Archive, Target
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
  paymentDate: string;
}

export default function Processing() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  // Date range filter (default: current month)
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  });
  const [selectedRep, setSelectedRep] = useState<string>("all");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const dateRange = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  // Fetch invoices by payment date
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } =
    trpc.qoyod.fetchInvoicesByPaymentDate.useQuery(dateRange, { enabled: true });

  const { data: paymentsData, refetch: refetchPayments } =
    trpc.qoyod.fetchInvoicePayments.useQuery(dateRange, { enabled: true });

  const { data: creditNotesData, refetch: refetchCreditNotes } =
    trpc.qoyod.fetchCreditNotes.useQuery(dateRange, { enabled: true });

  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();

  // Already saved bonus payments for this range (to exclude from saving again)
  const { data: existingPaymentsData, refetch: refetchExisting } =
    trpc.bonusPayments.list.useQuery({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      repEmail: undefined,
      status: undefined,
    });

  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const recordBonusMutation = trpc.bonusPayments.record.useMutation();
  const saveReportMutation = trpc.savedReports.save.useMutation();

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

    // Returned quantities
    const returnedQuantities = new Map<string, number>();
    creditNotes.forEach((cn: any) => {
      const invoiceId = creditNoteToInvoice.get(cn.id) || cn.invoice_id;
      if (invoiceId) {
        cn.line_items?.forEach((item: any) => {
          const key = `${invoiceId}-${item.product_id}`;
          const existing = returnedQuantities.get(key) || 0;
          returnedQuantities.set(key, existing + item.quantity);
        });
      }
    });

    let totalSales = 0, totalBonus = 0;
    const allRows: InvoiceRow[] = [];
    const processedKeys = new Set<string>();

    invoices.forEach((invoice: any) => {
      const paymentDate = paymentDates.get(invoice.id) || invoice.issue_date;

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

        allRows.push({
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
          paymentDate,
        });

        totalSales += itemTotal;
        totalBonus += bonus;
      });
    });

    return { totalSales, totalBonus, allRows };
  }, [invoicesData, settingsData, creditNotesData, paymentsData]);

  // ==================== ALREADY SAVED KEYS ====================
  const existingKeys = useMemo(() => {
    if (!existingPaymentsData?.payments) return new Set<string>();
    const keys = new Set<string>();
    existingPaymentsData.payments.forEach((p: any) => {
      keys.add(`${p.invoiceId}-${p.repEmail}`);
    });
    return keys;
  }, [existingPaymentsData]);

  // Split into new (not saved) and already saved
  const { newInvoices, savedInvoices } = useMemo(() => {
    if (!bonusData) return { newInvoices: [], savedInvoices: [] };
    const newOnes: InvoiceRow[] = [];
    const saved: InvoiceRow[] = [];
    bonusData.allRows.forEach((row) => {
      const key = `${row.invoiceId}-${row.rep}`;
      if (existingKeys.has(key)) {
        saved.push(row);
      } else {
        newOnes.push(row);
      }
    });
    return { newInvoices: newOnes, savedInvoices: saved };
  }, [bonusData, existingKeys]);

  // Unique reps
  const uniqueReps = useMemo(() => {
    return Array.from(new Set((bonusData?.allRows || []).map((r) => r.rep)));
  }, [bonusData]);

  // Filter by rep
  const filterByRep = useCallback((invoices: InvoiceRow[]) => {
    if (selectedRep === "all") return invoices;
    return invoices.filter((inv) => inv.rep === selectedRep);
  }, [selectedRep]);

  const filteredNew = filterByRep(newInvoices);
  const filteredSaved = filterByRep(savedInvoices);

  // ==================== SELECTION ====================
  const toggleSelect = (key: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedInvoices.size === filteredNew.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredNew.map((inv) => inv.uniqueKey)));
    }
  };

  // ==================== SAVE SELECTED (no delivery - just record) ====================
  const saveSelected = async () => {
    const selectedRows = filteredNew.filter((inv) => selectedInvoices.has(inv.uniqueKey));
    if (selectedRows.length === 0) {
      toast.error("يرجى تحديد فاتورة واحدة على الأقل");
      return;
    }

    setSaving(true);
    try {
      let savedCount = 0;
      let skippedCount = 0;

      for (const row of selectedRows) {
        try {
          await recordBonusMutation.mutateAsync({
            invoiceId: row.invoiceId,
            invoiceReference: row.reference,
            repEmail: row.rep,
            bonusAmount: row.bonus,
            bonusPercentage: row.percentage,
            invoiceAmount: row.itemTotal,
            invoiceDate: row.date,
            paymentDate: row.paymentDate,
            notes: undefined,
          });
          savedCount++;
        } catch (err: any) {
          if (err.message?.includes("Duplicate")) {
            skippedCount++;
          } else {
            throw err;
          }
        }
      }

      // Save report
      try {
        const allFiltered = filterByRep(bonusData?.allRows || []);
        const reportData = JSON.stringify({
          newSaved: selectedRows.map((inv) => ({
            invoiceId: inv.invoiceId, reference: inv.reference, rep: inv.rep,
            repName: getRepDisplayName(inv.rep), customer: inv.customer, product: inv.product,
            quantity: inv.quantity, returnedQty: inv.returnedQty, price: inv.price,
            itemTotal: inv.itemTotal, category: inv.category, percentage: inv.percentage,
            bonus: inv.bonus, date: inv.date, paymentDate: inv.paymentDate,
          })),
          previouslySaved: filteredSaved.map((inv) => ({
            invoiceId: inv.invoiceId, reference: inv.reference, rep: inv.rep,
            repName: getRepDisplayName(inv.rep), customer: inv.customer, product: inv.product,
            quantity: inv.quantity, returnedQty: inv.returnedQty, price: inv.price,
            itemTotal: inv.itemTotal, category: inv.category, percentage: inv.percentage,
            bonus: inv.bonus, date: inv.date, paymentDate: inv.paymentDate,
          })),
        });

        await saveReportMutation.mutateAsync({
          startDate, endDate, repFilter: selectedRep,
          totalInvoices: allFiltered.length,
          deliveredCount: filteredSaved.length,
          undeliveredCount: selectedRows.length,
          totalSales: allFiltered.reduce((s, i) => s + i.itemTotal, 0).toFixed(2),
          totalBonus: allFiltered.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          deliveredBonus: filteredSaved.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          undeliveredBonus: selectedRows.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          reportData,
        });
      } catch (reportErr) {
        console.warn("Failed to save report:", reportErr);
      }

      await refetchExisting();
      setSelectedInvoices(new Set());

      if (skippedCount > 0) {
        toast.success(`تم حفظ ${savedCount} فاتورة (تم تجاوز ${skippedCount} مكررة)`);
      } else {
        toast.success(`تم حفظ ${savedCount} فاتورة بنجاح — انتقل لسجل التسليمات لتسليم البونص`);
      }
    } catch (error: any) {
      toast.error("حدث خطأ أثناء الحفظ");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // Save and navigate to delivery log
  const saveAndGoToDelivery = async () => {
    await saveSelected();
    navigate("/delivery-log");
  };

  // ==================== REFRESH ====================
  const refreshData = async () => {
    try {
      await clearCacheMutation.mutateAsync();
      await Promise.all([refetchInvoices(), refetchPayments(), refetchCreditNotes(), refetchSettings(), refetchExisting()]);
      toast.success("تم تحديث البيانات بنجاح");
    } catch (error) {
      toast.error("فشل تحديث البيانات");
    }
  };

  // ==================== EXPORT ====================
  const exportToExcel = async () => {
    if (!bonusData) return;
    const workbook = new ExcelJS.Workbook();

    const styleHeader = (ws: ExcelJS.Worksheet, color = "FF1E40AF") => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 25;
    };

    const addSheet = (name: string, invoices: InvoiceRow[], color: string) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = [
        { header: "رقم الفاتورة", key: "reference", width: 15 },
        { header: "المندوب", key: "rep", width: 20 },
        { header: "العميل", key: "customer", width: 25 },
        { header: "المنتج", key: "product", width: 30 },
        { header: "الكمية", key: "quantity", width: 10 },
        { header: "مرتجع", key: "returnedQty", width: 10 },
        { header: "السعر", key: "price", width: 15 },
        { header: "الإجمالي", key: "total", width: 15 },
        { header: "الفئة", key: "category", width: 12 },
        { header: "النسبة", key: "percentage", width: 10 },
        { header: "البونص", key: "bonus", width: 12 },
        { header: "تاريخ الدفع", key: "paymentDate", width: 14 },
      ];
      styleHeader(ws, color);
      invoices.forEach((inv) => {
        ws.addRow({
          reference: inv.reference, rep: getRepDisplayName(inv.rep), customer: inv.customer,
          product: inv.product, quantity: inv.quantity, returnedQty: inv.returnedQty || 0,
          price: inv.price.toFixed(2), total: inv.itemTotal.toFixed(2), category: inv.category,
          percentage: `${inv.percentage}%`, bonus: inv.bonus.toFixed(2), paymentDate: inv.paymentDate,
        });
      });
      const totalRow = ws.addRow({
        reference: "", rep: "", customer: "", product: "الإجمالي",
        quantity: "", returnedQty: "", price: "",
        total: invoices.reduce((s, i) => s + i.itemTotal, 0).toFixed(2),
        category: "", percentage: "",
        bonus: invoices.reduce((s, i) => s + i.bonus, 0).toFixed(2), paymentDate: "",
      });
      totalRow.font = { bold: true };
    };

    // Summary sheet
    const summaryWs = workbook.addWorksheet("ملخص");
    summaryWs.columns = [
      { header: "المندوب", key: "rep", width: 25 },
      { header: "عدد الفواتير الجديدة", key: "newCount", width: 18 },
      { header: "عدد الفواتير المحفوظة", key: "savedCount", width: 18 },
      { header: "مبيعات جديدة", key: "newSales", width: 18 },
      { header: "بونص جديد", key: "newBonus", width: 15 },
      { header: "بونص محفوظ", key: "savedBonus", width: 15 },
    ];
    styleHeader(summaryWs, "FF1E40AF");

    const repSummary = new Map<string, { newCount: number; savedCount: number; newSales: number; newBonus: number; savedBonus: number }>();
    filteredNew.forEach((inv) => {
      const existing = repSummary.get(inv.rep) || { newCount: 0, savedCount: 0, newSales: 0, newBonus: 0, savedBonus: 0 };
      existing.newCount++;
      existing.newSales += inv.itemTotal;
      existing.newBonus += inv.bonus;
      repSummary.set(inv.rep, existing);
    });
    filteredSaved.forEach((inv) => {
      const existing = repSummary.get(inv.rep) || { newCount: 0, savedCount: 0, newSales: 0, newBonus: 0, savedBonus: 0 };
      existing.savedCount++;
      existing.savedBonus += inv.bonus;
      repSummary.set(inv.rep, existing);
    });
    repSummary.forEach((data, rep) => {
      summaryWs.addRow({
        rep: getRepDisplayName(rep), newCount: data.newCount, savedCount: data.savedCount,
        newSales: data.newSales.toFixed(2), newBonus: data.newBonus.toFixed(2), savedBonus: data.savedBonus.toFixed(2),
      });
    });

    addSheet("فواتير جديدة", filteredNew, "FF2563EB");
    addSheet("فواتير محفوظة سابقاً", filteredSaved, "FF059669");

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `معالجة-${startDate}_${endDate}${selectedRep !== "all" ? `-${getRepDisplayName(selectedRep)}` : ""}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير التقرير بنجاح");
  };

  // Computed values (must be before early returns)
  const newBonus = useMemo(() => filteredNew.reduce((s, i) => s + i.bonus, 0), [filteredNew]);
  const savedBonus = useMemo(() => filteredSaved.reduce((s, i) => s + i.bonus, 0), [filteredSaved]);
  const newSales = useMemo(() => filteredNew.reduce((s, i) => s + i.itemTotal, 0), [filteredNew]);
  const savedSales = useMemo(() => filteredSaved.reduce((s, i) => s + i.itemTotal, 0), [filteredSaved]);

  // Target progress
  const targetInfo = useMemo(() => {
    if (selectedRep === "all" || !repsData?.reps) return null;
    const rep = repsData.reps.find((r: any) => r.repEmail === selectedRep);
    if (!rep?.monthlyTarget || rep.monthlyTarget === 0) return null;
    const totalSales = newSales + savedSales;
    const progress = Math.min((totalSales / rep.monthlyTarget) * 100, 100);
    return { target: rep.monthlyTarget, totalSales, progress };
  }, [selectedRep, repsData, newSales, savedSales]);

  // ==================== AUTH CHECK ====================
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  // ==================== INVOICE TABLE ====================
  const InvoiceTable = ({ invoices, showCheckbox = false, emptyMessage = "لا توجد فواتير" }: {
    invoices: InvoiceRow[];
    showCheckbox?: boolean;
    emptyMessage?: string;
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            {showCheckbox && (
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedInvoices.size === filteredNew.length && filteredNew.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
            )}
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
            <th className="text-right p-2 text-xs">تاريخ الدفع</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 ? (
            <tr><td colSpan={showCheckbox ? 13 : 12} className="text-center py-8 text-gray-400">{emptyMessage}</td></tr>
          ) : invoices.map((inv) => (
            <tr key={inv.uniqueKey} className={`border-b hover:bg-gray-50/80 transition-colors ${showCheckbox && selectedInvoices.has(inv.uniqueKey) ? 'bg-blue-50' : ''}`}>
              {showCheckbox && (
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.has(inv.uniqueKey)}
                    onChange={() => toggleSelect(inv.uniqueKey)}
                    className="rounded border-gray-300"
                  />
                </td>
              )}
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
              <td className="p-2 text-[10px] text-gray-500">{inv.paymentDate}</td>
            </tr>
          ))}
        </tbody>
        {invoices.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-bold text-xs">
              {showCheckbox && <td className="p-2"></td>}
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

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-xl flex items-center justify-center shadow-md">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">معالجة وتصدير</h1>
                <p className="text-[10px] text-gray-500">حفظ الفواتير وتصدير التقارير</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href="/delivery-log">
                <Button variant="outline" size="sm" className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50">
                  <ClipboardList className="h-3.5 w-3.5" />
                  سجل التسليمات
                </Button>
              </Link>

              <Link href="/saved-reports">
                <Button variant="outline" size="sm" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-50">
                  <Archive className="h-3.5 w-3.5" />
                  التقارير المحفوظة
                </Button>
              </Link>

              <Button onClick={refreshData} disabled={clearCacheMutation.isPending} variant="outline" size="sm" className="gap-1">
                <RefreshCw className={`h-3.5 w-3.5 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
                تحديث
              </Button>

              <Button onClick={exportToExcel} disabled={!bonusData} variant="outline" size="sm" className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                تصدير Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Date Range Filter */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setSelectedInvoices(new Set()); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setSelectedInvoices(new Set()); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">المندوب</label>
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
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

        {/* Target Progress */}
        {targetInfo && (
          <Card className="mb-4 border-indigo-200 bg-indigo-50/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-medium text-indigo-700">التارجت الشهري: {targetInfo.target.toLocaleString("ar-SA")} ر.س</span>
                <span className="text-xs text-indigo-500 mr-auto">المبيعات: {targetInfo.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</span>
              </div>
              <div className="w-full bg-indigo-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${targetInfo.progress >= 100 ? 'bg-green-500' : targetInfo.progress >= 75 ? 'bg-indigo-600' : targetInfo.progress >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(targetInfo.progress, 100)}%` }}
                ></div>
              </div>
              <div className="text-[10px] text-indigo-600 mt-1 text-left">{targetInfo.progress.toFixed(1)}%</div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-blue-600 font-medium">إجمالي المبيعات</div>
              <div className="text-sm font-bold text-blue-800">{(newSales + savedSales).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-indigo-600 font-medium">إجمالي البونص</div>
              <div className="text-sm font-bold text-indigo-800">{(newBonus + savedBonus).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-amber-600 font-medium">فواتير جديدة</div>
              <div className="text-sm font-bold text-amber-800">{filteredNew.length} ({newBonus.toFixed(2)} ر.س)</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-green-600 font-medium">محفوظة سابقاً</div>
              <div className="text-sm font-bold text-green-800">{filteredSaved.length} ({savedBonus.toFixed(2)} ر.س)</div>
            </CardContent>
          </Card>
        </div>

        {/* Loading */}
        {invoicesLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل البيانات...</p>
          </div>
        )}

        {/* New Invoices (not yet saved) */}
        {!invoicesLoading && (
          <>
            <Card className="mb-4">
              <div className="flex items-center justify-between px-4 pt-3">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                  فواتير جديدة (لم تُحفظ بعد) — {filteredNew.length}
                </h2>
              </div>
              <CardContent className="p-3">
                <InvoiceTable invoices={filteredNew} showCheckbox={true} emptyMessage="جميع الفواتير محفوظة مسبقاً" />

                {filteredNew.length > 0 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      محدد: <span className="font-bold text-blue-600">{selectedInvoices.size}</span> من {filteredNew.length}
                      {selectedInvoices.size > 0 && (
                        <span className="mr-2">
                          — بونص: <span className="font-bold text-emerald-600">
                            {filteredNew.filter((inv) => selectedInvoices.has(inv.uniqueKey)).reduce((s, i) => s + i.bonus, 0).toFixed(2)} ر.س
                          </span>
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={saveSelected}
                        disabled={selectedInvoices.size === 0 || saving}
                        variant="outline"
                        className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      >
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        حفظ المحدد
                      </Button>
                      <Button
                        onClick={saveAndGoToDelivery}
                        disabled={selectedInvoices.size === 0 || saving}
                        className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                        حفظ والانتقال للتسليمات
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Already Saved Invoices */}
            {filteredSaved.length > 0 && (
              <Card>
                <div className="flex items-center justify-between px-4 pt-3">
                  <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    فواتير محفوظة سابقاً — {filteredSaved.length}
                  </h2>
                  <Link href="/delivery-log">
                    <Button variant="ghost" size="sm" className="text-xs text-blue-600 gap-1">
                      <ClipboardList className="w-3 h-3" />
                      عرض في سجل التسليمات
                    </Button>
                  </Link>
                </div>
                <CardContent className="p-3">
                  <InvoiceTable invoices={filteredSaved} showCheckbox={false} />
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
