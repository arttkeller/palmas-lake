'use client';

import { useState, useCallback } from 'react';

interface QuestionMarkIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function QuestionMarkIcon({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  className = ''
}: QuestionMarkIconProps) {
  const [animate, setAnimate] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (animate) return;
    setAnimate(true);
    setTimeout(() => {
      setAnimate(false);
    }, 800);
  }, [animate]);

  return (
    <div 
      className={`inline-block ${className}`} 
      aria-label="message-circle-question-mark" 
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
      >
        <g 
          className="message-circle-question-group"
          style={{
            transformOrigin: 'bottom left',
            animation: animate ? 'questionGroupRotation 0.8s ease-in-out' : 'none'
          }}
        >
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <path 
            d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" 
            style={{
              animation: animate ? 'questionPath2Animation 0.8s ease-in-out' : 'none'
            }}
          />
          <path d="M12 17h.01" />
        </g>
      </svg>
      <style jsx>{`
        @keyframes questionGroupRotation {
          0% {
            transform: rotate(0deg);
          }
          40% {
            transform: rotate(8deg);
          }
          60% {
            transform: rotate(-8deg);
          }
          80% {
            transform: rotate(2deg);
          }
          100% {
            transform: rotate(0deg);
          }
        }

        @keyframes questionPath2Animation {
          0% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(1px);
          }
          70% {
            transform: translateY(-0.25px);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default QuestionMarkIcon;
