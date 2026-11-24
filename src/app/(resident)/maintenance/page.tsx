import { Card } from "@/components/ui/card";
import { Empty } from "@/components/shared/empty";
export default function Page() {
  return (
    <div className="space-y-6">
      <h1 className="page-heading">نگهداری ساختمان</h1>
      <Card>
        <Empty
          title="این بخش هنوز پیاده‌سازی نشده است"
          description="برنامهٔ تعمیر و نگهداری در فازهای بعدی اضافه می‌شود. در حال حاضر هیچ مبلغ، مانده یا تراکنش مالی نمایش داده یا ثبت نمی‌شود."
        />
      </Card>
    </div>
  );
}
