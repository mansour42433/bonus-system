import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Package, Layers } from "lucide-react";

export default function ProductReport() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [showResults, setShowResults] = useState(false);

  // Fetch product sales data
  const { data: productSalesData, isLoading: productLoading } = trpc.reports.productSales.useQuery(
    { month: selectedMonth },
    { enabled: showResults && !!selectedMonth }
  );

  // Fetch category sales data
  const { data: categorySalesData, isLoading: categoryLoading } = trpc.reports.categorySales.useQuery(
    { month: selectedMonth },
    { enabled: showResults && !!selectedMonth }
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
    if (selectedMonth) {
      setShowResults(true);
    }
  };

  const products = productSalesData?.sales || [];
  const categories = categorySalesData?.sales || [];

  const totalProductSales = products.reduce((sum: number, p: any) => sum + (p.totalSales || 0), 0);
  const totalProductQuantity = products.reduce((sum: number, p: any) => sum + (p.totalQuantity || 0), 0);

  const totalCategorySales = categories.reduce((sum: number, c: any) => sum + (c.totalSales || 0), 0);
  const totalCategoryQuantity = categories.reduce((sum: number, c: any) => sum + (c.totalQuantity || 0), 0);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">تقرير المنتجات</h1>
        <p className="text-gray-600">تحليل شامل لمبيعات المنتجات والأصناف</p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>معايير البحث</CardTitle>
          <CardDescription>اختر الشهر لعرض التقرير</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleGenerateReport} className="w-full">
            عرض التقرير
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {showResults && (productLoading || categoryLoading) && (
        <div className="text-center py-8">
          <p className="text-gray-600">جاري تحميل البيانات...</p>
        </div>
      )}

      {showResults && !productLoading && !categoryLoading && (
        <div className="space-y-8">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">إجمالي المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(totalProductSales / 100).toLocaleString('ar-SA')} ر.س</div>
                <p className="text-xs text-gray-500 mt-1">من جميع المنتجات</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">إجمالي الكمية</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalProductQuantity.toLocaleString('ar-SA')}</div>
                <p className="text-xs text-gray-500 mt-1">وحدة مباعة</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">عدد المنتجات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products.length}</div>
                <p className="text-xs text-gray-500 mt-1">منتج مختلف</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">عدد الأصناف</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{categories.length}</div>
                <p className="text-xs text-gray-500 mt-1">صنف مختلف</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="products">المنتجات</TabsTrigger>
              <TabsTrigger value="categories">الأصناف</TabsTrigger>
            </TabsList>

            {/* Products Tab */}
            <TabsContent value="products" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>تحليل المنتجات</CardTitle>
                  <CardDescription>
                    إجمالي {products.length} منتج، {totalProductQuantity.toLocaleString('ar-SA')} وحدة، {(totalProductSales / 100).toLocaleString('ar-SA')} ر.س
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">اسم المنتج</TableHead>
                          <TableHead className="text-right">الصنف</TableHead>
                          <TableHead className="text-center">الكمية</TableHead>
                          <TableHead className="text-center">عدد المبيعات</TableHead>
                          <TableHead className="text-right">إجمالي المبيعات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                              لا توجد بيانات للعرض
                            </TableCell>
                          </TableRow>
                        ) : (
                          products.map((product: any) => (
                            <TableRow key={product.productId}>
                              <TableCell className="text-right">{product.productName}</TableCell>
                              <TableCell className="text-right">{product.category || "-"}</TableCell>
                              <TableCell className="text-center">{product.totalQuantity?.toLocaleString('ar-SA') || 0}</TableCell>
                              <TableCell className="text-center">{product.salesCount || 0}</TableCell>
                              <TableCell className="text-right font-semibold">{((product.totalSales || 0) / 100).toLocaleString('ar-SA')} ر.س</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Categories Tab */}
            <TabsContent value="categories" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>تحليل الأصناف</CardTitle>
                  <CardDescription>
                    إجمالي {categories.length} صنف، {totalCategoryQuantity.toLocaleString('ar-SA')} وحدة، {(totalCategorySales / 100).toLocaleString('ar-SA')} ر.س
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">اسم الصنف</TableHead>
                          <TableHead className="text-center">عدد المنتجات</TableHead>
                          <TableHead className="text-center">إجمالي الكمية</TableHead>
                          <TableHead className="text-right">إجمالي المبيعات</TableHead>
                          <TableHead className="text-right">نسبة المبيعات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categories.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                              لا توجد بيانات للعرض
                            </TableCell>
                          </TableRow>
                        ) : (
                          categories.map((category: any) => {
                            const percentage = totalCategorySales > 0 
                              ? ((category.totalSales || 0) / totalCategorySales * 100).toFixed(1)
                              : 0;
                            return (
                              <TableRow key={category.category}>
                                <TableCell className="text-right">{category.category || "-"}</TableCell>
                                <TableCell className="text-center">{category.productCount || 0}</TableCell>
                                <TableCell className="text-center">{category.totalQuantity?.toLocaleString('ar-SA') || 0}</TableCell>
                                <TableCell className="text-right font-semibold">{((category.totalSales || 0) / 100).toLocaleString('ar-SA')} ر.س</TableCell>
                                <TableCell className="text-right">{percentage}%</TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
