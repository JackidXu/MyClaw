import React from 'react';

const SpinnerIcon: React.FC<React.SVGProps<SVGSVGElement>> = ({ className, ...props }) => {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.25" transform="rotate(0 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" transform="rotate(45 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" transform="rotate(90 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" transform="rotate(135 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" transform="rotate(180 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" transform="rotate(225 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" transform="rotate(270 8 8)" />
      <line x1="8" y1="2" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="1.0" transform="rotate(315 8 8)" />
    </svg>
  );
};

export default SpinnerIcon;
