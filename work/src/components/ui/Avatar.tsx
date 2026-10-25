import { initials } from "../../lib/util";

interface Props {
  name: string;
  size?: string;
  /** Gerente ganha anel duplo; agente trabalhando ganha brilho branco. */
  variant?: "agent" | "manager";
  working?: boolean;
  inactive?: boolean;
}

/** Avatar de IA: chip hexagonal com as iniciais. */
export function Avatar({ name, size = "h-9 w-9 text-xs", variant = "agent", working, inactive }: Props) {
  return (
    <div className={`${size} relative grid shrink-0 place-items-center`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points="20,2 36,11 36,29 20,38 4,29 4,11"
                 className={`${inactive ? "fill-zinc-900 stroke-zinc-600" : "fill-neon/10 stroke-neon/60"} transition`}
                 strokeWidth={1.5} />
        {variant === "manager" && (
          <polygon points="20,-1 39,10 39,30 20,41 1,30 1,10" className="fill-none stroke-neon" strokeWidth={0.8} opacity={0.6} />
        )}
      </svg>
      <span className={`relative font-semibold ${inactive ? "text-zinc-500" : working ? "text-white" : "text-neon"}`}>
        {initials(name) || "IA"}
      </span>
      {working && <span className="absolute inset-0 animate-ping rounded-full bg-white/20" aria-hidden />}
    </div>
  );
}
