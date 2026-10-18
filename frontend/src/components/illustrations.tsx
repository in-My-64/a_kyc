// src/components/illustrations.tsx
/**
 * Vector illustration kit. All SVGs are self-contained (no external
 * assets, no gradient IDs to collide between instances). They render
 * crisply at any size and never depend on the network.
 *
 * Used to soften empty states, celebrate success, and give error
 * surfaces a human face. Colors are drawn from theme tokens so
 * light/dark mode and future rebrands cascade automatically.
 */

interface ArtProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

/** Empty inbox / no applications — a card stack with a floating "+". */
export function EmptyApplicationsArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 180 140" className={className} aria-hidden>
      {/* Back card */}
      <rect x="30" y="24" width="120" height="80" rx="10"
        fill="var(--primary-soft)" opacity="0.6" />
      {/* Middle card */}
      <rect x="42" y="16" width="120" height="80" rx="10"
        fill="var(--primary-soft)" opacity="0.85" />
      {/* Front card */}
      <rect x="54" y="8" width="120" height="80" rx="10"
        fill="var(--primary)" opacity="0.14"
        stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="1.5" />
      {/* Text bars on front card */}
      <rect x="66" y="24" width="52" height="5" rx="2.5"
        fill="var(--primary)" opacity="0.7" />
      <rect x="66" y="36" width="80" height="4" rx="2"
        fill="var(--primary)" opacity="0.4" />
      <rect x="66" y="46" width="60" height="4" rx="2"
        fill="var(--primary)" opacity="0.4" />
      <rect x="66" y="56" width="72" height="4" rx="2"
        fill="var(--primary)" opacity="0.4" />
      {/* Floating + */}
      <circle cx="150" cy="94" r="18" fill="var(--primary)" />
      <path d="M 150 86 L 150 102 M 142 94 L 158 94"
        stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Empty search — magnifier with no results. */
export function NoSearchResultsArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 180 140" className={className} aria-hidden>
      <circle cx="72" cy="60" r="34"
        fill="var(--primary-soft)" opacity="0.6"
        stroke="var(--primary)" strokeOpacity="0.4" strokeWidth="2" />
      <line x1="96" y1="84" x2="120" y2="108"
        stroke="var(--primary)" strokeOpacity="0.6"
        strokeWidth="6" strokeLinecap="round" />
      <rect x="56" y="52" width="32" height="4" rx="2"
        fill="var(--primary)" opacity="0.5" />
      <rect x="56" y="62" width="24" height="4" rx="2"
        fill="var(--primary)" opacity="0.4" />
      <rect x="56" y="72" width="28" height="4" rx="2"
        fill="var(--primary)" opacity="0.4" />
    </svg>
  );
}

/** Empty documents — folder with no files. */
export function EmptyDocumentsArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 180 140" className={className} aria-hidden>
      <path d="M 34 40 L 34 112 Q 34 120 42 120 L 138 120 Q 146 120 146 112 L 146 56 Q 146 48 138 48 L 88 48 L 76 36 L 42 36 Q 34 36 34 44 Z"
        fill="var(--primary-soft)" opacity="0.7"
        stroke="var(--primary)" strokeOpacity="0.4" strokeWidth="1.5" />
      <path d="M 34 52 L 146 52"
        stroke="var(--primary)" strokeOpacity="0.3" strokeWidth="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

/** Big success checkmark with a soft halo. */
export function SuccessCheckArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <circle cx="80" cy="80" r="60"
        fill="var(--success-soft)" opacity="0.7" />
      <circle cx="80" cy="80" r="44"
        fill="var(--success)" opacity="0.12" />
      <circle cx="80" cy="80" r="32" fill="var(--success)" />
      <path d="M 66 80 L 76 90 L 96 70"
        stroke="white" strokeWidth="4.5" strokeLinecap="round"
        strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error / warning
// ---------------------------------------------------------------------------

/** Warning triangle with an exclamation. For error modals and inline surfaces. */
export function WarningTriangleArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <circle cx="80" cy="80" r="60"
        fill="var(--danger-soft)" opacity="0.7" />
      <path d="M 80 36 L 124 116 Q 126 120 122 120 L 38 120 Q 34 120 36 116 Z"
        fill="var(--danger)" opacity="0.15"
        stroke="var(--danger)" strokeWidth="2" />
      <rect x="77" y="64" width="6" height="32" rx="3" fill="var(--danger)" />
      <circle cx="80" cy="106" r="4" fill="var(--danger)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Hero / support
// ---------------------------------------------------------------------------

/** Support agent — speech bubble with a headset silhouette. */
export function SupportHeroArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 240 180" className={className} aria-hidden>
      {/* Speech bubble */}
      <path d="M 40 30 L 200 30 Q 216 30 216 46 L 216 118 Q 216 134 200 134 L 92 134 L 60 162 L 60 134 L 40 134 Q 24 134 24 118 L 24 46 Q 24 30 40 30 Z"
        fill="var(--primary-soft)" opacity="0.7" />
      {/* Headset silhouette */}
      <circle cx="120" cy="82" r="26" fill="var(--primary)" opacity="0.35" />
      <path d="M 94 82 Q 94 52 120 52 Q 146 52 146 82"
        stroke="var(--primary)" strokeWidth="3" fill="none" />
      <rect x="88" y="78" width="10" height="18" rx="4" fill="var(--primary)" opacity="0.7" />
      <rect x="142" y="78" width="10" height="18" rx="4" fill="var(--primary)" opacity="0.7" />
      {/* Dots in the bubble */}
      <circle cx="80" cy="48" r="3" fill="var(--primary)" opacity="0.5" />
      <circle cx="90" cy="48" r="3" fill="var(--primary)" opacity="0.5" />
      <circle cx="100" cy="48" r="3" fill="var(--primary)" opacity="0.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Brand mark — used in loading screens
// ---------------------------------------------------------------------------

/** Large brand mark with ambient ring — used on loading shells. */
export function BrandMarkArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="60" r="48"
        fill="var(--primary-soft)" opacity="0.5" />
      <circle cx="60" cy="60" r="36"
        fill="var(--primary)" opacity="0.14" />
      <path d="M 60 34 L 82 44 L 82 66 Q 82 82 60 90 Q 38 82 38 66 L 38 44 Z"
        fill="var(--primary)" />
      <path d="M 52 62 L 58 68 L 70 56"
        stroke="white" strokeWidth="3.5" strokeLinecap="round"
        strokeLinejoin="round" fill="none" />
    </svg>
  );
}
