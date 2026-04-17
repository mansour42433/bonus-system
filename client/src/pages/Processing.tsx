import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  ArrowRight, RefreshCw, CheckCircle2, Wallet,
  FileDown, Package2, Send, Archive
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
  const [deliveryTab, setDeliveryTab] = useState("undelivered");

  const dateRange = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  // Fetch invoices by payment date for this range
  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } =
    trpc.qoyod.fetchInvoicesByPaymentDate.useQuery(dateRange, { enabled: true });

  const { data: paymentsData, refetch: refetchPayments } =
    trpc.qoyod.fetchInvoicePayments.useQuery(dateRange, { enabled: true });

  const { data: creditNotesData, refetch: refetchCreditNotes } =
    trpc.qoyod.fetchCreditNotes.useQuery(dateRange, { enabled: true });

  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  const { data: repsData } = trpc.reps.list.useQuery();

  // Bonus payments (delivered records) for this range
  const { data: deliveredData, refetch: refetchDelivered } =
    trpc.bonusPayments.list.useQuery({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      repEmail: undefined,
      status: "paid",
    });

  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();
  const recordBonusMutation = trpc.bonusPayments.record.useMutation();
  const markAsPaidMutation = trpc.bonusPayments.markAsPaid.useMutation();
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

  // ==================== DELIVERED / UNDELIVERED ====================
  const deliveredInvoiceKeys = useMemo(() => {
    if (!deliveredData?.payments) return new Set<string>();
    const keys = new Set<string>();
    deliveredData.payments.forEach((p: any) => {
      keys.add(`${p.invoiceId}-${p.repEmail}`);
    });
    return keys;
  }, [deliveredData]);

  const { undeliveredInvoices, deliveredInvoices } = useMemo(() => {
    if (!bonusData) return { undeliveredInvoices: [], deliveredInvoices: [] };

    const undelivered: InvoiceRow[] = [];
    const delivered: InvoiceRow[] = [];

    bonusData.allRows.forEach((row) => {
      const key = `${row.invoiceId}-${row.rep}`;
      if (deliveredInvoiceKeys.has(key)) {
        delivered.push(row);
      } else {
        undelivered.push(row);
      }
    });

    return { undeliveredInvoices: undelivered, deliveredInvoices: delivered };
  }, [bonusData, deliveredInvoiceKeys]);

  // Unique reps
  const uniqueReps = useMemo(() => {
    return Array.from(new Set((bonusData?.allRows || []).map((r) => r.rep)));
  }, [bonusData]);

  // Filter by rep
  const filterByRep = useCallback((invoices: InvoiceRow[]) => {
    if (selectedRep === "all") return invoices;
    return invoices.filter((inv) => inv.rep === selectedRep);
  }, [selectedRep]);

  const filteredUndelivered = filterByRep(undeliveredInvoices);
  const filteredDelivered = filterByRep(deliveredInvoices);

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
    if (selectedInvoices.size === filteredUndelivered.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredUndelivered.map((inv) => inv.uniqueKey)));
    }
  };

  // ==================== SAVE & DELIVER ====================
  const saveAndDeliver = async () => {
    if (selectedInvoices.size === 0) {
      toast.error("يرجى تحديد فاتورة واحدة على الأقل");
      return;
    }

    const selectedRows = filteredUndelivered.filter((inv) => selectedInvoices.has(inv.uniqueKey));

    try {
      // Record each invoice bonus
      for (const row of selectedRows) {
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
      }

      // Mark as paid
      const markPayload = selectedRows.map((row) => ({
        invoiceId: row.invoiceId,
        repEmail: row.rep,
      }));
      await markAsPaidMutation.mutateAsync(markPayload);

      // Save report to database
      const allFiltered = filterByRep(bonusData?.allRows || []);
      const deliveredAfter = [...filteredDelivered, ...selectedRows];
      const undeliveredAfter = filteredUndelivered.filter((inv) => !selectedInvoices.has(inv.uniqueKey));

      const reportData = JSON.stringify({
        delivered: deliveredAfter.map((inv) => ({
          invoiceId: inv.invoiceId,
          reference: inv.reference,
          rep: inv.rep,
          repName: getRepDisplayName(inv.rep),
          customer: inv.customer,
          product: inv.product,
          quantity: inv.quantity,
          returnedQty: inv.returnedQty,
          price: inv.price,
          itemTotal: inv.itemTotal,
          category: inv.category,
          percentage: inv.percentage,
          bonus: inv.bonus,
          date: inv.date,
          paymentDate: inv.paymentDate,
        })),
        undelivered: undeliveredAfter.map((inv) => ({
          invoiceId: inv.invoiceId,
          reference: inv.reference,
          rep: inv.rep,
          repName: getRepDisplayName(inv.rep),
          customer: inv.customer,
          product: inv.product,
          quantity: inv.quantity,
          returnedQty: inv.returnedQty,
          price: inv.price,
          itemTotal: inv.itemTotal,
          category: inv.category,
          percentage: inv.percentage,
          bonus: inv.bonus,
          date: inv.date,
          paymentDate: inv.paymentDate,
        })),
      });

      try {
        await saveReportMutation.mutateAsync({
          startDate,
          endDate,
          repFilter: selectedRep,
          totalInvoices: allFiltered.length,
          deliveredCount: deliveredAfter.length,
          undeliveredCount: undeliveredAfter.length,
          totalSales: (deliveredAfter.reduce((s, i) => s + i.itemTotal, 0) + undeliveredAfter.reduce((s, i) => s + i.itemTotal, 0)).toFixed(2),
          totalBonus: (deliveredAfter.reduce((s, i) => s + i.bonus, 0) + undeliveredAfter.reduce((s, i) => s + i.bonus, 0)).toFixed(2),
          deliveredBonus: deliveredAfter.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          undeliveredBonus: undeliveredAfter.reduce((s, i) => s + i.bonus, 0).toFixed(2),
          reportData,
        });
      } catch (reportErr) {
        console.warn("Failed to save report, but delivery succeeded:", reportErr);
      }

      // Refresh
      await refetchDelivered();
      setSelectedInvoices(new Set());
      setDeliveryTab("delivered");

      toast.success(`تم تسليم بونص ${selectedRows.length} فاتورة وحفظ التقرير بنجاح`);
    } catch (error: any) {
      if (error.message?.includes("Duplicate")) {
        toast.warning("بعض الفواتير مسجلة مسبقاً، تم تجاوزها");
        await refetchDelivered();
        setSelectedInvoices(new Set());
      } else {
        toast.error("حدث خطأ أثناء تسليم البونص");
        console.error(error);
      }
    }
  };

  // ==================== REFRESH ====================
  const refreshData = async () => {
    try {
      await clearCacheMutation.mutateAsync();
      await Promise.all([refetchInvoices(), refetchPayments(), refetchCreditNotes(), refetchSettings(), refetchDelivered()]);
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

    addSheet("غير مسلم للمندوب", filterByRep(undeliveredInvoices), "FFDC2626");
    addSheet("مسلم للمندوب", filterByRep(deliveredInvoices), "FF059669");

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

  const undeliveredBonus = filteredUndelivered.reduce((s, i) => s + i.bonus, 0);
  const deliveredBonus = filteredDelivered.reduce((s, i) => s + i.bonus, 0);
  const undeliveredSales = filteredUndelivered.reduce((s, i) => s + i.itemTotal, 0);
  const deliveredSales = filteredDelivered.reduce((s, i) => s + i.itemTotal, 0);

  // ==================== INVOICE TABLE WITH CHECKBOXES ====================
  const InvoiceTableWithSelect = ({ invoices, showCheckbox = false }: {
    invoices: InvoiceRow[];
    showCheckbox?: boolean;
  }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            {showCheckbox && (
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={selectedInvoices.size === filteredUndelivered.length && filteredUndelivered.length > 0}
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
            <tr><td colSpan={showCheckbox ? 13 : 12} className="text-center py-8 text-gray-400">لا توجد فواتير</td></tr>
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
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            {/* Back + Title */}
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
                <p className="text-[10px] text-gray-500">تسليم البونص للمناديب</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
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
                تصدير
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* ===== DATE RANGE FILTER ===== */}
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

        {/* ===== STATS ===== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-blue-600 font-medium">إجمالي المبيعات</div>
              <div className="text-sm font-bold text-blue-800">{(undeliveredSales + deliveredSales).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-indigo-600 font-medium">إجمالي البونص</div>
              <div className="text-sm font-bold text-indigo-800">{(undeliveredBonus + deliveredBonus).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-green-600 font-medium">بونص مسلم</div>
              <div className="text-sm font-bold text-green-800">{deliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-orange-600 font-medium">بونص غير مسلم</div>
              <div className="text-sm font-bold text-orange-800">{undeliveredBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
        </div>

        {/* ===== LOADING ===== */}
        {invoicesLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل البيانات...</p>
          </div>
        )}

        {/* ===== DELIVERY TABS ===== */}
        {!invoicesLoading && (
          <Tabs value={deliveryTab} onValueChange={setDeliveryTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="undelivered" className="gap-1.5 text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                <Package2 className="w-3.5 h-3.5" />
                غير مسلم للمندوب ({filteredUndelivered.length})
              </TabsTrigger>
              <TabsTrigger value="delivered" className="gap-1.5 text-xs data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
                مسلم للمندوب ({filteredDelivered.length})
              </TabsTrigger>
            </TabsList>

            {/* غير مسلم */}
            <TabsContent value="undelivered">
              <Card>
                <CardContent className="p-3">
                  <InvoiceTableWithSelect invoices={filteredUndelivered} showCheckbox={true} />

                  {/* Action buttons */}
                  {filteredUndelivered.length > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        محدد: <span className="font-bold text-blue-600">{selectedInvoices.size}</span> من {filteredUndelivered.length} فاتورة
                        {selectedInvoices.size > 0 && (
                          <span className="mr-2">
                            — بونص: <span className="font-bold text-emerald-600">
                              {filteredUndelivered.filter((inv) => selectedInvoices.has(inv.uniqueKey)).reduce((s, i) => s + i.bonus, 0).toFixed(2)} ر.س
                            </span>
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={saveAndDeliver}
                        disabled={selectedInvoices.size === 0 || recordBonusMutation.isPending || markAsPaidMutation.isPending}
                        className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        {recordBonusMutation.isPending || markAsPaidMutation.isPending ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        حفظ وتسليم البونص
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* مسلم */}
            <TabsContent value="delivered">
              <Card>
                <CardContent className="p-3">
                  {filteredDelivered.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Package2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm font-medium">لم يتم تسليم أي بونص بعد</p>
                      <p className="text-xs">اختر فواتير من تبويب "غير مسلم" ثم اضغط "حفظ وتسليم"</p>
                    </div>
                  ) : (
                    <InvoiceTableWithSelect invoices={filteredDelivered} showCheckbox={false} />
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
