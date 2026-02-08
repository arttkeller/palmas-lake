'use client';

import { useState, useCallback } from 'react';

interface ShieldAlertIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function ShieldAlertIcon({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  className = ''
}: ShieldAlertIconProps) {
  const [animate, setAnimate] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (animate) return;
    setAnimate(true);
    setTimeout(() => {
      setAnimate(false);
    }, 500);
  }, [animate]);

  return (
    <div 
      className={`inline-block ${className}`} 
      aria-label="shield-alert" 
      role="img" 
      onMouseEnter={handleMouseEnter}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          animation: animate ? 'shieldAlertAnimation 0.5s ease-in-out' : 'none'
        }}
      >
        <path
          d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        />
        <g>
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </g>
      </svg>
      <style jsx>{`
        @keyframes shieldAlertAnimation {
          0% {
            transform: scale(1) rotate(0deg);
          }
          20% {
            transform: scale(1.1) rotate(-3deg);
          }
          40% {
            transform: scale(1.1) rotate(3deg);
          }
          60% {
            transform: scale(1.1) rotate(-2deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}

export default ShieldAlertIcon;
