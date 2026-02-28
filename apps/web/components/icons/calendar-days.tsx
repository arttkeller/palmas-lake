'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'motion/react';
import type { LucideProps } from 'lucide-react';

/**
 * Animated Calendar Days Icon
 * Based on movingicons.dev/r/calendar-days
 * Compatible with lucide-react icon interface
 */

const dayVariants: Variants = {
  normal: {
    scale: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    scale: [1, 1.3, 1],
    opacity: [1, 0.6, 1],
    transition: {
      delay: custom * 0.08,
      duration: 0.4,
      ease: 'easeInOut',
    },
  }),
};

const CalendarDaysIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, strokeWidth = 2, ...props }, ref) => {
    const controls = useAnimation();

    const handleMouseEnter = () => {
      controls.start('animate');
    };

    const handleMouseLeave = () => {
      controls.start('normal');
    };

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {/* Calendar frame */}
        <path d="M8 2v4" />
        <path d="M16 2v4" />
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
        
        {/* Calendar days */}
        <motion.path
          d="M8 14h.01"
          variants={dayVariants}
          animate={controls}
          custom={0}
        />
        <motion.path
          d="M12 14h.01"
          variants={dayVariants}
          animate={controls}
          custom={1}
        />
        <motion.path
          d="M16 14h.01"
          variants={dayVariants}
          animate={controls}
          custom={2}
        />
        <motion.path
          d="M8 18h.01"
          variants={dayVariants}
          animate={controls}
          custom={3}
        />
        <motion.path
          d="M12 18h.01"
          variants={dayVariants}
          animate={controls}
          custom={4}
        />
        <motion.path
          d="M16 18h.01"
          variants={dayVariants}
          animate={controls}
          custom={5}
        />
      </svg>
    );
  }
);

CalendarDaysIcon.displayName = 'CalendarDaysIcon';

export { CalendarDaysIcon };
export default CalendarDaysIcon;
