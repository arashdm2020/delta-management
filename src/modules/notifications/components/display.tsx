import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { digits } from "@/lib/utils";
import { labels } from "../labels";
export function CommunicationStatus({ status }: { status: string }) {
  return (
    <Badge
      tone={
        status === "EMERGENCY" ||
        status === "CRITICAL" ||
        status === "FAILED" ||
        status === "UNKNOWN"
          ? "error"
          : ["FINAL", "RESOLVED", "COMPLETED", "PUBLISHED", "PRESENT"].includes(
                status,
              )
            ? "success"
            : "neutral"
      }
    >
      {labels[status] || status}
    </Badge>
  );
}
export function AttachmentLinks({
  attachments,
}: {
  attachments: { id: string; name: string }[];
}) {
  return attachments.length ? (
    <ul className="my-4 space-y-2 text-sm">
      {attachments.map((a) => (
        <li key={a.id}>
          <a
            className="break-all text-primary underline underline-offset-4"
            href={"/api/attachments/" + a.id}
          >
            {a.name}
          </a>
        </li>
      ))}
    </ul>
  ) : null;
}
export function Pagination({
  page,
  total,
  href,
}: {
  page: number;
  total: number;
  href: string;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  const join = href.includes("?") ? "&" : "?";
  return (
    <nav
      aria-label="صفحه‌بندی"
      className="flex flex-wrap items-center gap-4 text-sm"
    >
      {page > 1 && (
        <Link
          className="nav-extra text-primary"
          href={href + join + "page=" + (page - 1)}
        >
          صفحه قبل
        </Link>
      )}
      <span className="text-secondary">
        صفحه {digits(page)} از {digits(pages)}
      </span>
      {page < pages && (
        <Link
          className="nav-extra text-primary"
          href={href + join + "page=" + (page + 1)}
        >
          صفحه بعد
        </Link>
      )}
    </nav>
  );
}
