// src/components/documents/doc-illustrations.tsx
/**
 * Vector illustrations for the three identity documents the wizard
 * accepts. Each is a self-contained SVG with no external assets —
 * they render identically everywhere and never depend on
 * next/image, a CDN, or the network.
 *
 * Design notes:
 *   · viewBox is fixed; the parent element controls the rendered size
 *     via `className="w-full h-auto"` or an explicit size.
 *   · No gradient IDs. If the same illustration appears twice on one
 *     page (e.g. the wizard renders all three cards), shared IDs would
 *     collide and colors would leak between instances. Solid fills
 *     layered with opacity keep every shape scoped to itself.
 *   · Colors are hard-coded to each document's identity (Zimbabwe ID
 *     green, generic license blue, passport navy with gold) rather
 *     than reading from theme tokens — a physical document has a
 *     fixed appearance, and the illustration should reflect that.
 */

interface ArtProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// National ID — landscape card, green field, holder photo, flag stripe
// ---------------------------------------------------------------------------

export function NationalIdArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 160 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Card body */}
      <rect
        x="4" y="4" width="152" height="92" rx="9"
        fill="#dcfce7"
        stroke="#16a34a"
        strokeWidth="1.5"
      />

      {/* Inner border */}
      <rect
        x="8" y="8" width="144" height="84" rx="6"
        fill="none"
        stroke="#16a34a"
        strokeOpacity="0.25"
        strokeWidth="0.75"
      />

      {/* Country banner — top strip */}
      <rect x="8" y="8" width="144" height="14" rx="6" fill="#16a34a" />
      <rect x="8" y="16" width="144" height="6" fill="#16a34a" />
      <text
        x="14" y="18"
        fontSize="6"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.5"
      >
        REPUBLIC OF ZIMBABWE · NATIONAL ID
      </text>

      {/* Holder photo */}
      <rect x="14" y="28" width="34" height="42" rx="3" fill="#86efac" />
      <circle cx="31" cy="42" r="6" fill="#16a34a" fillOpacity="0.35" />
      <path
        d="M22 62 Q22 52, 31 52 Q40 52, 40 62 Z"
        fill="#16a34a"
        fillOpacity="0.35"
      />

      {/* Text field bars — name / DOB / ID / place */}
      <rect x="54" y="30" width="80" height="3.5" rx="1.75" fill="#16a34a" fillOpacity="0.75" />
      <rect x="54" y="38" width="60" height="3.5" rx="1.75" fill="#16a34a" fillOpacity="0.5" />
      <rect x="54" y="46" width="72" height="3.5" rx="1.75" fill="#16a34a" fillOpacity="0.4" />
      <rect x="54" y="54" width="52" height="3.5" rx="1.75" fill="#16a34a" fillOpacity="0.4" />
      <rect x="54" y="62" width="66" height="3.5" rx="1.75" fill="#16a34a" fillOpacity="0.4" />

      {/* Flag-inspired stripe — small accent */}
      <g transform="translate(126 66)">
        <rect x="0" y="0" width="20" height="3" fill="#16a34a" />
        <rect x="0" y="3" width="20" height="3" fill="#facc15" />
        <rect x="0" y="6" width="20" height="3" fill="#dc2626" />
        <rect x="0" y="9" width="20" height="3" fill="#111827" />
      </g>

      {/* Small signature line */}
      <rect x="14" y="76" width="42" height="1" fill="#16a34a" fillOpacity="0.4" />
      <rect x="14" y="80" width="30" height="1" fill="#16a34a" fillOpacity="0.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Driver's License — landscape card, blue field, header band
// ---------------------------------------------------------------------------

