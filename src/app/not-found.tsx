import Link from "next/link";
export default function NotFound() {
  return (
    <main className="p-10 text-center">
      <h1 className="page-heading">صفحه پیدا نشد</h1>
      <Link href="/home" className="mt-5 inline-block text-primary underline">
        بازگشت به خانه
      </Link>
    </main>
  );
}
