import { CopyButton } from "@/components/ui/CopyButton";

export function CodeBlock({
  code,
  label,
  className = "",
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`mt-4 overflow-hidden rounded-default border border-border bg-canvas/60 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        {label && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-text-secondary">
            {label}
          </span>
        )}

        <CopyButton value={code} label="Copy" className="ml-auto" />
      </div>

      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-text-primary">
        <code>{code}</code>
      </pre>
    </div>
  );
}