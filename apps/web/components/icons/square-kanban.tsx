'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'motion/react';
import type { LucideProps } from 'lucide-react';

/**
 * Animated Square Kanban Icon
 * Based on movingicons.dev/r/square-kanban
 * Compatible with lucide-react icon interface
 */

const rectVariants: Variants = {
  normal: {
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
  animate: (custom: { delay: number; yOffset: number }) => ({
    y: [0, custom.yOffset, 0],
    transition: {
      delay: custom.delay,
      duration: 0.5,
      ease: 'easeInOut',
    },
  }),
};

const SquareKanbanIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        {/* Outer rounded square */}
        <rect width="18" height="18" x="3" y="3" rx="2" />
        
        {/* Left column bar */}
        <motion.path
          d="M8 7v7"
          variants={rectVariants}
          animate={controls}
          custom={{ delay: 0, yOffset: -2 }}
        />
        
        {/* Middle column bar */}
        <motion.path
          d="M12 7v4"
          variants={rectVariants}
          animate={controls}
          custom={{ delay: 0.1, yOffset: -2 }}
        />
        
        {/* Right column bar */}
        <motion.path
          d="M16 7v10"
          variants={rectVariants}
          animate={controls}
          custom={{ delay: 0.2, yOffset: -2 }}
        />
      </svg>
    );
  }
);

SquareKanbanIcon.displayName = 'SquareKanbanIcon';

export { SquareKanbanIcon };
export default SquareKanbanIcon;
