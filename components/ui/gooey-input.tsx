"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { motion } from "motion/react";

export interface GooeyInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
  trailing?: React.ReactNode;
}

export const GooeyInput = React.forwardRef<HTMLInputElement, GooeyInputProps>(
  ({ className = "", containerClassName = "", trailing, ...props }, ref) => {
    return (
      <motion.div
        layoutId="homios-search-pill"
        transition={{ type: "spring", stiffness: 260, damping: 28, mass: 0.75 }}
        className={`group relative isolate flex h-[64px] w-full items-center overflow-hidden rounded-full border border-white/20 bg-[#17171a]/88 px-5 shadow-[0_24px_90px_rgba(0,0,0,0.52),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-3xl ${containerClassName}`}
      >
        <div className="pointer-events-none absolute -left-8 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-blue-500/25 blur-2xl transition-all duration-500 group-focus-within:left-8 group-focus-within:bg-cyan-400/30" />
        <div className="pointer-events-none absolute -right-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-violet-500/20 blur-2xl transition-all duration-500 group-focus-within:right-6 group-focus-within:bg-fuchsia-400/25" />
        <Search
          aria-hidden="true"
          className="relative z-10 mr-3.5 shrink-0 text-white/60 transition-colors group-focus-within:text-white"
          size={21}
          strokeWidth={2}
        />
        <input
          ref={ref}
          className={`relative z-10 min-w-0 flex-1 bg-transparent text-[16px] font-medium tracking-[-0.01em] text-white outline-none placeholder:text-white/42 ${className}`}
          {...props}
        />
        {trailing && <div className="relative z-10 ml-3 shrink-0">{trailing}</div>}
      </motion.div>
    );
  },
);

GooeyInput.displayName = "GooeyInput";
