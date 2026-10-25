import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const campo =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none transition focus:border-neon/60 focus:ring-2 focus:ring-neon/10";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export const TextInput = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${campo} ${p.className ?? ""}`} />;
export const TextArea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={2} {...p} className={`${campo} resize-none`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${campo} ${p.className ?? ""}`} />;
