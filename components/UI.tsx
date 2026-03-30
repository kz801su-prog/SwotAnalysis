import React from "react";
import { Loader2 } from "lucide-react";

export function Card({ title, sub, children, className = "" }: React.PropsWithChildren<{ title?: string; sub?: string; className?: string }>) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || sub) && (
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          {title && <div className="text-lg font-semibold tracking-tight text-slate-900">{title}</div>}
          {sub && <div className="text-sm text-slate-500 mt-1">{sub}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

export function Button({ variant = "primary", className = "", type = "button", isLoading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger", isLoading?: boolean }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  // Theme Color Change: Red -> Emerald (Fresh Green)
  const variants = {
    primary: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 border border-emerald-600",
    secondary: "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 border border-blue-600",
    ghost: "bg-transparent hover:bg-slate-100 border border-transparent text-slate-600 hover:text-slate-900",
    danger: "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-emerald-600"
  };

  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} disabled={isLoading || rest.disabled} {...rest}>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
      {rest.children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      // Changed focus ring to Emerald
      className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm ${props.className}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const { options, className, ...rest } = props;
  return (
    <div className="relative">
      <select
        {...rest}
        // Changed focus ring to Emerald
        className={`w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors shadow-sm ${className}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-slate-900">
            {o.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
      </div>
    </div>
  );
}

export function Badge({ children, color = "default", className = "" }: React.PropsWithChildren<{ color?: "default" | "success" | "warning" | "outline"; className?: string }>) {
  const colors = {
    default: "bg-slate-100 border-slate-200 text-slate-600",
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    outline: "bg-transparent border-slate-200 text-slate-400"
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${colors[color]} ${className}`}>
      {children}
    </span>
  );
}

export function Modal({ open, title, onClose, children }: React.PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="font-semibold text-lg text-slate-900">{title}</div>
          <Button variant="ghost" onClick={onClose} className="!p-2 !h-auto">✕</Button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}