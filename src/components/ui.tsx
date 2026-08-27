import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-surface p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const VARIANT_CLASSES = {
  primary: "bg-accent text-white hover:opacity-90",
  secondary:
    "bg-transparent border border-border text-foreground hover:bg-black/[.03] dark:hover:bg-white/[.06]",
  danger: "bg-status-critical text-white hover:opacity-90",
  success: "bg-status-good text-white hover:opacity-90",
} as const;

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT_CLASSES }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  RESUMO: "bg-status-warning/15 text-status-warning ring-1 ring-status-warning/30",
  COMPLETA: "bg-status-good/15 text-status-good ring-1 ring-status-good/30",
  SUCESSO: "bg-status-good/15 text-status-good ring-1 ring-status-good/30",
  ERRO: "bg-status-critical/15 text-status-critical ring-1 ring-status-critical/30",
  EM_ANDAMENTO: "bg-status-warning/15 text-status-warning ring-1 ring-status-warning/30",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls = STATUS_BADGE_CLASSES[status] ?? "bg-black/5 text-ink-secondary";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
      {message}
    </p>
  );
}

export function FieldSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-status-good/10 px-3 py-2 text-sm text-status-good">{message}</p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-muted">
      {children}
    </p>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-sm font-medium text-ink-secondary">{children}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent ${props.className ?? ""}`}
    />
  );
}
