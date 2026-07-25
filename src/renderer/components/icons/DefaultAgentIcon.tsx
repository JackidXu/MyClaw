import React from 'react';

const DefaultAgentIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#default-ai-fill)" />
    <path
      d="M12 6L13.5 9.5L17 11L13.5 12.5L12 16L10.5 12.5L7 11L10.5 9.5L12 6Z"
      fill="white"
    />
    <path
      d="M17 15L17.75 16.75L19.5 17.5L17.75 18.25L17 20L16.25 18.25L14.5 17.5L16.25 16.75L17 15Z"
      fill="white"
      fillOpacity="0.85"
    />
    <defs>
      <linearGradient id="default-ai-fill" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
  </svg>
);

export default DefaultAgentIcon;
