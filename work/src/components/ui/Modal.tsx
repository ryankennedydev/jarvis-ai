import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CloseIcon } from "./icons";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ title, onClose, children, footer, width = "max-w-lg" }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-[aparecer_.18s_ease]"
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
           className={`w-full ${width} max-h-[90vh] overflow-hidden rounded-2xl border border-neon/20 bg-[#0a0d09]/95 shadow-[0_0_60px_rgba(196,255,61,0.08)] flex flex-col`}>
        <header className="flex items-center border-b border-white/5 px-5 py-4">
          <h2 className="flex-1 text-xs font-semibold uppercase tracking-[0.25em] text-neon">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white" aria-label="Fechar">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-white/5 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Button({ variant = "ghost", className = "", ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const estilos = {
    primary: "bg-neon text-black font-semibold hover:shadow-[0_0_20px_rgba(196,255,61,0.45)] disabled:opacity-40",
    ghost: "border border-white/10 text-zinc-300 hover:border-neon/40 hover:text-neon",
    danger: "border border-red-500/30 text-red-300 hover:bg-red-500/10",
  }[variant];
  return <button {...props} className={`rounded-lg px-4 py-2 text-sm transition ${estilos} ${className}`} />;
}
