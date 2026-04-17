import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, TrendingUp, DollarSign, FileText } from "lucide-react";

export default function RepReport() {
  const { user } = useAuth();
  const [selectedRep, setSelectedRep] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showResults, setShowResults] = useState(false);

  // Fetch reps list
  const { data: repsData } = trpc.settings.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Fetch rep performance
  const { data: performance, isLoading: performanceLoading } = trpc.reports.repPerformance.useQuery(
    {
      repEmail: selectedRep,
      startDate,
      endDate,
    },
    {
      enabled: showResults && !!selectedRep && !!startDate && !!endDate,
    }
  );

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-lg font-semibold">يرجى تسجيل الدخول</p>
        <a href={getLoginUrl()}>
          <Button>تسجيل الدخول</Button>
        </a>
      </div>
    );
  }

  const handleGenerateReport = () => {
    if (selectedRep && startDate && endDate) {
      setShowResults(true);
    }
  };

  const reps = repsData?.settings || [];

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">تقرير أداء المندوب</h1>
        <p className="text-gray-600">عرض تفاصيل الفواتير والبونص لكل مندوب</p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>معايير البحث</CardTitle>
          <CardDescription>اختر المندوب والفترة الزمنية</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label>المندوب</Label>
              <Select value={selectedRep} onValueChange={setSelectedRep}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر المندوب" />
                </SelectTrigger>
                <SelectContent>
                  {reps.map((rep: any) => (
                    <SelectItem key={rep.productId} value={rep.productId}>
                      {rep.productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>من تاريخ</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>إلى تاريخ</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleGenerateReport} className="w-full">
            عرض التقرير
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && performanceLoading && (
        <div className="text-center py-8">
          <p className="text-gray-600">جاري تحميل البيانات...</p>
        </div>
      )}

      {showResults && performance && !performanceLoading && (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">إجمالي المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(performance.totalSales / 100).toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-gray-500 mt-1">{performance.totalInvoices} فاتورة</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">المدفوع</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{performance.paidInvoices}</div>
                <p className="text-xs text-gray-500 mt-1">من {performance.totalInvoices} فاتورة</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">البونص المستحق</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{(performance.bonusEarned / 100).toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-gray-500 mt-1">من جميع الفواتير</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">البونص المتبقي</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{(performance.bonusRemaining / 100).toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-gray-500 mt-1">لم يتم دفعه بعد</p>
              </CardContent>
            </Card>
          </div>

          {/* Bonus Summary */}
          <Card>
            <CardHeader>
              <CardTitle>ملخص البونص</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b">
                  <span className="text-gray-600">البونص المستحق:</span>
                  <span className="text-lg font-bold">{(performance.bonusEarned / 100).toLocaleString('ar-SA')} ر.س</span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b">
                  <span className="text-gray-600">البونص المدفوع:</span>
                  <span className="text-lg font-bold text-green-600">{(performance.bonusPaid / 100).toLocaleString('ar-SA')} ر.س</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">البونص المتبقي:</span>
                  <span className="text-lg font-bold text-orange-600">{(performance.bonusRemaining / 100).toLocaleString('ar-SA')} ر.س</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>تفاصيل الفواتير</CardTitle>
              <CardDescription>
                إجمالي {performance.totalInvoices} فاتورة ({performance.paidInvoices} مدفوعة، {performance.unpaidInvoices} غير مدفوعة)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="paid" className="w-full">
                <TabsList>
                  <TabsTrigger value="paid">الفواتير المدفوعة ({performance.paidInvoices})</TabsTrigger>
                  <TabsTrigger value="unpaid">الفواتير الآجلة ({performance.unpaidInvoices})</TabsTrigger>
                </TabsList>

                <TabsContent value="paid" className="mt-4">
                  <div className="text-center py-8 text-gray-500">
                    <p>سيتم عرض تفاصيل الفواتير المدفوعة هنا</p>
                    <p className="text-sm mt-2">(يتطلب جلب البيانات من Qoyod)</p>
                  </div>
                </TabsContent>

                <TabsContent value="unpaid" className="mt-4">
                  <div className="text-center py-8 text-gray-500">
                    <p>سيتم عرض تفاصيل الفواتير الآجلة هنا</p>
                    <p className="text-sm mt-2">(يتطلب جلب البيانات من Qoyod)</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
