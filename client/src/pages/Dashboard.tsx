import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import ExcelJS from "exceljs";
import { Link } from "wouter";
import { Settings } from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Get API key
  const { data: apiKeyData } = trpc.qoyod.getApiKey.useQuery();
  const [apiKey, setApiKey] = useState("");
  
  // Save API key mutation
  const saveApiKeyMutation = trpc.qoyod.saveApiKey.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ API Key بنجاح");
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  // Fetch invoices - get last 6 months to catch delayed invoices
  const [startDate, endDate] = (() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(year, month - 6, 1); // 6 months back to catch all delayed invoices
    const end = new Date(year, month, 0); // Last day of selected month
    return [
      start.toISOString().split("T")[0],
      end.toISOString().split("T")[0],
    ];
  })();

  const { data: invoicesData, isLoading: invoicesLoading, refetch } = trpc.qoyod.fetchInvoices.useQuery(
    { startDate, endDate },
    { enabled: !!apiKeyData?.apiKey }
  );

  // Fetch credit notes
  const { data: creditNotesData } = trpc.qoyod.fetchCreditNotes.useQuery(
    { startDate, endDate },
    { enabled: !!apiKeyData?.apiKey }
  );

  // Get product settings
  const { data: settingsData } = trpc.settings.list.useQuery();

  // Calculate bonus
  const calculateBonusData = () => {
    if (!invoicesData?.invoices || !settingsData?.settings) return null;

    const invoices = invoicesData.invoices;
    const settings = settingsData.settings;
    const creditNotes = creditNotesData?.creditNotes || [];

    // Build a map of returned quantities by invoice_id and product_id
    const returnedQuantities = new Map<string, number>();
    creditNotes.forEach((cn: any) => {
      if (cn.invoice_id) {
        cn.line_items?.forEach((item: any) => {
          const key = `${cn.invoice_id}-${item.product_id}`;
          const existing = returnedQuantities.get(key) || 0;
          returnedQuantities.set(key, existing + item.quantity);
        });
      }
    });

    let totalSales = 0;
    let sales1Percent = 0;
    let sales2Percent = 0;
    let totalBonus = 0;

    const paidInvoices: any[] = [];
    const pendingInvoices: any[] = [];

    const [selectedYear, selectedMonthNum] = selectedMonth.split("-").map(Number);

    invoices.forEach((invoice: any) => {
      const isPaid = invoice.status === "Paid";
      
      // Get payment date from payments array
      const paymentDate = invoice.payments?.[invoice.payments.length - 1]?.date;
      if (!paymentDate && isPaid) return; // Skip if paid but no payment date
      
      // Check if payment was made in selected month
      let isInSelectedMonth = false;
      if (isPaid && paymentDate) {
        const [payYear, payMonth] = paymentDate.split("-").map(Number);
        isInSelectedMonth = payYear === selectedYear && payMonth === selectedMonthNum;
      }
      
      // Skip if paid but not in selected month
      if (isPaid && !isInSelectedMonth) return;
      
      invoice.line_items?.forEach((item: any) => {
        const setting = settings.find((s) => String(s.productId) === String(item.product_id));
        const premiumPrice = setting?.premiumPrice || 70;
        const basePrice = setting?.basePrice || 69;

        // Check for returned quantities
        const returnKey = `${invoice.id}-${item.product_id}`;
        const returnedQty = returnedQuantities.get(returnKey) || 0;
        const actualQuantity = item.quantity - returnedQty;
        
        // Skip if fully returned
        if (actualQuantity <= 0) return;

        // Calculate price with tax
        const priceWithTax = item.unit_price * (1 + (item.tax_percent || 15) / 100);
        const itemTotal = priceWithTax * actualQuantity;

        // Determine bonus percentage
        let percentage = 0;
        let category = "لا بونص";
        if (priceWithTax >= 70) {
          percentage = 2;
          category = "تميز";
        } else if (priceWithTax < 70) {
          percentage = 1;
          category = "أساسي";
        }

        const bonus = itemTotal * (percentage / 100);

        if (isPaid) {
          totalSales += itemTotal;
          if (percentage === 1) sales1Percent += itemTotal;
          if (percentage === 2) sales2Percent += itemTotal;
          totalBonus += bonus;

          paidInvoices.push({
            reference: invoice.reference,
            rep: invoice.created_by,
            product: item.product_name,
            quantity: actualQuantity,
            returnedQty: returnedQty,
            price: priceWithTax,
            category,
            percentage,
            bonus,
            date: invoice.payments?.[invoice.payments.length - 1]?.date || invoice.issue_date,
          });
        } else {
          pendingInvoices.push({
            reference: invoice.reference,
            rep: invoice.created_by,
            product: item.product_name,
            quantity: item.quantity,
            expectedBonus: bonus,
            status: "آجل - غير مدفوعة",
          });
        }
      });
    });

    return {
      totalSales,
      sales1Percent,
      sales2Percent,
      totalBonus,
      paidInvoices,
      pendingInvoices,
    };
  };

  const bonusData = calculateBonusData();

  // Get unique reps
  const uniqueReps = bonusData
    ? Array.from(new Set(bonusData.paidInvoices.map((inv: any) => inv.rep)))
    : [];

  const [selectedRep, setSelectedRep] = useState<string>("all");

  // Export to Excel
  const exportToExcel = async () => {
    if (!bonusData) return;

    const filteredInvoices = selectedRep === "all"
      ? bonusData.paidInvoices
      : bonusData.paidInvoices.filter((inv: any) => inv.rep === selectedRep);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("البونص المستحق");

    // Add headers
    worksheet.columns = [
      { header: "المرجع", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "السعر", key: "price", width: 12 },
      { header: "الفئة", key: "category", width: 12 },
      { header: "النسبة", key: "percentage", width: 10 },
      { header: "البونص", key: "bonus", width: 12 },
      { header: "التاريخ", key: "date", width: 12 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2563EB" },
    };

    // Add data
    filteredInvoices.forEach((inv: any) => {
      const row = worksheet.addRow({
        reference: inv.reference,
        rep: inv.rep,
        product: inv.product,
        quantity: inv.quantity,
        price: inv.price.toFixed(2),
        category: inv.category,
        percentage: `${inv.percentage}%`,
        bonus: inv.bonus.toFixed(2),
        date: inv.date,
      });

      // Color code categories
      if (inv.category === "تميز") {
        row.getCell(6).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF10B981" },
        };
        row.getCell(6).font = { color: { argb: "FFFFFFFF" } };
      } else if (inv.category === "أساسي") {
        row.getCell(6).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF59E0B" },
        };
        row.getCell(6).font = { color: { argb: "FFFFFFFF" } };
      }
    });

    // Add summary row
    worksheet.addRow([]);
    const summaryRow = worksheet.addRow([
      "",
      "",
      "إجمالي البونص",
      "",
      "",
      "",
      "",
      filteredInvoices.reduce((sum: number, inv: any) => sum + inv.bonus, 0).toFixed(2),
      "",
    ]);
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDBEAFE" },
    };

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bonus-${selectedMonth}${selectedRep !== "all" ? `-${selectedRep}` : ""}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("تم تصدير البيانات بنجاح");
  };

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">جاري التحميل...</div>;
  }

  if (!user) {
    return <div className="flex items-center justify-center min-h-screen">يرجى تسجيل الدخول</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900">نظام حساب العمولات</h1>
          <Link href="/settings">
            <Button variant="outline" className="gap-2">
              <Settings className="w-4 h-4" />
              الإعدات
            </Button>
          </Link>
        </div>

        {/* API Key Section */}
        {!apiKeyData?.apiKey && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>إعداد Qoyod API</CardTitle>
              <CardDescription>أدخل مفتاح API الخاص بك من قيود</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="أدخل API Key"
                  />
                </div>
                <Button
                  onClick={() => saveApiKeyMutation.mutate({ apiKey })}
                  disabled={!apiKey || saveApiKeyMutation.isPending}
                  className="self-end"
                >
                  {saveApiKeyMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Month Selector */}
        <div className="mb-8">
          <Label htmlFor="month">اختر الشهر</Label>
          <div className="flex gap-4 items-end">
            <Input
              id="month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="max-w-xs"
            />
            <Button onClick={() => refetch()} disabled={invoicesLoading || !apiKeyData?.apiKey}>
              {invoicesLoading ? "جاري الجلب..." : "جلب البيانات"}
            </Button>
            {bonusData && (
              <>
                <select
                  value={selectedRep}
                  onChange={(e) => setSelectedRep(e.target.value)}
                  className="px-4 py-2 border rounded-md"
                >
                  <option value="all">جميع المناديب</option>
                  {uniqueReps.map((rep: string) => (
                    <option key={rep} value={rep}>
                      {rep}
                    </option>
                  ))}
                </select>
                <Button onClick={exportToExcel} variant="secondary">
                  تصدير Excel
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        {bonusData && (() => {
          const filteredInvoices = selectedRep === "all"
            ? bonusData.paidInvoices
            : bonusData.paidInvoices.filter((inv: any) => inv.rep === selectedRep);
          
          const filteredStats = {
            totalSales: filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.price * inv.quantity), 0),
            sales1Percent: filteredInvoices.filter((inv: any) => inv.percentage === 1).reduce((sum: number, inv: any) => sum + (inv.price * inv.quantity), 0),
            sales2Percent: filteredInvoices.filter((inv: any) => inv.percentage === 2).reduce((sum: number, inv: any) => sum + (inv.price * inv.quantity), 0),
            totalBonus: filteredInvoices.reduce((sum: number, inv: any) => sum + inv.bonus, 0),
          };

          return (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">إجمالي المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{filteredStats.totalSales.toLocaleString()} ريال</div>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 border-orange-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-orange-700">مبيعات 1% (أساسي)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">{filteredStats.sales1Percent.toLocaleString()} ريال</div>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-700">مبيعات 2% (تميز)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">{filteredStats.sales2Percent.toLocaleString()} ريال</div>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-blue-700">إجمالي البونص</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{filteredStats.totalBonus.toLocaleString()} ريال</div>
              </CardContent>
            </Card>
          </div>
          );
        })()}

        {/* Tabs */}
        <Tabs defaultValue="paid" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="paid">البونص المستحق</TabsTrigger>
            <TabsTrigger value="pending">الفواتير الآجلة</TabsTrigger>
          </TabsList>

          <TabsContent value="paid">
            <Card>
              <CardHeader>
                <CardTitle>الفواتير المدفوعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-2">المرجع</th>
                        <th className="text-right p-2">المندوب</th>
                        <th className="text-right p-2">المنتج</th>
                        <th className="text-right p-2">الكمية</th>
                        <th className="text-right p-2">السعر</th>
                        <th className="text-right p-2">الفئة</th>
                        <th className="text-right p-2">النسبة</th>
                        <th className="text-right p-2">البونص</th>
                        <th className="text-right p-2">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedRep === "all" ? bonusData?.paidInvoices : bonusData?.paidInvoices.filter((inv: any) => inv.rep === selectedRep))?.map((inv: any, idx: number) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{inv.reference}</td>
                          <td className="p-2">{inv.rep}</td>
                          <td className="p-2">{inv.product}</td>
                          <td className="p-2">{inv.quantity}</td>
                          <td className="p-2">{inv.price.toFixed(2)}</td>
                          <td className="p-2">
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                inv.category === "تميز"
                                  ? "bg-green-100 text-green-700"
                                  : inv.category === "أساسي"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {inv.category}
                            </span>
                          </td>
                          <td className="p-2">{inv.percentage}%</td>
                          <td className="p-2 font-semibold">{inv.bonus.toFixed(2)}</td>
                          <td className="p-2">{inv.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending">
            <Card>
              <CardHeader>
                <CardTitle>الفواتير الآجلة (غير مدفوعة)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right p-2">المرجع</th>
                        <th className="text-right p-2">المندوب</th>
                        <th className="text-right p-2">المنتج</th>
                        <th className="text-right p-2">الكمية</th>
                        <th className="text-right p-2">البونص المتوقع</th>
                        <th className="text-right p-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonusData?.pendingInvoices.map((inv, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{inv.reference}</td>
                          <td className="p-2">{inv.rep}</td>
                          <td className="p-2">{inv.product}</td>
                          <td className="p-2">{inv.quantity}</td>
                          <td className="p-2">{inv.expectedBonus.toFixed(2)}</td>
                          <td className="p-2">
                            <span className="px-2 py-1 rounded text-xs bg-yellow-100 text-yellow-700">
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
