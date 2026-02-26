'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'framer-motion';
import type { LucideProps } from 'lucide-react';

const bellVariants: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, 15, -15, 10, -10, 5, 0],
    transition: {
      duration: 0.6,
      ease: 'easeInOut',
    },
  },
};

const BellIcon = forwardRef<SVGSVGElement, LucideProps>(
  ({ className, size = 24, strokeWidth = 2, ...props }, ref) => {
    const controls = useAnimation();

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
        onMouseEnter={() => controls.start('animate')}
        onMouseLeave={() => controls.start('normal')}
        {...props}
      >
        <motion.g variants={bellVariants} animate={controls} style={{ originX: '50%', originY: '0%' }}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        </motion.g>
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    );
  }
);

BellIcon.displayName = 'BellIcon';

export { BellIcon };
export default BellIcon;
