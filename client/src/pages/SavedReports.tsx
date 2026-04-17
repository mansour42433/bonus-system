import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import {
  ArrowRight, Archive, FileDown, Trash2, Calendar,
  CheckCircle2, Package2, RefreshCw
} from "lucide-react";

export default function SavedReports() {
  const { user, loading: authLoading } = useAuth();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data: reportsData, isLoading, refetch } = trpc.savedReports.list.useQuery();
  const deleteMutation = trpc.savedReports.delete.useMutation();

  const utils = trpc.useUtils();

  // Delete a report
  const handleDelete = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف هذا التقرير؟")) return;
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      await utils.savedReports.list.invalidate();
      toast.success("تم حذف التقرير بنجاح");
    } catch (error) {
      toast.error("فشل حذف التقرير");
    } finally {
      setDeletingId(null);
    }
  };

  // Download report as Excel
  const downloadReport = async (reportId: number) => {
    try {
      const result = await utils.savedReports.getById.fetch({ id: reportId });
      const report = result?.report;
      if (!report) {
        toast.error("لم يتم العثور على التقرير");
        return;
      }

      const data = JSON.parse(report.reportData);
      const workbook = new ExcelJS.Workbook();

      const styleHeader = (ws: ExcelJS.Worksheet, color = "FF1E40AF") => {
        ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
        ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
        ws.getRow(1).height = 25;
      };

      const addSheet = (name: string, invoices: any[], color: string) => {
        const ws = workbook.addWorksheet(name);
        ws.columns = [
          { header: "رقم الفاتورة", key: "reference", width: 15 },
          { header: "المندوب", key: "repName", width: 20 },
          { header: "العميل", key: "customer", width: 25 },
          { header: "المنتج", key: "product", width: 30 },
          { header: "الكمية", key: "quantity", width: 10 },
          { header: "مرتجع", key: "returnedQty", width: 10 },
          { header: "السعر", key: "price", width: 15 },
          { header: "الإجمالي", key: "itemTotal", width: 15 },
          { header: "الفئة", key: "category", width: 12 },
          { header: "النسبة", key: "percentage", width: 10 },
          { header: "البونص", key: "bonus", width: 12 },
          { header: "تاريخ الإصدار", key: "paymentDate", width: 14 },
        ];
        styleHeader(ws, color);
        invoices.forEach((inv: any) => {
          ws.addRow({
            reference: inv.reference,
            repName: inv.repName || inv.rep,
            customer: inv.customer,
            product: inv.product,
            quantity: inv.quantity,
            returnedQty: inv.returnedQty || 0,
            price: Number(inv.price).toFixed(2),
            itemTotal: Number(inv.itemTotal).toFixed(2),
            category: inv.category,
            percentage: `${inv.percentage}%`,
            bonus: Number(inv.bonus).toFixed(2),
            paymentDate: inv.paymentDate,
          });
        });
        if (invoices.length > 0) {
          const totalRow = ws.addRow({
            reference: "", repName: "", customer: "", product: "الإجمالي",
            quantity: "", returnedQty: "", price: "",
            itemTotal: invoices.reduce((s: number, i: any) => s + Number(i.itemTotal), 0).toFixed(2),
            category: "", percentage: "",
            bonus: invoices.reduce((s: number, i: any) => s + Number(i.bonus), 0).toFixed(2),
            paymentDate: "",
          });
          totalRow.font = { bold: true };
        }
      };

      // Add summary sheet
      const summaryWs = workbook.addWorksheet("ملخص التقرير");
      summaryWs.columns = [
        { header: "البيان", key: "label", width: 30 },
        { header: "القيمة", key: "value", width: 25 },
      ];
      styleHeader(summaryWs, "FF374151");
      summaryWs.addRow({ label: "الفترة", value: `${report.startDate} إلى ${report.endDate}` });
      summaryWs.addRow({ label: "المندوب", value: report.repFilter === "all" ? "جميع المناديب" : report.repFilter });
      summaryWs.addRow({ label: "إجمالي الفواتير", value: report.totalInvoices });
      summaryWs.addRow({ label: "فواتير مسلمة", value: report.deliveredCount });
      summaryWs.addRow({ label: "فواتير غير مسلمة", value: report.undeliveredCount });
      summaryWs.addRow({ label: "إجمالي المبيعات", value: `${report.totalSales} ر.س` });
      summaryWs.addRow({ label: "إجمالي البونص", value: `${report.totalBonus} ر.س` });
      summaryWs.addRow({ label: "بونص مسلم", value: `${report.deliveredBonus} ر.س` });
      summaryWs.addRow({ label: "بونص غير مسلم", value: `${report.undeliveredBonus} ر.س` });
      summaryWs.addRow({ label: "تاريخ إنشاء التقرير", value: new Date(report.createdAt).toLocaleString("ar-SA") });

      // Add delivered sheet
      if (data.delivered && data.delivered.length > 0) {
        addSheet("مسلم للمندوب", data.delivered, "FF059669");
      }

      // Add undelivered sheet
      if (data.undelivered && data.undelivered.length > 0) {
        addSheet("غير مسلم للمندوب", data.undelivered, "FFDC2626");
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `تقرير-${report.startDate}_${report.endDate}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("تم تحميل التقرير بنجاح");
    } catch (error) {
      console.error(error);
      toast.error("فشل تحميل التقرير");
    }
  };

  // ==================== AUTH CHECK ====================
  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  const reports = reportsData?.reports || [];

  // ==================== RENDER ====================
  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-3">
              <Link href="/processing">
                <Button variant="ghost" size="sm" className="gap-1">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-violet-700 rounded-xl flex items-center justify-center shadow-md">
                <Archive className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">التقارير المحفوظة</h1>
                <p className="text-[10px] text-gray-500">جميع تقارير البونص المحفوظة</p>
              </div>
            </div>

            <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              تحديث
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-3"></div>
            <p className="text-sm text-gray-500">جاري تحميل التقارير...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <Archive className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">لا توجد تقارير محفوظة</h3>
            <p className="text-sm text-gray-400 mb-4">عند تسليم البونص من صفحة المعالجة، يتم حفظ تقرير تلقائياً هنا</p>
            <Link href="/processing">
              <Button className="gap-1.5 bg-purple-600 hover:bg-purple-700">
                <ArrowRight className="h-4 w-4 rotate-180" />
                الذهاب للمعالجة
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Reports count */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500">إجمالي التقارير: <span className="font-bold text-gray-800">{reports.length}</span></span>
            </div>

            {/* Reports table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-right p-3 text-xs font-medium text-gray-600">#</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">الفترة</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">المندوب</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">الفواتير</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">مسلم</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">غير مسلم</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">إجمالي المبيعات</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">إجمالي البونص</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">بونص مسلم</th>
                        <th className="text-right p-3 text-xs font-medium text-gray-600">تاريخ الإنشاء</th>
                        <th className="text-center p-3 text-xs font-medium text-gray-600">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report: any, idx: number) => (
                        <tr key={report.id} className="border-b hover:bg-gray-50/80 transition-colors">
                          <td className="p-3 text-xs text-gray-400">{idx + 1}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs font-mono">{report.startDate}</span>
                              <span className="text-xs text-gray-400">→</span>
                              <span className="text-xs font-mono">{report.endDate}</span>
                            </div>
                          </td>
                          <td className="p-3 text-xs">{report.repFilter === "all" ? "الكل" : report.repFilter}</td>
                          <td className="p-3 text-xs font-medium">{report.totalInvoices}</td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px]">
                              <CheckCircle2 className="w-3 h-3" />
                              {report.deliveredCount}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px]">
                              <Package2 className="w-3 h-3" />
                              {report.undeliveredCount}
                            </span>
                          </td>
                          <td className="p-3 text-xs">{Number(report.totalSales).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                          <td className="p-3 text-xs font-semibold text-blue-600">{Number(report.totalBonus).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                          <td className="p-3 text-xs text-emerald-600 font-medium">{Number(report.deliveredBonus).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</td>
                          <td className="p-3 text-[10px] text-gray-500">{new Date(report.createdAt).toLocaleString("ar-SA")}</td>
                          <td className="p-3">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                onClick={() => downloadReport(report.id)}
                                variant="outline"
                                size="sm"
                                className="gap-1 h-7 text-[10px] border-blue-300 text-blue-700 hover:bg-blue-50"
                              >
                                <FileDown className="h-3 w-3" />
                                تحميل
                              </Button>
                              <Button
                                onClick={() => handleDelete(report.id)}
                                disabled={deletingId === report.id}
                                variant="outline"
                                size="sm"
                                className="gap-1 h-7 text-[10px] border-red-300 text-red-700 hover:bg-red-50"
                              >
                                {deletingId === report.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                حذف
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
