'use client';

import React, { forwardRef } from 'react';
import { motion, useAnimation, type Variants } from 'motion/react';
import type { LucideProps } from 'lucide-react';

/**
 * Animated Message Circle More Icon
 * Based on movingicons.dev/r/message-circle-more
 * Compatible with lucide-react icon interface
 */

const dotVariants: Variants = {
  normal: {
    opacity: 1,
  },
  animate: (custom: number) => ({
    opacity: [1, 0.4, 1],
    transition: {
      delay: custom * 0.15,
      duration: 0.6,
      ease: 'easeInOut',
    },
  }),
};

const MessageCircleMoreIcon = forwardRef<SVGSVGElement, LucideProps>(
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
        {/* Message bubble */}
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        
        {/* Three dots */}
        <motion.path
          d="M8 12h.01"
          variants={dotVariants}
          animate={controls}
          custom={0}
        />
        <motion.path
          d="M12 12h.01"
          variants={dotVariants}
          animate={controls}
          custom={1}
        />
        <motion.path
          d="M16 12h.01"
          variants={dotVariants}
          animate={controls}
          custom={2}
        />
      </svg>
    );
  }
);

MessageCircleMoreIcon.displayName = 'MessageCircleMoreIcon';

export { MessageCircleMoreIcon };
export default MessageCircleMoreIcon;
