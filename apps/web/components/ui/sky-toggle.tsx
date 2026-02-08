"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import { Sun, Moon } from "lucide-react";

interface SkyToggleProps {
  className?: string;
}

export function SkyToggle({ className }: SkyToggleProps) {
  const { resolvedTheme, toggleTheme, mounted } = useTheme();
  
  // Use light theme as default for SSR, then switch after mount
  const isDark = mounted ? resolvedTheme === "dark" : false;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative w-9 h-9 rounded-full overflow-hidden cursor-pointer transition-all duration-300",
        "flex items-center justify-center",
        "bg-muted/50 hover:bg-muted border border-border/50",
        "shadow-sm hover:shadow-md",
        className
      )}
      aria-label={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
    >
      {/* Sun icon (visible in dark mode - click to go light) */}
      <Sun 
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          "text-amber-500",
          isDark 
            ? "rotate-0 scale-100 opacity-100" 
            : "rotate-90 scale-0 opacity-0"
        )}
      />
      
      {/* Moon icon (visible in light mode - click to go dark) */}
      <Moon 
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          "text-slate-600 dark:text-slate-400",
          isDark 
            ? "-rotate-90 scale-0 opacity-0" 
            : "rotate-0 scale-100 opacity-100"
        )}
      />
    </button>
  );
}

export default SkyToggle;
