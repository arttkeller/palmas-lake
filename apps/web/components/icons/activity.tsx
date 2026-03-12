'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'motion/react';
import type { LucideProps } from 'lucide-react';

const pulseVariants: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.3 },
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0.4, 1],
    transition: {
      duration: 0.8,
      ease: 'easeInOut',
    },
  },
};

const ActivityIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        <motion.polyline
          points="22 12 18 12 15 21 9 3 6 12 2 12"
          variants={pulseVariants}
          animate={controls}
        />
      </svg>
    );
  }
);

ActivityIcon.displayName = 'ActivityIcon';

export { ActivityIcon };
export default ActivityIcon;
