import { Building2 } from "lucide-react";
export function Empty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-44 place-items-center py-9 text-center">
      <div>
        <Building2
          className="mx-auto mb-4 size-9 text-primary/60"
          aria-hidden
        />
        <h2 className="font-semibold">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-secondary">
          {description}
        </p>
      </div>
    </div>
  );
}
