'use client';

import { useState, useCallback } from 'react';

interface UsersIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function UsersIcon({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
  className = ''
}: UsersIconProps) {
  const [animate, setAnimate] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (animate) return;
    setAnimate(true);
    setTimeout(() => {
      setAnimate(false);
    }, 700);
  }, [animate]);

  return (
    <div 
      className={`inline-block ${className}`} 
      aria-label="users" 
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
        className={`users-icon ${animate ? 'animate' : ''}`}
      >
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" className="users-path1" />
        <path d="M16 3.128a4 4 0 0 1 0 7.744" className="users-path2" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" className="users-path3" />
        <circle cx={9} cy={7} r={4} className="users-circle" />
      </svg>
      <style jsx>{`
        .users-path1,
        .users-path2,
        .users-path3,
        .users-circle {
          transition: transform 0.6s ease-in-out;
        }

        .users-icon.animate .users-path1 {
          animation: path1Bounce 0.6s ease-in-out;
          animation-delay: 0.1s;
        }

        .users-icon.animate .users-path2 {
          animation: path2Bounce 0.6s ease-in-out;
        }

        .users-icon.animate .users-path3 {
          animation: path3Bounce 0.6s ease-in-out;
        }

        .users-icon.animate .users-circle {
          animation: circleBounce 0.6s ease-in-out;
          animation-delay: 0.1s;
        }

        @keyframes path1Bounce {
          0% { transform: translateY(0); }
          33% { transform: translateY(2px); }
          66% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }

        @keyframes path2Bounce {
          0% { transform: translateY(0); }
          33% { transform: translateY(4px); }
          66% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }

        @keyframes path3Bounce {
          0% { transform: translateY(0); }
          33% { transform: translateY(2px); }
          66% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }

        @keyframes circleBounce {
          0% { transform: translateY(0); }
          33% { transform: translateY(4px); }
          66% { transform: translateY(-2px); }
          100% { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default UsersIcon;