export function DriversLicenseArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 160 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Card body */}
      <rect
        x="4" y="4" width="152" height="92" rx="9"
        fill="#dbeafe"
        stroke="#2563eb"
        strokeWidth="1.5"
      />

      <rect
        x="8" y="8" width="144" height="84" rx="6"
        fill="none"
        stroke="#2563eb"
        strokeOpacity="0.25"
        strokeWidth="0.75"
      />

      {/* Header band */}
      <rect x="8" y="8" width="144" height="14" rx="6" fill="#2563eb" />
      <rect x="8" y="16" width="144" height="6" fill="#2563eb" />
      <text
        x="14" y="18"
        fontSize="6"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="system-ui, sans-serif"
        letterSpacing="0.5"
      >
        DRIVER&apos;S LICENCE
      </text>

      {/* Holder photo */}
      <rect x="14" y="28" width="34" height="42" rx="3" fill="#93c5fd" />
      <circle cx="31" cy="42" r="6" fill="#2563eb" fillOpacity="0.35" />
      <path
        d="M22 62 Q22 52, 31 52 Q40 52, 40 62 Z"
        fill="#2563eb"
        fillOpacity="0.35"
      />

      {/* Text bars */}
      <rect x="54" y="30" width="80" height="3.5" rx="1.75" fill="#2563eb" fillOpacity="0.75" />
      <rect x="54" y="38" width="60" height="3.5" rx="1.75" fill="#2563eb" fillOpacity="0.5" />
      <rect x="54" y="46" width="72" height="3.5" rx="1.75" fill="#2563eb" fillOpacity="0.4" />
      <rect x="54" y="54" width="52" height="3.5" rx="1.75" fill="#2563eb" fillOpacity="0.4" />

      {/* Categories strip — small squares like real license endorsements */}
      <g transform="translate(126 60)">
        <rect x="0" y="0" width="6" height="6" rx="1" fill="#2563eb" fillOpacity="0.7" />
        <rect x="8" y="0" width="6" height="6" rx="1" fill="#2563eb" fillOpacity="0.5" />
        <rect x="16" y="0" width="6" height="6" rx="1" fill="#2563eb" fillOpacity="0.3" />
      </g>

      {/* Signature */}
      <rect x="14" y="76" width="42" height="1" fill="#2563eb" fillOpacity="0.4" />
      <rect x="14" y="80" width="30" height="1" fill="#2563eb" fillOpacity="0.3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Passport — portrait booklet, navy cover, gold crest
// ---------------------------------------------------------------------------

export function PassportArt({ className }: ArtProps) {
  return (
    <svg
      viewBox="0 0 100 130"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* Booklet body */}
      <rect
        x="6" y="6" width="88" height="118" rx="6"
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth="1.5"
      />

      {/* Book spine shadow */}
      <rect x="6" y="6" width="8" height="118" rx="6" fill="#0f172a" fillOpacity="0.6" />

      {/* Gold border frame */}
      <rect
        x="16" y="16" width="68" height="98" rx="3"
        fill="none"
        stroke="#d4af37"
        strokeOpacity="0.7"
        strokeWidth="1"
      />

      {/* Top label — country name */}
      <text
        x="50" y="30"
        fontSize="6"
        fontWeight="800"
        fill="#d4af37"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        letterSpacing="1.2"
      >
        ZIMBABWE
      </text>

      {/* Crest — center */}
      <g transform="translate(50 62)">
        {/* Outer ring */}
        <circle cx="0" cy="0" r="18" fill="none" stroke="#d4af37" strokeWidth="1.2" />
        <circle cx="0" cy="0" r="14" fill="none" stroke="#d4af37" strokeWidth="0.6" strokeOpacity="0.6" />
        {/* Bird silhouette — simplified Zimbabwe bird */}
        <path
          d="M -6 4 L -4 -2 L -1 -4 L 1 -8 L 3 -4 L 6 -3 L 4 1 L 6 4 L 2 3 L 0 6 L -2 3 Z"
          fill="#d4af37"
          fillOpacity="0.9"
        />
        {/* Star above */}
        <circle cx="0" cy="-10" r="1.4" fill="#d4af37" />
      </g>

      {/* Passport wordmark */}
      <text
        x="50" y="92"
        fontSize="7"
        fontWeight="800"
        fill="#d4af37"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        letterSpacing="2.5"
      >
        PASSPORT
      </text>

      {/* Barcode strip at bottom */}
      <g transform="translate(24 102)">
        <rect x="0"  y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="2"  y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="4"  y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="7"  y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="9"  y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="11" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="13" y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="16" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="18" y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="20" y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="23" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="25" y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="27" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="29" y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="32" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="34" y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="36" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="38" y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="41" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="43" y="0" width="1"   height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="45" y="0" width="1.6" height="6" fill="#d4af37" fillOpacity="0.6" />
        <rect x="48" y="0" width="0.6" height="6" fill="#d4af37" fillOpacity="0.6" />
      </g>
    </svg>
  );
}
