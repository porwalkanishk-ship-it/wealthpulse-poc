import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({ className, ...p }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("bg-panel border border-line rounded-[6px]", className)} {...p} />;
}

export function PanelHeader({ title, children, className }: { title: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-4 h-11 flex items-center gap-3 border-b border-line", className)}>
      <h2 className="font-semibold text-hi/95 truncate">{title}</h2>
      {children}
    </div>
  );
}

export function SectionTitle({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-[11px] uppercase tracking-[0.14em] text-mut", className)} {...p} />;
}

type Tone = "em" | "co" | "slate" | "outline" | "amber";
const toneClass: Record<Tone, string> = {
  em: "bg-em/10 text-em border border-em/30",
  co: "bg-co/10 text-co border border-co/30",
  slate: "bg-raised text-soft border border-transparent",
  outline: "border border-line text-mut",
  amber: "bg-amber/10 text-amber border border-amber/30",
};

export function Badge({ tone = "em", className, mono, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone; mono?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-[4px] whitespace-nowrap", mono && "n", toneClass[tone], className)}
      {...p}
    />
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "dashed" | "danger";
export const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }
>(function Btn({ variant = "primary", size = "md", className, type = "button", ...p }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[5px] whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-em/70",
        size === "sm" && "h-7 px-2.5 text-[12px]",
        size === "md" && "h-8 px-3.5",
        size === "lg" && "h-10 px-5 rounded-[6px]",
        variant === "primary" && "bg-em text-ink font-semibold hover:bg-em-hi",
        variant === "secondary" && "border border-line bg-panel text-foreground font-medium hover:bg-raised",
        variant === "ghost" && "text-mut hover:text-foreground hover:bg-raised/60",
        variant === "dashed" && "rounded-[4px] border border-dashed border-line text-mut hover:text-foreground hover:border-em/50",
        variant === "danger" && "border border-co/40 text-co hover:bg-co/10",
        className,
      )}
      {...p}
    />
  );
});

const inputCls =
  "n mt-1.5 w-full h-9 px-3 rounded-[5px] border border-line bg-ink text-hi outline-none focus:ring-1 focus:ring-em/60 placeholder:text-mut/70 disabled:opacity-60";

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null | undefined;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="text-mut text-[11px] uppercase tracking-wider">{label}</span>
      {children}
      {error ? <span className="block mt-1 text-[11px] text-co">{error}</span> : hint ? <span className="block mt-1 text-[11px] text-mut">{hint}</span> : null}
    </label>
  );
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { sans?: boolean }>(
  function TextInput({ className, sans, ...p }, ref) {
    return <input ref={ref} className={cn(inputCls, sans && "font-sans", className)} {...p} />;
  },
);

export function SelectInput({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputCls, "font-sans appearance-none pr-8 bg-[length:10px] bg-no-repeat bg-[right_12px_center]", className)} style={{ backgroundImage: "linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)", backgroundSize: "5px 5px, 5px 5px", backgroundPosition: "calc(100% - 15px) 50%, calc(100% - 10px) 50%" }} {...p}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
  surface = "panel",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
  surface?: "panel" | "ink";
}) {
  return (
    <div role="tablist" className={cn("flex p-0.5 rounded-[7px] border border-line", surface === "ink" ? "bg-ink" : "bg-panel", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[5px] whitespace-nowrap transition-colors",
              size === "md" ? "px-3 h-8" : "px-3 py-1.5 text-[12px]",
              active ? "bg-em/15 text-em ring-1 ring-em/60 glow-em-soft font-medium" : "text-mut hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        checked ? "bg-em/25 border-em/60" : "bg-ink border-line",
      )}
    >
      <span className={cn("inline-block h-3.5 w-3.5 rounded-full transition-transform", checked ? "translate-x-[18px] bg-em" : "translate-x-[2px] bg-mut")} />
    </button>
  );
}

export function Avatar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("w-8 h-8 rounded-[5px] bg-raised border border-line grid place-items-center text-[12px] font-semibold text-foreground shrink-0", className)}>
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded-[4px] bg-raised/60 animate-pulse", className)} />;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8 px-4">
      <div className="font-medium text-foreground">{title}</div>
      {children ? <div className="text-mut text-[12px] max-w-sm">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Modal({
  open,
  onOpenChange,
  eyebrow,
  title,
  children,
  footer,
  width = "max-w-[720px]",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eyebrow?: string;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-chrome/80 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] flex flex-col bg-panel border border-line rounded-[6px] shadow-2xl text-[13px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            width,
          )}
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line">
            <div className="min-w-0 flex-1">
              {eyebrow ? <SectionTitle>{eyebrow}</SectionTitle> : null}
              <DialogPrimitive.Title className="mt-1 text-[16px] font-semibold text-hi leading-snug">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">{eyebrow ?? "Dialog"}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="w-8 h-8 grid place-items-center rounded-[5px] border border-line text-mut hover:text-foreground hover:bg-raised" aria-label="Close">
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 py-4 overflow-y-auto">{children}</div>
          {footer ? <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 flex-wrap">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ProgressBar({ pct, className, tone = "em" }: { pct: number; className?: string; tone?: "em" | "soft" }) {
  return (
    <div className={cn("h-1.5 rounded-full bg-line overflow-hidden", className)}>
      <div className={cn("h-full rounded-full", tone === "em" ? "bg-em" : "bg-soft")} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export function LiveDot({ pulse = false }: { pulse?: boolean }) {
  return <i className={cn("inline-block w-1.5 h-1.5 rounded-full bg-em", pulse && "pulse")} />;
}
