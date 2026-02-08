'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'framer-motion';
import type { LucideProps } from 'lucide-react';

/**
 * Animated Chart Column Icon
 * Based on movingicons.dev/r/chart-column
 * Compatible with lucide-react icon interface
 */

const barVariants: Variants = {
  normal: {
    scaleY: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  animate: (custom: { delay: number; scale: number }) => ({
    scaleY: [1, custom.scale, 1],
    transition: {
      delay: custom.delay,
      duration: 0.5,
      ease: 'easeInOut',
    },
  }),
};

const ChartColumnIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        {/* Base line */}
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        
        {/* Chart bars */}
        <motion.path
          d="M18 17V9"
          variants={barVariants}
          animate={controls}
          custom={{ delay: 0, scale: 0.6 }}
          style={{ transformOrigin: 'center bottom' }}
        />
        <motion.path
          d="M13 17V5"
          variants={barVariants}
          animate={controls}
          custom={{ delay: 0.1, scale: 0.7 }}
          style={{ transformOrigin: 'center bottom' }}
        />
        <motion.path
          d="M8 17v-3"
          variants={barVariants}
          animate={controls}
          custom={{ delay: 0.2, scale: 1.5 }}
          style={{ transformOrigin: 'center bottom' }}
        />
      </svg>
    );
  }
);

ChartColumnIcon.displayName = 'ChartColumnIcon';

export { ChartColumnIcon };
export default ChartColumnIcon;
