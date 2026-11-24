import Link from "next/link";
export default function Page() {
  return (
    <main className="mx-auto max-w-md p-10 text-center">
      <h1 className="page-heading">دسترسی مجاز نیست</h1>
      <p className="page-description">
        این بخش برای نقش کاربری شما در دسترس نیست.
      </p>
      <Link className="mt-6 inline-block text-primary underline" href="/home">
        بازگشت به خانه
      </Link>
    </main>
  );
}
