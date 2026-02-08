'use client';

import React, { useState, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { 
  navigationItems, 
  isNavItemActive, 
  type NavItem 
} from '@/lib/navigation-config';

// Re-export for convenience
export type { NavItem };
export { navigationItems };

// Static className for nav to prevent hydration mismatch
const NAV_CLASS_NAME = "w-full md:w-fit mx-auto px-2 md:px-4 py-2 md:py-3 rounded-none md:rounded-3xl bg-card/90 dark:bg-card/80 backdrop-blur-lg border-t md:border border-border/80 shadow-lg md:shadow-xl relative";

// Animation variants
const itemVariants: Variants = {
  initial: { rotateX: 0, opacity: 1 },
  hover: { rotateX: -90, opacity: 0 },
};

const backVariants: Variants = {
  initial: { rotateX: 90, opacity: 0 },
  hover: { rotateX: 0, opacity: 1 },
};

const glowVariants: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  hover: {
    opacity: 1,
    scale: 2,
    transition: {
      opacity: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.5, type: 'spring', stiffness: 300, damping: 25 },
    },
  },
};

const activeGlowVariants: Variants = {
  initial: { opacity: 0.5, scale: 1.5 },
  hover: {
    opacity: 1,
    scale: 2,
    transition: {
      opacity: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      scale: { duration: 0.5, type: 'spring', stiffness: 300, damping: 25 },
    },
  },
};

const sharedTransition = {
  type: 'spring' as const,
  stiffness: 100,
  damping: 20,
  duration: 0.5,
};

export interface BottomNavBarProps {
  items?: NavItem[];
  className?: string;
}

export function BottomNavBar({ 
  items = navigationItems, 
  className 
}: BottomNavBarProps): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only rendering motion components after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNavigation = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    router.push(href);
  };

  const isActive = (href: string): boolean => {
    return isNavItemActive(href, pathname);
  };

  return (
    <div className={cn(
      'fixed bottom-0 left-0 w-full md:bottom-4 md:left-1/2 md:-translate-x-1/2 z-50',
      className
    )}>
      <nav
        className={NAV_CLASS_NAME}
        data-testid="bottom-nav-bar"
      >
        <ul className="flex items-center justify-around md:justify-center gap-1 md:gap-3 relative z-10">
          {items.map((item: NavItem) => {
            const Icon = item.icon;
            const active = mounted ? isActive(item.href) : false;
            
            return (
              <li key={item.name} className="relative flex-1 md:flex-none">
                {mounted ? (
                  <motion.div
                    className="block rounded-xl md:rounded-2xl overflow-visible group relative"
                    style={{ perspective: '600px' }}
                    whileHover="hover"
                    initial="initial"
                  >
                    {/* Per-item glow */}
                    <motion.div
                      className="absolute inset-0 z-0 pointer-events-none rounded-xl md:rounded-2xl"
                      variants={active ? activeGlowVariants : glowVariants}
                      style={{
                        background: item.gradient,
                        opacity: active ? 0.5 : 0,
                      }}
                    />
                    {/* Front-facing */}
                    <motion.a
                      href={item.href}
                      onClick={(e) => handleNavigation(item.href, e)}
                      className={cn(
                        'flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2',
                        'px-2 py-1.5 md:px-4 md:py-2 relative z-10',
                        'bg-transparent transition-colors rounded-xl md:rounded-2xl text-xs md:text-sm',
                        active 
                          ? 'text-foreground font-semibold' 
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                      variants={itemVariants}
                      transition={sharedTransition}
                      style={{
                        transformStyle: 'preserve-3d',
                        transformOrigin: 'center bottom'
                      }}
                      data-testid={`nav-item-${item.name}`}
                      data-active={active}
                    >
                      <span className={cn(
                        'transition-colors duration-300',
                        active ? item.activeIconColor : item.iconColor
                      )}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="hidden md:inline font-medium">{item.label}</span>
                    </motion.a>
                    {/* Back-facing */}
                    <motion.a
                      href={item.href}
                      onClick={(e) => handleNavigation(item.href, e)}
                      className={cn(
                        'flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2',
                        'px-2 py-1.5 md:px-4 md:py-2 absolute inset-0 z-10',
                        'bg-transparent transition-colors rounded-xl md:rounded-2xl text-xs md:text-sm',
                        active 
                          ? 'text-foreground font-semibold' 
                          : 'text-muted-foreground group-hover:text-foreground'
                      )}
                      variants={backVariants}
                      transition={sharedTransition}
                      style={{
                        transformStyle: 'preserve-3d',
                        transformOrigin: 'center top',
                        transform: 'rotateX(90deg)'
                      }}
                    >
                      <span className={cn(
                        'transition-colors duration-300',
                        active ? item.activeIconColor : item.iconColor
                      )}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="hidden md:inline font-medium">{item.label}</span>
                    </motion.a>
                  </motion.div>
                ) : (
                  <div className="block rounded-xl md:rounded-2xl overflow-visible group relative">
                    <a
                      href={item.href}
                      className={cn(
                        'flex flex-col md:flex-row items-center justify-center gap-0.5 md:gap-2',
                        'px-2 py-1.5 md:px-4 md:py-2 relative z-10',
                        'bg-transparent transition-colors rounded-xl md:rounded-2xl text-xs md:text-sm',
                        'text-muted-foreground'
                      )}
                      data-testid={`nav-item-${item.name}`}
                    >
                      <span className={cn('transition-colors duration-300', item.iconColor)}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="hidden md:inline font-medium">{item.label}</span>
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export default BottomNavBar;
