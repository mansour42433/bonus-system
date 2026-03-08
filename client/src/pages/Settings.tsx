import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Save, ToggleLeft, ToggleRight } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

// Rep Settings Section Component
function RepSettingsSection() {
  const utils = trpc.useUtils();
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

  // Local state for each rep
  const [repEdits, setRepEdits] = useState<Record<string, {
    repNickname: string;
    monthlyTarget: number;
    bonusAmount: number;
  }>>({});

  // Initialize edits from server data
  useEffect(() => {
    if (repsData?.reps) {
      const initial: typeof repEdits = {};
      repsData.reps.forEach((rep) => {
        initial[rep.repEmail] = {
          repNickname: rep.repNickname || "",
          monthlyTarget: rep.monthlyTarget || 0,
          bonusAmount: rep.bonusAmount || 0,
        };
      });
      setRepEdits(initial);
    }
  }, [repsData]);

  const handleSaveRep = (repEmail: string) => {
    const edit = repEdits[repEmail];
    if (!edit) return;
    updateRepMutation.mutate({
      repEmail,
      repNickname: edit.repNickname,
      monthlyTarget: edit.monthlyTarget,
      bonusAmount: edit.bonusAmount,
    });
  };

  if (!repsData?.reps || repsData.reps.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        لا توجد بيانات مناديب بعد. سيتم عرضهم بعد جلب الفواتير.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {repsData.reps.map((rep) => {
        const edit = repEdits[rep.repEmail] || {
          repNickname: rep.repNickname || "",
          monthlyTarget: rep.monthlyTarget || 0,
          bonusAmount: rep.bonusAmount || 0,
        };

        return (
          <div key={rep.repEmail} className="border rounded-lg p-4 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label className="text-sm font-semibold">المندوب</Label>
                <p className="text-xs text-gray-500 mt-1">{rep.repEmail}</p>
              </div>

              <div>
                <Label htmlFor={`nickname-${rep.repEmail}`}>اللقب/الاسم</Label>
                <Input
                  id={`nickname-${rep.repEmail}`}
                  type="text"
                  value={edit.repNickname}
                  onChange={(e) =>
                    setRepEdits((prev) => ({
                      ...prev,
                      [rep.repEmail]: { ...edit, repNickname: e.target.value },
                    }))
                  }
                  className="text-right"
                  placeholder="أدخل اللقب"
                />
              </div>

              <div>
                <Label htmlFor={`target-${rep.repEmail}`}>التارجت الشهري (ريال)</Label>
                <Input
                  id={`target-${rep.repEmail}`}
                  type="number"
                  value={edit.monthlyTarget}
                  onChange={(e) =>
                    setRepEdits((prev) => ({
                      ...prev,
                      [rep.repEmail]: { ...edit, monthlyTarget: Number(e.target.value) },
                    }))
                  }
                  className="text-right"
                />
              </div>

              <div>
                <Label htmlFor={`bonus-${rep.repEmail}`}>المكافأة (ريال)</Label>
                <Input
                  id={`bonus-${rep.repEmail}`}
                  type="number"
                  value={edit.bonusAmount}
                  onChange={(e) =>
                    setRepEdits((prev) => ({
                      ...prev,
                      [rep.repEmail]: { ...edit, bonusAmount: Number(e.target.value) },
                    }))
                  }
                  className="text-right"
                />
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <Button
                onClick={() => handleSaveRep(rep.repEmail)}
                disabled={updateRepMutation.isPending}
                size="sm"
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {updateRepMutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </div>
          </div>
        );
      })}
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

  // Local state for all product edits
  const [productEdits, setProductEdits] = useState<Record<string, {
    premiumPrice: number;
    basePrice: number;
    bonus1Enabled: boolean;
    bonus2Enabled: boolean;
  }>>({});

  // Initialize edits from server data when products and settings load
  useEffect(() => {
    if (productsData?.products) {
      const initial: typeof productEdits = {};
      productsData.products.forEach((product: any) => {
        const setting = settingsData?.settings.find(
          (s) => String(s.productId) === String(product.id)
        );
        initial[String(product.id)] = {
          premiumPrice: setting?.premiumPrice ?? 70,
          basePrice: setting?.basePrice ?? 69,
          bonus1Enabled: setting?.bonus1Enabled !== undefined ? setting.bonus1Enabled : true,
          bonus2Enabled: setting?.bonus2Enabled !== undefined ? setting.bonus2Enabled : true,
        };
      });
      setProductEdits(initial);
    }
  }, [productsData, settingsData]);

  const handleSave = (product: any) => {
    const productId = String(product.id);
    const edit = productEdits[productId];
    if (!edit) return;

    updateSettingMutation.mutate({
      productId,
      productName: product.name_ar || product.name_en || `منتج ${product.id}`,
      premiumPrice: edit.premiumPrice,
      basePrice: edit.basePrice,
      bonus1Enabled: edit.bonus1Enabled,
      bonus2Enabled: edit.bonus2Enabled,
    });
  };

  const toggleBonus = (productId: string, field: "bonus1Enabled" | "bonus2Enabled") => {
    setProductEdits((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: !prev[productId]?.[field],
      },
    }));
  };

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">جاري التحميل...</div>;
  }

  if (!user) {
    const loginUrl = getLoginUrl();
    window.location.href = loginUrl;
    return <div className="flex items-center justify-center min-h-screen">جاري توجيهك لتسجيل الدخول...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8" dir="rtl">
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
              حدد سعر التميز (2%) لكل منتج، وفعّل أو أوقف البونص لكل فئة. الأسعار شاملة للضريبة 15%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {productsLoading ? (
              <div className="text-center py-8">جاري تحميل المنتجات...</div>
            ) : (
              <div className="space-y-3">
                {/* Header row */}
                <div className="hidden md:grid grid-cols-12 gap-3 px-4 text-sm font-semibold text-gray-500 border-b pb-2">
                  <div className="col-span-3">المنتج</div>
                  <div className="col-span-2 text-center">سعر التميز (2%)</div>
                  <div className="col-span-2 text-center">بونص 2%</div>
                  <div className="col-span-2 text-center">بونص 1%</div>
                  <div className="col-span-2 text-center">ملاحظة</div>
                  <div className="col-span-1 text-center">حفظ</div>
                </div>

                {productsData?.products.map((product: any) => {
                  const productId = String(product.id);
                  const edit = productEdits[productId] || {
                    premiumPrice: 70,
                    basePrice: 69,
                    bonus1Enabled: true,
                    bonus2Enabled: true,
                  };

                  return (
                    <div key={product.id} className="border rounded-lg p-4 bg-white hover:bg-gray-50 transition-colors">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Product Name */}
                        <div className="md:col-span-3">
                          <p className="font-semibold text-gray-800">
                            {product.name_ar || product.name_en || `منتج ${product.id}`}
                          </p>
                          <p className="text-xs text-gray-400">رقم: {product.id}</p>
                        </div>

                        {/* Premium Price */}
                        <div className="md:col-span-2">
                          <Label className="text-xs text-gray-500 md:hidden">سعر التميز (2%)</Label>
                          <Input
                            type="number"
                            value={edit.premiumPrice}
                            onChange={(e) =>
                              setProductEdits((prev) => ({
                                ...prev,
                                [productId]: { ...edit, premiumPrice: Number(e.target.value) },
                              }))
                            }
                            className="text-center"
                            placeholder="70"
                          />
                        </div>

                        {/* Toggle Bonus 2% */}
                        <div className="md:col-span-2 flex flex-col items-center gap-1">
                          <Label className="text-xs text-gray-500 md:hidden">بونص 2%</Label>
                          <button
                            onClick={() => toggleBonus(productId, "bonus2Enabled")}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              edit.bonus2Enabled
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                          >
                            {edit.bonus2Enabled ? (
                              <ToggleRight className="w-5 h-5" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                            {edit.bonus2Enabled ? "مفعّل" : "موقوف"}
                          </button>
                        </div>

                        {/* Toggle Bonus 1% */}
                        <div className="md:col-span-2 flex flex-col items-center gap-1">
                          <Label className="text-xs text-gray-500 md:hidden">بونص 1%</Label>
                          <button
                            onClick={() => toggleBonus(productId, "bonus1Enabled")}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              edit.bonus1Enabled
                                ? "bg-green-100 text-green-700 hover:bg-green-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                          >
                            {edit.bonus1Enabled ? (
                              <ToggleRight className="w-5 h-5" />
                            ) : (
                              <ToggleLeft className="w-5 h-5" />
                            )}
                            {edit.bonus1Enabled ? "مفعّل" : "موقوف"}
                          </button>
                        </div>

                        {/* Note */}
                        <div className="md:col-span-2 text-xs text-gray-400 text-center">
                          {!edit.bonus1Enabled && !edit.bonus2Enabled ? (
                            <span className="text-red-500 font-medium">لا بونص</span>
                          ) : edit.bonus1Enabled && edit.bonus2Enabled ? (
                            <span className="text-green-600">
                              أقل من {edit.premiumPrice} ر → 1%<br />
                              {edit.premiumPrice} ر فأكثر → 2%
                            </span>
                          ) : edit.bonus2Enabled ? (
                            <span className="text-blue-600">{edit.premiumPrice} ر فأكثر → 2% فقط</span>
                          ) : (
                            <span className="text-orange-600">أقل من {edit.premiumPrice} ر → 1% فقط</span>
                          )}
                        </div>

                        {/* Save Button */}
                        <div className="md:col-span-1 flex justify-center">
                          <Button
                            onClick={() => handleSave(product)}
                            disabled={updateSettingMutation.isPending}
                            size="sm"
                            variant="outline"
                            className="gap-1 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700"
                          >
                            <Save className="w-4 h-4" />
                            <span className="md:hidden">حفظ</span>
                          </Button>
                        </div>
                      </div>
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
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>الأسعار المدخلة يجب أن تكون <strong>شاملة للضريبة 15%</strong></li>
            <li>سعر التميز: الحد الفاصل بين 1% و 2%</li>
            <li>أي منتج بسعر أقل من سعر التميز يحصل على <strong>1% تلقائياً</strong></li>
            <li>يمكن إيقاف بونص 1% أو 2% لأي منتج بشكل مستقل</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
