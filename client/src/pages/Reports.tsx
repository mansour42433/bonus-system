import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import * as XLSX from "xlsx";

export default function Reports() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState("2026-02-01");
  const [endDate, setEndDate] = useState("2026-02-28");
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [bonusStatus, setBonusStatus] = useState<"all" | "paid" | "unpaid">("unpaid");



  if (!user) {
    const loginUrl = getLoginUrl();
    window.location.href = loginUrl;
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  // Fetch bonus payments
  const { data: bonusData, isLoading: bonusLoading } = trpc.bonusPayments.list.useQuery({
    startDate,
    endDate,
    repEmail: selectedRep || undefined,
    status: bonusStatus === "all" ? undefined : bonusStatus,
  });

  // Fetch bonus summary
  const { data: summaryData } = trpc.bonusPayments.summary.useQuery({
    startDate,
    endDate,
    repEmail: selectedRep || undefined,
  });

  // Fetch invoices for product analysis (by issue date)
  const { data: invoicesData } = trpc.qoyod.fetchInvoices.useQuery({
    startDate,
    endDate,
  });

  const payments = bonusData?.payments || [];
  const summary = summaryData || { paid: 0, unpaid: 0, total: 0 };

  // Calculate product statistics
  const productStats = new Map<string, { quantity: number; total: number; count: number }>();
  invoicesData?.invoices?.forEach((inv: any) => {
    inv.items?.forEach((item: any) => {
      const key = item.name || "منتج غير معروف";
      const current = productStats.get(key) || { quantity: 0, total: 0, count: 0 };
      productStats.set(key, {
        quantity: current.quantity + (item.quantity || 0),
        total: current.total + (item.total || 0),
        count: current.count + 1,
      });
    });
  });

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Bonus Payments Summary
    const summarySheet = XLSX.utils.aoa_to_sheet([
      ["ملخص البونص"],
      [],
      ["البيان", "المبلغ"],
      ["البونص المدفوع", summary.paid],
      ["البونص المستحق", summary.unpaid],
      ["الإجمالي", summary.total],
    ]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "الملخص");

    // Sheet 2: Bonus Payments Details
    const bonusSheet = XLSX.utils.json_to_sheet(
      payments.map((p: any) => ({
        "رقم الفاتورة": p.invoiceReference,
        "المندوب": p.repEmail,
        "مبلغ الفاتورة": p.invoiceAmount,
        "نسبة البونص": `${p.bonusPercentage}%`,
        "مبلغ البونص": p.bonusAmount,
        "تاريخ الفاتورة": p.invoiceDate,
        "تاريخ الدفع": p.paymentDate,
        "الحالة": p.status === "paid" ? "مدفوع" : "غير مدفوع",
        "الملاحظات": p.notes || "",
      }))
    );
    XLSX.utils.book_append_sheet(workbook, bonusSheet, "تفاصيل البونص");

    // Sheet 3: Product Statistics
    const productSheet = XLSX.utils.json_to_sheet(
      Array.from(productStats.entries()).map(([name, stats]) => ({
        "اسم المنتج": name,
        "الكمية المباعة": stats.quantity,
        "إجمالي المبيعات": stats.total,
        "عدد مرات البيع": stats.count,
      }))
    );
    XLSX.utils.book_append_sheet(workbook, productSheet, "تحليل المنتجات");

    // Download
    XLSX.writeFile(workbook, `تقرير_البونص_${startDate}_${endDate}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-right">التقارير المتقدمة</h1>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>تصفية البيانات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>من التاريخ</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label>إلى التاريخ</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div>
                <Label>حالة البونص</Label>
                <Select value={bonusStatus} onValueChange={(v: any) => setBonusStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل</SelectItem>
                    <SelectItem value="paid">مدفوع</SelectItem>
                    <SelectItem value="unpaid">غير مدفوع</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={exportToExcel} className="w-full">
                  تصدير Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">البونص المدفوع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{summary.paid.toFixed(2)} ريال</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">البونص المستحق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{summary.unpaid.toFixed(2)} ريال</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">الإجمالي</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{summary.total.toFixed(2)} ريال</div>
            </CardContent>
          </Card>
        </div>

        {/* Bonus Payments Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>تفاصيل البونص</CardTitle>
            <CardDescription>
              {bonusLoading ? "جاري التحميل..." : `${payments.length} فاتورة`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-right">رقم الفاتورة</th>
                    <th className="px-4 py-2 text-right">المندوب</th>
                    <th className="px-4 py-2 text-right">مبلغ الفاتورة</th>
                    <th className="px-4 py-2 text-right">النسبة</th>
                    <th className="px-4 py-2 text-right">البونص</th>
                    <th className="px-4 py-2 text-right">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p: any, idx: number) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{p.invoiceReference}</td>
                      <td className="px-4 py-2">{p.repEmail}</td>
                      <td className="px-4 py-2">{p.invoiceAmount.toFixed(2)}</td>
                      <td className="px-4 py-2">{p.bonusPercentage}%</td>
                      <td className="px-4 py-2 font-bold">{p.bonusAmount.toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            p.status === "paid"
                              ? "bg-green-100 text-green-800"
                              : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {p.status === "paid" ? "مدفوع" : "غير مدفوع"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Product Analysis */}
        <Card>
          <CardHeader>
            <CardTitle>تحليل المنتجات</CardTitle>
            <CardDescription>إجمالي المبيعات والكميات حسب المنتج</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-right">اسم المنتج</th>
                    <th className="px-4 py-2 text-right">الكمية</th>
                    <th className="px-4 py-2 text-right">إجمالي المبيعات</th>
                    <th className="px-4 py-2 text-right">عدد مرات البيع</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(productStats.entries()).map(([name, stats], idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{name}</td>
                      <td className="px-4 py-2">{stats.quantity}</td>
                      <td className="px-4 py-2 font-bold">{stats.total.toFixed(2)}</td>
                      <td className="px-4 py-2">{stats.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
