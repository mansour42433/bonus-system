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
  ArrowRight, RefreshCw, CheckCircle2, Package2,
  FileDown, Send, Undo2, AlertTriangle, ClipboardList,
  Banknote, CreditCard, Building2, Calendar, User
} from "lucide-react";

export default function DeliveryLog() {
  const { user, loading: authLoading } = useAuth();

  // Filters
  const [filterRep, setFilterRep] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all"); // all, paid, unpaid

  // Delivery dialog
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"cash" | "transfer" | "cheque">("cash");
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [selectedForDelivery, setSelectedForDelivery] = useState<Set<string>>(new Set());

  // Undo dialog
  const [undoConfirm, setUndoConfirm] = useState<{ invoiceId: number; repEmail: string; reference: string } | null>(null);

  // Fetch ALL bonus payments (no date filter - show everything)
  const { data: allPaymentsData, isLoading, refetch: refetchPayments } =
    trpc.bonusPayments.list.useQuery({
      status: undefined,
      startDate: undefined,
      endDate: undefined,
      repEmail: undefined,
    });

  const { data: repsData } = trpc.reps.list.useQuery();

  const markAsPaidMutation = trpc.bonusPayments.markAsPaid.useMutation();
  const undoMutation = trpc.bonusPayments.undoDelivery.useMutation();

  // Helper: rep display name
  const getRepDisplayName = useCallback((repEmail: string) => {
    const repSetting = repsData?.reps.find((r: any) => r.repEmail === repEmail);
    return repSetting?.repNickname || repEmail;
  }, [repsData]);

  // Delivery method label
  const getDeliveryMethodLabel = (method: string | null) => {
    switch (method) {
      case "cash": return "نقد";
      case "transfer": return "تحويل";
      case "cheque": return "شيك";
      default: return "—";
    }
  };

  // All payments
  const allPayments = useMemo(() => {
    return allPaymentsData?.payments || [];
  }, [allPaymentsData]);

  // Unique reps from payments
  const uniqueReps = useMemo(() => {
    return Array.from(new Set(allPayments.map((p: any) => p.repEmail)));
  }, [allPayments]);

  // Filter payments
  const filteredPayments = useMemo(() => {
    let result = allPayments;
    if (filterRep !== "all") {
      result = result.filter((p: any) => p.repEmail === filterRep);
    }
    if (filterStatus !== "all") {
      result = result.filter((p: any) => p.status === filterStatus);
    }
    return result;
  }, [allPayments, filterRep, filterStatus]);

  // Split into delivered/undelivered
  const undeliveredPayments = useMemo(() => filteredPayments.filter((p: any) => p.status === "unpaid"), [filteredPayments]);
  const deliveredPayments = useMemo(() => filteredPayments.filter((p: any) => p.status === "paid"), [filteredPayments]);

  // Stats
  const totalUndeliveredBonus = useMemo(() => undeliveredPayments.reduce((s: number, p: any) => s + (p.bonusAmount || 0), 0), [undeliveredPayments]);
  const totalDeliveredBonus = useMemo(() => deliveredPayments.reduce((s: number, p: any) => s + (p.bonusAmount || 0), 0), [deliveredPayments]);

  // Selection for delivery
  const toggleSelect = (key: string) => {
    setSelectedForDelivery(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedForDelivery.size === undeliveredPayments.length) {
      setSelectedForDelivery(new Set());
    } else {
      setSelectedForDelivery(new Set(undeliveredPayments.map((p: any) => `${p.invoiceId}-${p.repEmail}`)));
    }
  };

  // Open delivery dialog
  const openDeliveryDialog = () => {
    if (selectedForDelivery.size === 0) {
      toast.error("يرجى تحديد فاتورة واحدة على الأقل");
      return;
    }
    setDeliveryDate(new Date().toISOString().split("T")[0]);
    setDeliveryMethod("cash");
    setDeliveryNotes("");
    setShowDeliveryDialog(true);
  };

  // Deliver selected
  const handleDeliver = async () => {
    const selectedItems = undeliveredPayments.filter((p: any) => selectedForDelivery.has(`${p.invoiceId}-${p.repEmail}`));
    try {
      const items = selectedItems.map((p: any) => ({ invoiceId: p.invoiceId, repEmail: p.repEmail }));
      await markAsPaidMutation.mutateAsync({ items, deliveryMethod, deliveryDate, notes: deliveryNotes });
      toast.success(`تم تسليم بونص ${selectedItems.length} فاتورة بنجاح`);
      setShowDeliveryDialog(false);
      setSelectedForDelivery(new Set());
      await refetchPayments();
    } catch (error) {
      toast.error("فشل تسليم البونص");
      console.error(error);
    }
  };

  // Undo delivery
  const handleUndo = async () => {
    if (!undoConfirm) return;
    try {
      await undoMutation.mutateAsync([{ invoiceId: undoConfirm.invoiceId, repEmail: undoConfirm.repEmail }]);
      toast.success(`تم التراجع عن تسليم فاتورة ${undoConfirm.reference}`);
      setUndoConfirm(null);
      await refetchPayments();
    } catch (error) {
      toast.error("فشل التراجع عن التسليم");
    }
  };

  // Export to Excel
  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    const styleHeader = (ws: ExcelJS.Worksheet, color = "FF1E40AF") => {
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(1).height = 25;
    };

    const addSheet = (name: string, payments: any[], color: string) => {
      const ws = workbook.addWorksheet(name);
      ws.columns = [
        { header: "رقم الفاتورة", key: "reference", width: 15 },
        { header: "المندوب", key: "rep", width: 20 },
        { header: "مبلغ الفاتورة", key: "invoiceAmount", width: 15 },
        { header: "النسبة", key: "percentage", width: 10 },
        { header: "البونص", key: "bonus", width: 12 },
        { header: "تاريخ الفاتورة", key: "invoiceDate", width: 14 },
        { header: "تاريخ الدفع", key: "paymentDate", width: 14 },
        { header: "آلية التسليم", key: "deliveryMethod", width: 14 },
        { header: "تاريخ التسليم", key: "deliveryDate", width: 14 },
        { header: "ملاحظات", key: "notes", width: 25 },
      ];
      styleHeader(ws, color);
      payments.forEach((p: any) => {
        ws.addRow({
          reference: p.invoiceReference,
          rep: getRepDisplayName(p.repEmail),
          invoiceAmount: p.invoiceAmount,
          percentage: `${p.bonusPercentage}%`,
          bonus: p.bonusAmount,
          invoiceDate: p.invoiceDate,
          paymentDate: p.paymentDate,
          deliveryMethod: getDeliveryMethodLabel(p.deliveryMethod),
          deliveryDate: p.deliveryDate || "—",
          notes: p.notes || "",
        });
      });
      const totalRow = ws.addRow({
        reference: "", rep: "", invoiceAmount: payments.reduce((s: number, p: any) => s + (p.invoiceAmount || 0), 0),
        percentage: "", bonus: payments.reduce((s: number, p: any) => s + (p.bonusAmount || 0), 0),
        invoiceDate: "", paymentDate: "", deliveryMethod: "", deliveryDate: "", notes: "الإجمالي",
      });
      totalRow.font = { bold: true };
    };

    addSheet("غير مسلم", undeliveredPayments, "FFDC2626");
    addSheet("مسلم", deliveredPayments, "FF059669");

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `سجل-التسليمات${filterRep !== "all" ? `-${getRepDisplayName(filterRep)}` : ""}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير سجل التسليمات");
  };

  // Auth check
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

  const selectedBonus = undeliveredPayments
    .filter((p: any) => selectedForDelivery.has(`${p.invoiceId}-${p.repEmail}`))
    .reduce((s: number, p: any) => s + (p.bonusAmount || 0), 0);

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
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-md">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">سجل التسليمات</h1>
                <p className="text-[10px] text-gray-500">إدارة تسليم البونص للمناديب</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={() => refetchPayments()} variant="outline" size="sm" className="gap-1">
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
        {/* Filters */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <User className="w-3 h-3 inline ml-1" />
                  المندوب
                </label>
                <select
                  value={filterRep}
                  onChange={(e) => setFilterRep(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500"
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

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-blue-600 font-medium">إجمالي السجلات</div>
              <div className="text-sm font-bold text-blue-800">{filteredPayments.length}</div>
            </CardContent>
          </Card>
          <Card className="border-orange-200 bg-orange-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-orange-600 font-medium">غير مسلم</div>
              <div className="text-sm font-bold text-orange-800">{undeliveredPayments.length} ({totalUndeliveredBonus.toFixed(2)} ر.س)</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-green-600 font-medium">مسلم</div>
              <div className="text-sm font-bold text-green-800">{deliveredPayments.length} ({totalDeliveredBonus.toFixed(2)} ر.س)</div>
            </CardContent>
          </Card>
          <Card className="border-indigo-200 bg-indigo-50/50">
            <CardContent className="p-3 text-center">
              <div className="text-[10px] text-indigo-600 font-medium">إجمالي البونص</div>
              <div className="text-sm font-bold text-indigo-800">{(totalUndeliveredBonus + totalDeliveredBonus).toFixed(2)} ر.س</div>
            </CardContent>
          </Card>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل البيانات...</p>
          </div>
        )}

        {/* Tabs: Undelivered / Delivered */}
        {!isLoading && (
          <Tabs defaultValue="undelivered" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="undelivered" className="gap-1.5 text-xs data-[state=active]:bg-orange-500 data-[state=active]:text-white">
                <Package2 className="w-3.5 h-3.5" />
                غير مسلم للمندوب ({undeliveredPayments.length})
              </TabsTrigger>
              <TabsTrigger value="delivered" className="gap-1.5 text-xs data-[state=active]:bg-green-600 data-[state=active]:text-white">
                <CheckCircle2 className="w-3.5 h-3.5" />
                مسلم للمندوب ({deliveredPayments.length})
              </TabsTrigger>
            </TabsList>

            {/* Undelivered Tab */}
            <TabsContent value="undelivered">
              <Card>
                <CardContent className="p-3">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={selectedForDelivery.size === undeliveredPayments.length && undeliveredPayments.length > 0}
                              onChange={toggleSelectAll}
                              className="rounded border-gray-300"
                            />
                          </th>
                          <th className="text-right p-2 text-xs">رقم الفاتورة</th>
                          <th className="text-right p-2 text-xs">المندوب</th>
                          <th className="text-right p-2 text-xs">مبلغ الفاتورة</th>
                          <th className="text-right p-2 text-xs">النسبة</th>
                          <th className="text-right p-2 text-xs">البونص</th>
                          <th className="text-right p-2 text-xs">تاريخ الفاتورة</th>
                          <th className="text-right p-2 text-xs">تاريخ الدفع</th>
                          <th className="text-right p-2 text-xs">تاريخ الحفظ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {undeliveredPayments.length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-8 text-gray-400">
                            <Package2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm font-medium">لا توجد فواتير غير مسلمة</p>
                            <p className="text-xs">استخدم صفحة المعالجة لحفظ الفواتير هنا</p>
                          </td></tr>
                        ) : undeliveredPayments.map((p: any) => {
                          const key = `${p.invoiceId}-${p.repEmail}`;
                          return (
                            <tr key={key} className={`border-b hover:bg-gray-50/80 transition-colors ${selectedForDelivery.has(key) ? 'bg-blue-50' : ''}`}>
                              <td className="p-2">
                                <input
                                  type="checkbox"
                                  checked={selectedForDelivery.has(key)}
                                  onChange={() => toggleSelect(key)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="p-2 font-mono text-xs">{p.invoiceReference}</td>
                              <td className="p-2 text-xs">{getRepDisplayName(p.repEmail)}</td>
                              <td className="p-2 text-xs">{Number(p.invoiceAmount).toFixed(2)}</td>
                              <td className="p-2 text-xs">{p.bonusPercentage}%</td>
                              <td className="p-2 text-xs font-semibold text-blue-600">{Number(p.bonusAmount).toFixed(2)}</td>
                              <td className="p-2 text-[10px] text-gray-500">{p.invoiceDate}</td>
                              <td className="p-2 text-[10px] text-gray-500">{p.paymentDate}</td>
                              <td className="p-2 text-[10px] text-gray-500">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("ar-SA") : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {undeliveredPayments.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-100 font-bold text-xs">
                            <td className="p-2"></td>
                            <td className="p-2" colSpan={2}></td>
                            <td className="p-2">{undeliveredPayments.reduce((s: number, p: any) => s + Number(p.invoiceAmount || 0), 0).toFixed(2)}</td>
                            <td className="p-2"></td>
                            <td className="p-2 text-blue-600">{totalUndeliveredBonus.toFixed(2)}</td>
                            <td className="p-2" colSpan={3}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Delivery action */}
                  {undeliveredPayments.length > 0 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <div className="text-sm text-gray-600">
                        محدد: <span className="font-bold text-blue-600">{selectedForDelivery.size}</span> من {undeliveredPayments.length}
                        {selectedForDelivery.size > 0 && (
                          <span className="mr-2">
                            — بونص: <span className="font-bold text-emerald-600">{selectedBonus.toFixed(2)} ر.س</span>
                          </span>
                        )}
                      </div>
                      <Button
                        onClick={openDeliveryDialog}
                        disabled={selectedForDelivery.size === 0}
                        className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        <Send className="h-4 w-4" />
                        تسليم البونص
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Delivered Tab */}
            <TabsContent value="delivered">
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
                          <th className="text-right p-2 text-xs">آلية التسليم</th>
                          <th className="text-right p-2 text-xs">تاريخ التسليم</th>
                          <th className="text-right p-2 text-xs">ملاحظات</th>
                          <th className="text-right p-2 text-xs w-20">إجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveredPayments.length === 0 ? (
                          <tr><td colSpan={9} className="text-center py-8 text-gray-400">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                            <p className="text-sm font-medium">لم يتم تسليم أي بونص بعد</p>
                          </td></tr>
                        ) : deliveredPayments.map((p: any) => (
                          <tr key={`${p.invoiceId}-${p.repEmail}`} className="border-b hover:bg-gray-50/80 transition-colors">
                            <td className="p-2 font-mono text-xs">{p.invoiceReference}</td>
                            <td className="p-2 text-xs">{getRepDisplayName(p.repEmail)}</td>
                            <td className="p-2 text-xs">{Number(p.invoiceAmount).toFixed(2)}</td>
                            <td className="p-2 text-xs">{p.bonusPercentage}%</td>
                            <td className="p-2 text-xs font-semibold text-green-600">{Number(p.bonusAmount).toFixed(2)}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                p.deliveryMethod === "cash" ? "bg-green-100 text-green-700" :
                                p.deliveryMethod === "transfer" ? "bg-blue-100 text-blue-700" :
                                p.deliveryMethod === "cheque" ? "bg-purple-100 text-purple-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {getDeliveryMethodLabel(p.deliveryMethod)}
                              </span>
                            </td>
                            <td className="p-2 text-[10px] text-gray-500">{p.deliveryDate || "—"}</td>
                            <td className="p-2 text-[10px] text-gray-500 max-w-[150px] truncate">{p.notes || "—"}</td>
                            <td className="p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 gap-1"
                                onClick={() => setUndoConfirm({ invoiceId: p.invoiceId, repEmail: p.repEmail, reference: p.invoiceReference })}
                              >
                                <Undo2 className="w-3 h-3" />
                                تراجع
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {deliveredPayments.length > 0 && (
                        <tfoot>
                          <tr className="bg-gray-100 font-bold text-xs">
                            <td className="p-2" colSpan={2}></td>
                            <td className="p-2">{deliveredPayments.reduce((s: number, p: any) => s + Number(p.invoiceAmount || 0), 0).toFixed(2)}</td>
                            <td className="p-2"></td>
                            <td className="p-2 text-green-600">{totalDeliveredBonus.toFixed(2)}</td>
                            <td className="p-2" colSpan={4}></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Delivery Confirmation Dialog */}
      {showDeliveryDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowDeliveryDialog(false)}>
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <Send className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">تأكيد تسليم البونص</h3>
                <p className="text-sm text-gray-500">{selectedForDelivery.size} فاتورة محددة</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">إجمالي البونص:</span>
                <span className="font-bold text-emerald-700">{selectedBonus.toFixed(2)} ر.س</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">عدد الفواتير:</span>
                <span className="font-bold">{selectedForDelivery.size}</span>
              </div>
            </div>

            {/* Delivery Method */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">آلية التسليم</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "cash" as const, label: "نقد", icon: Banknote, color: "border-green-500 bg-green-50 text-green-700" },
                  { value: "transfer" as const, label: "تحويل", icon: CreditCard, color: "border-blue-500 bg-blue-50 text-blue-700" },
                  { value: "cheque" as const, label: "شيك", icon: Building2, color: "border-purple-500 bg-purple-50 text-purple-700" },
                ].map((method) => {
                  const Icon = method.icon;
                  return (
                    <button
                      key={method.value}
                      onClick={() => setDeliveryMethod(method.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${
                        deliveryMethod === method.value ? method.color : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{method.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Delivery Date */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">تاريخ التسليم</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Notes */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات (اختياري)</label>
              <textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 h-20 resize-none"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowDeliveryDialog(false)}>إلغاء</Button>
              <Button
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 gap-1.5"
                onClick={handleDeliver}
                disabled={markAsPaidMutation.isPending}
              >
                {markAsPaidMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                تأكيد التسليم
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Confirmation Dialog */}
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
              هل أنت متأكد من التراجع عن تسليم بونص هذه الفاتورة؟ سيتم إرجاعها لقائمة "غير مسلم".
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setUndoConfirm(null)}>إلغاء</Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                onClick={handleUndo}
                disabled={undoMutation.isPending}
              >
                {undoMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Undo2 className="h-4 w-4" />
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
