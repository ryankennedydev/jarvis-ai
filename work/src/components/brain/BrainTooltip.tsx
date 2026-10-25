export interface TooltipInfo {
  x: number;
  y: number;
  title: string;
  subtitle: string;
  inactive?: boolean;
}

export function BrainTooltip({ info }: { info: TooltipInfo }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+14px)] whitespace-nowrap rounded-lg border border-neon/30 bg-black/85 px-3 py-2 shadow-[0_0_24px_rgba(196,255,61,0.15)] backdrop-blur"
      style={{ left: info.x, top: info.y }}
    >
      <div className="text-sm font-semibold text-white">{info.title}</div>
      <div className="text-xs text-neon/80">
        {info.subtitle}
        {info.inactive && <span className="ml-2 text-zinc-500">· inativo</span>}
      </div>
    </div>
  );
}
