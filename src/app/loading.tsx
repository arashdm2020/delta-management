export default function Loading() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className="mx-auto grid max-w-5xl gap-5 p-8"
    >
      <div className="h-8 w-52 rounded-lg bg-soft" />
      <div className="h-40 rounded-2xl bg-white" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-32 rounded-2xl bg-white" />
        <div className="h-32 rounded-2xl bg-white" />
      </div>
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}
