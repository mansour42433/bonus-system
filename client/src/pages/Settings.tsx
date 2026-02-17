import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

// Rep Settings Section Component
function RepSettingsSection() {
  const utils = trpc.useUtils();
  const { data: invoicesData } = trpc.qoyod.fetchInvoices.useQuery(
    { startDate: "2024-01-01", endDate: new Date().toISOString().split("T")[0] },
    { enabled: false } // Don't auto-fetch, just for getting reps
  );
  const { data: repsData } = trpc.reps.list.useQuery();
  
  const updateRepMutation = trpc.reps.update.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ إعدادات المندوب بنجاح");
      utils.reps.list.invalidate();
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const [editingRep, setEditingRep] = useState<{
    repEmail: string;
    repNickname: string;
    monthlyTarget: number;
    bonusAmount: number;
  } | null>(null);

  // Get unique reps from invoices (fallback to empty if no data)
  const uniqueReps = invoicesData?.invoices
    ? Array.from(new Set(invoicesData.invoices.map((inv: any) => inv.created_by)))
    : [];

  const handleSaveRep = () => {
    if (!editingRep) return;
    updateRepMutation.mutate(editingRep);
    setEditingRep(null);
  };

  return (
    <div className="space-y-4">
      {uniqueReps.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          لا توجد فواتير بعد. سيتم عرض المناديب بعد جلب الفواتير.
        </div>
      ) : (
        (uniqueReps as string[]).map((repEmail: string) => {
          const repSetting = repsData?.reps.find((r) => r.repEmail === repEmail);
          const isEditing = editingRep?.repEmail === repEmail;

          return (
            <div key={repEmail} className="border rounded-lg p-4 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <Label className="text-sm font-semibold">المندوب</Label>
                  <p className="text-xs text-gray-500">{repEmail}</p>
                </div>

                <div>
                  <Label htmlFor={`nickname-${repEmail}`}>اللقب/الاسم</Label>
                  <Input
                    id={`nickname-${repEmail}`}
                    type="text"
                    value={
                      isEditing
                        ? editingRep.repNickname
                        : repSetting?.repNickname || ""
                    }
                    onChange={(e) => {
                      if (isEditing) {
                        setEditingRep({
                          ...editingRep,
                          repNickname: e.target.value,
                        });
                      } else {
                        setEditingRep({
                          repEmail,
                          repNickname: e.target.value,
                          monthlyTarget: repSetting?.monthlyTarget || 0,
                          bonusAmount: repSetting?.bonusAmount || 0,
                        });
                      }
                    }}
                    className="text-right"
                    placeholder="أدخل اللقب"
                  />
                </div>

                <div>
                  <Label htmlFor={`target-${repEmail}`}>التارجت الشهري (ريال)</Label>
                  <Input
                    id={`target-${repEmail}`}
                    type="number"
                    value={
                      isEditing
                        ? editingRep.monthlyTarget
                        : repSetting?.monthlyTarget || 0
                    }
                    onChange={(e) => {
                      if (isEditing) {
                        setEditingRep({
                          ...editingRep,
                          monthlyTarget: Number(e.target.value),
                        });
                      } else {
                        setEditingRep({
                          repEmail,
                          repNickname: repSetting?.repNickname || "",
                          monthlyTarget: Number(e.target.value),
                          bonusAmount: repSetting?.bonusAmount || 0,
                        });
                      }
                    }}
                    className="text-right"
                  />
                </div>

                <div>
                  <Label htmlFor={`bonus-${repEmail}`}>المكافأة (ريال)</Label>
                  <Input
                    id={`bonus-${repEmail}`}
                    type="number"
                    value={
                      isEditing
                        ? editingRep.bonusAmount
                        : repSetting?.bonusAmount || 0
                    }
                    onChange={(e) => {
                      if (isEditing) {
                        setEditingRep({
                          ...editingRep,
                          bonusAmount: Number(e.target.value),
                        });
                      } else {
                        setEditingRep({
                          repEmail,
                          repNickname: repSetting?.repNickname || "",
                          monthlyTarget: repSetting?.monthlyTarget || 0,
                          bonusAmount: Number(e.target.value),
                        });
                      }
                    }}
                    className="text-right"
                  />
                </div>
              </div>

              {isEditing && (
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleSaveRep}
                    disabled={updateRepMutation.isPending}
                    size="sm"
                  >
                    {updateRepMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                  </Button>
                  <Button
                    onClick={() => setEditingRep(null)}
                    variant="outline"
                    size="sm"
                  >
                    إلغاء
                  </Button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // Get products from Qoyod
  const { data: productsData, isLoading: productsLoading } = trpc.qoyod.fetchProducts.useQuery();

  // Get product settings
  const { data: settingsData } = trpc.settings.list.useQuery();

  // Update product setting mutation
  const updateSettingMutation = trpc.settings.update.useMutation({
    onSuccess: () => {
      toast.success("تم حفظ الإعدادات بنجاح");
      utils.settings.list.invalidate();
    },
    onError: (error) => {
      toast.error(`خطأ: ${error.message}`);
    },
  });

  const [editingProduct, setEditingProduct] = useState<{
    productId: string;
    productName: string;
    premiumPrice: number;
    basePrice: number;
  } | null>(null);

  const handleSave = () => {
    if (!editingProduct) return;
    updateSettingMutation.mutate(editingProduct);
    setEditingProduct(null);
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
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-4xl font-bold text-gray-900">إعدادات الأسعار</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>تخصيص أسعار المنتجات</CardTitle>
            <CardDescription>
              حدد سعر التميز (2%) وسعر الأساسي (1%) لكل منتج. الأسعار شاملة للضريبة 15%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="text-center py-8">جاري تحميل المنتجات...</div>
            ) : (
              <div className="space-y-4">
                {productsData?.products.map((product: any) => {
                  const setting = settingsData?.settings.find(
                    (s) => String(s.productId) === String(product.id)
                  );
                  const isEditing = editingProduct?.productId === String(product.id);

                  return (
                    <div key={product.id} className="border rounded-lg p-4 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold">{product.name_ar || product.name_en || `منتج ${product.id}`}</Label>
                          <p className="text-xs text-gray-500">رقم المنتج: {product.id}</p>
                        </div>

                        <div>
                          <Label htmlFor={`premium-${product.id}`}>سعر التميز (2%)</Label>
                          <Input
                            id={`premium-${product.id}`}
                            type="number"
                            value={
                              isEditing
                                ? editingProduct.premiumPrice
                                : setting?.premiumPrice || 70
                            }
                            onChange={(e) => {
                              if (isEditing) {
                                setEditingProduct({
                                  ...editingProduct,
                                  premiumPrice: Number(e.target.value),
                                });
                              } else {
                                setEditingProduct({
                                  productId: String(product.id),
                                  productName: product.name_ar || product.name_en || `منتج ${product.id}`,
                                  premiumPrice: Number(e.target.value),
                                  basePrice: setting?.basePrice || 69,
                                });
                              }
                            }}
                            className="text-right"
                          />
                        </div>

                        <div>
                          <Label htmlFor={`base-${product.id}`}>سعر الأساسي (1%)</Label>
                          <Input
                            id={`base-${product.id}`}
                            type="number"
                            value={
                              isEditing ? editingProduct.basePrice : setting?.basePrice || 69
                            }
                            onChange={(e) => {
                              if (isEditing) {
                                setEditingProduct({
                                  ...editingProduct,
                                  basePrice: Number(e.target.value),
                                });
                              } else {
                                setEditingProduct({
                                  productId: String(product.id),
                                  productName: product.name_ar || product.name_en || `منتج ${product.id}`,
                                  premiumPrice: setting?.premiumPrice || 70,
                                  basePrice: Number(e.target.value),
                                });
                              }
                            }}
                            className="text-right"
                          />
                        </div>
                      </div>

                      {isEditing && (
                        <div className="flex gap-2 mt-4">
                          <Button
                            onClick={handleSave}
                            disabled={updateSettingMutation.isPending}
                            size="sm"
                          >
                            {updateSettingMutation.isPending ? "جاري الحفظ..." : "حفظ"}
                          </Button>
                          <Button
                            onClick={() => setEditingProduct(null)}
                            variant="outline"
                            size="sm"
                          >
                            إلغاء
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rep Settings Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>إعدادات المناديب</CardTitle>
            <CardDescription>
              حدد ألقاب المناديب والتارجت الشهري والمكافأة لكل مندوب.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RepSettingsSection />
          </CardContent>
        </Card>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">ملاحظة مهمة</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• الأسعار المدخلة يجب أن تكون <strong>شاملة للضريبة 15%</strong></li>
            <li>• سعر التميز (2%): السعر الأدنى للحصول على عمولة 2%</li>
            <li>• سعر الأساسي (1%): السعر الأقصى للحصول على عمولة 1%</li>
            <li>• الأسعار بين السعرين لا تحصل على عمولة</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
