"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface GooeyInputClassNames {
  root?: string;
  filterWrap?: string;
  buttonRow?: string;
  trigger?: string;
  input?: string;
  bubble?: string;
  bubbleSurface?: string;
}

export interface GooeyInputProps {
  placeholder?: string;
  className?: string;
  classNames?: GooeyInputClassNames;
  collapsedWidth?: number;
  expandedWidth?: number;
  expandedOffset?: number;
  gooeyBlur?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

export function GooeyInput({
  placeholder = "Type to search...",
  className,
  classNames,
  collapsedWidth = 32, // to match a circular button width, standard Aceternity GooeyInput usually defaults to a bigger value, but we can set to match Toolbar
  expandedWidth = 200,
  expandedOffset = 50,
  gooeyBlur = 5,
  value,
  defaultValue = "",
  onValueChange,
  onOpenChange,
  disabled = false,
}: GooeyInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    onOpenChange?.(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleClose = () => {
    if (disabled) return;
    setIsOpen(false);
    onOpenChange?.(false);
    if (!isControlled) setInternalValue("");
    onValueChange?.("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInternalValue(e.target.value);
    onValueChange?.(e.target.value);
  };

  const currentWidth = isOpen ? expandedWidth : collapsedWidth;

  return (
    <div className={cn("relative flex items-center justify-end", className, classNames?.root)}>
      <svg width="0" height="0" className="absolute hidden">
        <defs>
          <filter id="gooey-filter">
            <feGaussianBlur in="SourceGraphic" stdDeviation={gooeyBlur} result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div
        className={cn("relative flex items-center", classNames?.filterWrap)}
        style={{ filter: "url(#gooey-filter)" }}
      >
        <motion.div
          animate={{ width: currentWidth }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className={cn(
            "relative flex items-center justify-center rounded-full transition-colors overflow-hidden",
            isOpen ? "bg-white dark:bg-white/10" : "bg-neutral-100/60 dark:bg-white/5 border border-neutral-200/40 dark:border-white/10",
            isOpen ? "h-8" : "h-8",
            classNames?.bubbleSurface
          )}
        >
          {!isOpen && (
            <button
              onClick={handleOpen}
              className={cn("flex w-full h-full items-center justify-center cursor-pointer", classNames?.trigger)}
            >
              <Search size={15} className="stroke-[2] text-gray-600 dark:text-gray-300" />
            </button>
          )}

          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center w-full px-3"
              >
                <Search size={14} className="stroke-[2] text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={currentValue}
                  onChange={handleChange}
                  placeholder={placeholder}
                  disabled={disabled}
                  className={cn(
                    "ml-2 w-full bg-transparent text-xs text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none",
                    classNames?.input
                  )}
                />
                {currentValue && (
                  <button
                    onClick={handleClose}
                    className="ml-1 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X size={12} className="stroke-[2]" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
