import { useId } from "react";

export function YoorkerMark({ className }: { className?: string }) {
  const tile = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4a7bff" />
          <stop offset="1" stopColor="#1e3fb8" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6.5" fill={`url(#${tile})`} />
      <path
        d="M6.6 5.8 12 12.4 17.4 5.8M12 12.4v3.2"
        stroke="#fff"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="19" r="2.1" fill="#c8f53c" />
    </svg>
  );
}
