export default function Logo({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 100 140" className={className}>
      <path
        d="M 64 20 A 24 24 0 0 0 64 68 A 24 24 0 0 1 64 116"
        fill="none"
        stroke="#10b981"
        strokeWidth="28"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M 64 20 A 24 24 0 0 0 64 68 A 24 24 0 0 1 64 116"
        fill="none"
        stroke="#10b981"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M 64 20 A 24 24 0 0 0 64 68 A 24 24 0 0 1 64 116"
        fill="none"
        stroke="#022c22"
        strokeWidth="2.5"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <circle cx="64" cy="20" r="17" fill="#fbbf24" opacity="0.3" />
      <circle cx="64" cy="20" r="8" fill="#fbbf24" />
    </svg>
  );
}
