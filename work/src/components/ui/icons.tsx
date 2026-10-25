import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...props,
});

export const BrainIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 3A3 3 0 0 0 6.6 5.3 3 3 0 0 0 4 8.2a3 3 0 0 0 .6 4.6A3.2 3.2 0 0 0 6 17.5 3 3 0 0 0 9.5 21c1 0 1.9-.5 2.5-1.2V4.2A3 3 0 0 0 9.5 3Z" />
    <path d="M14.5 3a3 3 0 0 1 2.9 2.3A3 3 0 0 1 20 8.2a3 3 0 0 1-.6 4.6 3.2 3.2 0 0 1-1.4 4.7A3 3 0 0 1 14.5 21c-1 0-1.9-.5-2.5-1.2" />
    <path d="M8 9.5h2M14 9.5h2M8 14h2.5M13.5 14H16" />
  </svg>
);
export const SearchIcon = (p: P) => (<svg {...base(p)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>);
export const ExpandIcon = (p: P) => (<svg {...base(p)}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>);
export const CloseIcon = (p: P) => (<svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const PlusIcon = (p: P) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const GearIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);
export const UserIcon = (p: P) => (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>);
export const FloorIcon = (p: P) => (<svg {...base(p)}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M4 9h16M4 15h16" /></svg>);
export const GripIcon = (p: P) => (<svg {...base(p)}><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3} /></svg>);
export const TrashIcon = (p: P) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const EditIcon = (p: P) => (<svg {...base(p)}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /></svg>);
export const SendIcon = (p: P) => (<svg {...base(p)}><path d="M12 19V5M5 12l7-7 7 7" /></svg>);
export const StopIcon = (p: P) => (<svg {...base(p)}><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>);
export const ChatIcon = (p: P) => (<svg {...base(p)}><path d="M4 5h16v11H8l-4 4z" /></svg>);
export const SortIcon = (p: P) => (<svg {...base(p)}><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></svg>);
