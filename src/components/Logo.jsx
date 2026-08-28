export default function Logo({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      <path
        d="M 55 18 A 28 20 0 0 0 55 50 A 28 20 0 0 1 55 82"
        fill="none"
        stroke="#10b981"
        strokeWidth="30"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M 55 18 A 28 20 0 0 0 55 50 A 28 20 0 0 1 55 82"
        fill="none"
        stroke="#10b981"
        strokeWidth="20"
        strokeLinecap="round"
      />
      <path
        d="M 55 18 A 28 20 0 0 0 55 50 A 28 20 0 0 1 55 82"
        fill="none"
        stroke="#022c22"
        strokeWidth="3"
        strokeDasharray="3 6"
        strokeLinecap="round"
      />
      <circle cx="55" cy="18" r="14" fill="#fbbf24" opacity="0.3" />
      <circle cx="55" cy="18" r="7" fill="#fbbf24" />
    </svg>
  );
}
