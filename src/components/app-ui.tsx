"use client";
import { useEffect, type ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  useEffect(() => {
    document.title = `${title} · ContaMX`;
  }, [title]);
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-card/30 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed bg-card/30 p-6 text-center sm:p-12">
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-secondary text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { label: string; positive?: boolean };
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        {hint && <span>{hint}</span>}
        {trend && (
          <span className={trend.positive ? "text-success" : "text-destructive"}>{trend.label}</span>
        )}
      </div>
    </div>
  );
}
