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
import { Settings, RefreshCw } from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

  const { data: invoicesData, isLoading: invoicesLoading, refetch: refetchInvoices } = trpc.qoyod.fetchInvoices.useQuery(
    { startDate, endDate }
  );
  
  const clearCacheMutation = trpc.qoyod.clearCache.useMutation();

  // Fetch credit notes
  const { data: creditNotesData, refetch: refetchCreditNotes } = trpc.qoyod.fetchCreditNotes.useQuery(
    { startDate, endDate }
  );

  // Get product settings
  const { data: settingsData, refetch: refetchSettings } = trpc.settings.list.useQuery();
  
  // Get rep settings
  const { data: repsData } = trpc.reps.list.useQuery();

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

        // Determine bonus percentage based on settings
        let percentage = 0;
        let category = "لا بونص";
        if (priceWithTax >= premiumPrice) {
          percentage = 2;
          category = "تميز";
        } else if (priceWithTax >= basePrice) {
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
            product: setting?.productName || item.product_name,
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
            product: setting?.productName || item.product_name,
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

  // Get unique reps with nicknames
  const uniqueReps = bonusData
    ? Array.from(new Set(bonusData.paidInvoices.map((inv: any) => inv.rep)))
    : [];
  
  // Helper function to get rep display name
  const getRepDisplayName = (repEmail: string) => {
    const repSetting = repsData?.reps.find((r) => r.repEmail === repEmail);
    return repSetting?.repNickname || repEmail;
  };

  const [selectedRep, setSelectedRep] = useState<string>("all");

  // Export to Excel
  const exportToExcel = async () => {
    if (!bonusData) return;

    const filteredInvoices = selectedRep === "all"
      ? bonusData.paidInvoices
      : bonusData.paidInvoices.filter((inv: any) => inv.rep === selectedRep);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("البونص المستحق");

    // Add headers with more details
    worksheet.columns = [
      { header: "المرجع", key: "reference", width: 15 },
      { header: "المندوب", key: "rep", width: 20 },
      { header: "المنتج", key: "product", width: 30 },
      { header: "الكمية", key: "quantity", width: 10 },
      { header: "كمية مرتجعة", key: "returnedQty", width: 12 },
      { header: "السعر", key: "price", width: 12 },
      { header: "إجمالي المبيعات", key: "totalSales", width: 15 },
      { header: "مبيعات 1%", key: "sales1", width: 12 },
      { header: "مبيعات 2%", key: "sales2", width: 12 },
      { header: "خصم مرتجعات", key: "returnDeduction", width: 15 },
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

    // Add data with enhanced details
    filteredInvoices.forEach((inv: any) => {
      const totalSales = inv.price * inv.quantity;
      const sales1 = inv.percentage === 1 ? totalSales : 0;
      const sales2 = inv.percentage === 2 ? totalSales : 0;
      const returnDeduction = inv.returnedQty > 0 ? (inv.price * inv.returnedQty).toFixed(2) : "0.00";
      
      const row = worksheet.addRow({
        reference: inv.reference,
        rep: getRepDisplayName(inv.rep),
        product: inv.product,
        quantity: inv.quantity,
        returnedQty: inv.returnedQty || 0,
        price: inv.price.toFixed(2),
        totalSales: totalSales.toFixed(2),
        sales1: sales1.toFixed(2),
        sales2: sales2.toFixed(2),
        returnDeduction: returnDeduction,
        category: inv.category,
        percentage: `${inv.percentage}%`,
        bonus: inv.bonus.toFixed(2),
        date: inv.date,
      });

      // Color code categories (column 11 now)
      if (inv.category === "تميز") {
        row.getCell(11).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF10B981" },
        };
        row.getCell(11).font = { color: { argb: "FFFFFFFF" } };
      } else if (inv.category === "أساسي") {
        row.getCell(11).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF59E0B" },
        };
        row.getCell(11).font = { color: { argb: "FFFFFFFF" } };
      }
      
      // Highlight returned quantities
      if (inv.returnedQty > 0) {
        row.getCell(5).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFECACA" },
        };
        row.getCell(10).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFECACA" },
        };
      }
    });

    // Add summary rows
    worksheet.addRow([]);
    
    // Calculate totals
    const totalSalesSum = filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.price * inv.quantity), 0);
    const sales1Sum = filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.percentage === 1 ? inv.price * inv.quantity : 0), 0);
    const sales2Sum = filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.percentage === 2 ? inv.price * inv.quantity : 0), 0);
    const returnDeductionSum = filteredInvoices.reduce((sum: number, inv: any) => sum + (inv.returnedQty > 0 ? inv.price * inv.returnedQty : 0), 0);
    const totalBonus = filteredInvoices.reduce((sum: number, inv: any) => sum + inv.bonus, 0);
    
    const summaryRow = worksheet.addRow([
      "",
      "",
      "الإجمالي",
      "",
      "",
      "",
      totalSalesSum.toFixed(2),
      sales1Sum.toFixed(2),
      sales2Sum.toFixed(2),
      returnDeductionSum.toFixed(2),
      "",
      "",
      totalBonus.toFixed(2),
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
            <Button 
              onClick={async () => {
                try {
                  await clearCacheMutation.mutateAsync();
                  await Promise.all([
                    refetchInvoices(),
                    refetchCreditNotes(),
                    refetchSettings()
                  ]);
                  toast.success("تم تحديث البيانات بنجاح");
                } catch (error) {
                  toast.error("فشل تحديث البيانات");
                }
              }} 
              disabled={invoicesLoading || clearCacheMutation.isPending}
              variant="outline"
            >
              <RefreshCw className={`ml-2 h-4 w-4 ${clearCacheMutation.isPending ? 'animate-spin' : ''}`} />
              {clearCacheMutation.isPending ? "جاري التحديث..." : "تحديث البيانات"}
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
                      {getRepDisplayName(rep)}
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
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse flex space-x-4">
                        <div className="flex-1 space-y-2 py-1">
                          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
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
                          <td className="p-2">{getRepDisplayName(inv.rep)}</td>
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
                )}
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
                          <td className="p-2">{getRepDisplayName(inv.rep)}</td>
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
