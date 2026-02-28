'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'motion/react';
import type { LucideProps } from 'lucide-react';

/**
 * Animated Users Icon
 * Based on movingicons.dev/r/users
 * Compatible with lucide-react icon interface
 */

const userVariants: Variants = {
  normal: {
    x: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  animate: (custom: number) => ({
    x: [0, custom, 0],
    transition: {
      duration: 0.5,
      ease: 'easeInOut',
    },
  }),
};

const UsersIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        {/* Main user group */}
        <motion.g
          variants={userVariants}
          animate={controls}
          custom={-2}
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </motion.g>
        
        {/* Secondary user */}
        <motion.g
          variants={userVariants}
          animate={controls}
          custom={2}
        >
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </motion.g>
      </svg>
    );
  }
);

UsersIcon.displayName = 'UsersIcon';

export { UsersIcon };
export default UsersIcon;
