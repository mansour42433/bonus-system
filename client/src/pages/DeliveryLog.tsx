import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  ArrowRight, RefreshCw, CheckCircle2, Undo2,
  FileDown, ClipboardList, Banknote, CreditCard, Building2,
  Calendar, User, AlertTriangle
} from "lucide-react";

const DELIVERY_METHOD_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  cash: { label: "نقد", icon: Banknote, color: "bg-green-100 text-green-700" },
  transfer: { label: "تحويل", icon: CreditCard, color: "bg-blue-100 text-blue-700" },
  cheque: { label: "شيك", icon: Building2, color: "bg-purple-100 text-purple-700" },
};

export default function DeliveryLog() {
  const { user, loading: authLoading } = useAuth();

  // Date filter
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
  const [undoConfirm, setUndoConfirm] = useState<{ invoiceId: number; repEmail: string; reference: string } | null>(null);

  const dateRange = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  // Fetch all delivered bonus payments
  const { data: deliveredData, isLoading, refetch } = trpc.bonusPayments.list.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    repEmail: undefined,
    status: "paid",
  });

  const { data: repsData } = trpc.reps.list.useQuery();

  const undoMutation = trpc.bonusPayments.undoDelivery.useMutation();

  const getRepDisplayName = useCallback((repEmail: string) => {
    const repSetting = repsData?.reps.find((r: any) => r.repEmail === repEmail);
    return repSetting?.repNickname || repEmail;
  }, [repsData]);

  // Filter by rep
  const filteredPayments = useMemo(() => {
    if (!deliveredData?.payments) return [];
    let payments = deliveredData.payments;
    if (selectedRep !== "all") {
      payments = payments.filter((p: any) => p.repEmail === selectedRep);
    }
    return payments;
  }, [deliveredData, selectedRep]);

  // Unique reps from payments
  const uniqueReps = useMemo(() => {
    if (!deliveredData?.payments) return [];
    return Array.from(new Set(deliveredData.payments.map((p: any) => p.repEmail)));
  }, [deliveredData]);

  // Summary stats
  const stats = useMemo(() => {
    const totalBonus = filteredPayments.reduce((s: number, p: any) => s + (p.bonusAmount || 0), 0);
    const totalSales = filteredPayments.reduce((s: number, p: any) => s + (p.invoiceAmount || 0), 0);
    const byMethod: Record<string, number> = {};
    filteredPayments.forEach((p: any) => {
      const method = p.deliveryMethod || "cash";
      byMethod[method] = (byMethod[method] || 0) + (p.bonusAmount || 0);
    });
    return { totalBonus, totalSales, count: filteredPayments.length, byMethod };
  }, [filteredPayments]);

  // Undo delivery
  const handleUndo = async () => {
    if (!undoConfirm) return;
    try {
      await undoMutation.mutateAsync([{ invoiceId: undoConfirm.invoiceId, repEmail: undoConfirm.repEmail }]);
      toast.success(`تم التراجع عن تسليم فاتورة ${undoConfirm.reference}`);
      setUndoConfirm(null);
      await refetch();
    } catch (error) {
      toast.error("فشل التراجع عن التسليم");
    }
  };

  // Export to Excel
  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("سجل التسليمات");

    ws.columns = [
      { header: "رقم الفاتورة", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 25 },
      { header: "مبلغ الفاتورة", key: "invoiceAmount", width: 15 },
      { header: "نسبة البونص", key: "percentage", width: 12 },
      { header: "مبلغ البونص", key: "bonusAmount", width: 15 },
      { header: "تاريخ الفاتورة", key: "invoiceDate", width: 14 },
      { header: "تاريخ الدفع", key: "paymentDate", width: 14 },
      { header: "تاريخ التسليم", key: "deliveryDate", width: 14 },
      { header: "آلية التسليم", key: "deliveryMethod", width: 12 },
      { header: "ملاحظات", key: "notes", width: 25 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
    ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 25;

    filteredPayments.forEach((p: any) => {
      const methodLabel = DELIVERY_METHOD_LABELS[p.deliveryMethod || "cash"]?.label || "نقد";
      ws.addRow({
        reference: p.invoiceReference,
        rep: getRepDisplayName(p.repEmail),
        invoiceAmount: (p.invoiceAmount || 0).toFixed(2),
        percentage: `${p.bonusPercentage || 0}%`,
        bonusAmount: (p.bonusAmount || 0).toFixed(2),
        invoiceDate: p.invoiceDate,
        paymentDate: p.paymentDate,
        deliveryDate: p.deliveryDate || p.bonusPaymentDate?.split("T")[0] || "—",
        deliveryMethod: methodLabel,
        notes: p.notes || "",
      });
    });

    const totalRow = ws.addRow({
      reference: "", rep: "الإجمالي", invoiceAmount: stats.totalSales.toFixed(2),
      percentage: "", bonusAmount: stats.totalBonus.toFixed(2),
      invoiceDate: "", paymentDate: "", deliveryDate: "", deliveryMethod: "", notes: "",
    });
    totalRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `سجل-التسليمات-${startDate}_${endDate}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير سجل التسليمات");
  };

  // Auth check
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

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* HEADER */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">سجل التسليمات</h1>
                <p className="text-[10px] text-gray-500">تاريخ جميع البونصات المسلمة للمناديب</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                تحديث
              </Button>
              <Button onClick={exportToExcel} disabled={filteredPayments.length === 0} variant="outline" size="sm" className="gap-1">
                <FileDown className="h-3.5 w-3.5" />
                تصدير Excel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* DATE FILTER */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">من تاريخ</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">إلى تاريخ</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">المندوب</label>
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-green-600 font-medium">إجمالي البونص المسلم</div>
              <div className="text-sm font-bold text-green-800">{stats.totalBonus.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-blue-600 font-medium">إجمالي المبيعات</div>
              <div className="text-sm font-bold text-blue-800">{stats.totalSales.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</div>
            </CardContent>
          </Card>
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-indigo-600 font-medium">عدد الفواتير المسلمة</div>
              <div className="text-sm font-bold text-indigo-800">{stats.count}</div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 bg-purple-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-purple-600 font-medium">آلية التسليم</div>
              <div className="flex justify-center gap-2 mt-1">
                {Object.entries(stats.byMethod).map(([method, amount]) => {
                  const info = DELIVERY_METHOD_LABELS[method] || DELIVERY_METHOD_LABELS.cash;
                  return (
                    <span key={method} className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${info.color}`}>
                      {info.label}: {(amount as number).toFixed(0)}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* LOADING */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل سجل التسليمات...</p>
          </div>
        )}

        {/* TABLE */}
        {!isLoading && (
          <Card>
            <CardContent className="p-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-right p-2 text-xs">رقم الفاتورة</th>
                      <th className="text-right p-2 text-xs">المندوب</th>
                      <th className="text-right p-2 text-xs">مبلغ الفاتورة</th>
                      <th className="text-right p-2 text-xs">النسبة</th>
                      <th className="text-right p-2 text-xs">البونص</th>
                      <th className="text-right p-2 text-xs">تاريخ الفاتورة</th>
                      <th className="text-right p-2 text-xs">تاريخ الدفع</th>
                      <th className="text-right p-2 text-xs">تاريخ التسليم</th>
                      <th className="text-right p-2 text-xs">آلية التسليم</th>
                      <th className="text-right p-2 text-xs">ملاحظات</th>
                      <th className="text-center p-2 text-xs">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-8 text-gray-400">
                          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                          <p className="text-sm font-medium">لا توجد تسليمات في هذه الفترة</p>
                        </td>
                      </tr>
                    ) : filteredPayments.map((p: any) => {
                      const methodInfo = DELIVERY_METHOD_LABELS[p.deliveryMethod || "cash"] || DELIVERY_METHOD_LABELS.cash;
                      const MethodIcon = methodInfo.icon;
                      return (
                        <tr key={`${p.invoiceId}-${p.repEmail}`} className="border-b hover:bg-gray-50/80 transition-colors">
                          <td className="p-2 font-mono text-xs">{p.invoiceReference}</td>
                          <td className="p-2 text-xs">{getRepDisplayName(p.repEmail)}</td>
                          <td className="p-2 text-xs">{(p.invoiceAmount || 0).toFixed(2)}</td>
                          <td className="p-2 text-xs">{p.bonusPercentage || 0}%</td>
                          <td className="p-2 text-xs font-medium text-green-700">{(p.bonusAmount || 0).toFixed(2)}</td>
                          <td className="p-2 text-xs">{p.invoiceDate}</td>
                          <td className="p-2 text-xs">{p.paymentDate}</td>
                          <td className="p-2 text-xs">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              {p.deliveryDate || p.bonusPaymentDate?.split("T")[0] || "—"}
                            </div>
                          </td>
                          <td className="p-2">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${methodInfo.color}`}>
                              <MethodIcon className="w-3 h-3" />
                              {methodInfo.label}
                            </span>
                          </td>
                          <td className="p-2 text-xs text-gray-500 max-w-[150px] truncate">{p.notes || "—"}</td>
                          <td className="p-2 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setUndoConfirm({ invoiceId: p.invoiceId, repEmail: p.repEmail, reference: p.invoiceReference })}
                              title="التراجع عن التسليم"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredPayments.length > 0 && (
                    <tfoot>
                      <tr className="bg-gray-100 font-bold text-xs">
                        <td className="p-2" colSpan={2}>الإجمالي</td>
                        <td className="p-2">{stats.totalSales.toFixed(2)}</td>
                        <td className="p-2"></td>
                        <td className="p-2 text-green-700">{stats.totalBonus.toFixed(2)}</td>
                        <td className="p-2" colSpan={6}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* UNDO CONFIRMATION MODAL */}
      {undoConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setUndoConfirm(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">تأكيد التراجع عن التسليم</h3>
                <p className="text-sm text-gray-500">فاتورة {undoConfirm.reference}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              هل أنت متأكد من التراجع عن تسليم بونص هذه الفاتورة؟ سيتم إرجاعها لقائمة "غير مسلم للمندوب".
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setUndoConfirm(null)}>إلغاء</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={handleUndo}
                disabled={undoMutation.isPending}
              >
                {undoMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin ml-2" />
                ) : (
                  <Undo2 className="h-4 w-4 ml-2" />
                )}
                تأكيد التراجع
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
