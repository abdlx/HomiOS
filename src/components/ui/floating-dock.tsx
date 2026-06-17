"use client";
import React, { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "motion/react";

import GlassSurface from "@/components/GlassSurface";

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: { title: string; icon: React.ReactNode; href?: string; id?: string, onClick?: () => void }[];
  desktopClassName?: string;
  mobileClassName?: string;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
    </>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
}: {
  items: { title: string; icon: React.ReactNode; href?: string; id?: string, onClick?: () => void }[];
  className?: string;
}) => {
  let mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={`mx-auto flex ${className || ""}`}
    >
      <GlassSurface
        width="auto"
        height={80}
        borderRadius={32}
      >
        <div className="flex items-end gap-4 px-2 pb-1 h-full">
          {items.map((item) => (
            <IconContainer mouseX={mouseX} key={item.title} {...item} />
          ))}
        </div>
      </GlassSurface>
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
}: {
  mouseX: any;
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  let ref = useRef<HTMLDivElement>(null);

  let distance = useTransform(mouseX, (val: number) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-150, 0, 150], [56, 80, 56]);
  let heightTransform = useTransform(distance, [-150, 0, 150], [56, 80, 56]);

  let widthTransformIcon = useTransform(distance, [-150, 0, 150], [56, 80, 56]);
  let heightTransformIcon = useTransform(distance, [-150, 0, 150], [56, 80, 56]);

  let width = useSpring(widthTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let height = useSpring(heightTransform, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  let widthIcon = useSpring(widthTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });
  let heightIcon = useSpring(heightTransformIcon, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const [hovered, setHovered] = useState(false);

  return (
    <div onClick={onClick}>
      <motion.div
        ref={ref}
        style={{ width, height }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="rounded-[18px] flex items-center justify-center relative cursor-pointer group origin-bottom"
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              className="px-2.5 py-1 whitespace-pre rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-white absolute left-1/2 -translate-x-1/2 -top-10 w-fit text-[11px] font-medium z-50 pointer-events-none shadow-lg"
            >
              {title}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div
          style={{ width: widthIcon, height: heightIcon }}
          className="flex items-center justify-center origin-bottom relative z-10"
        >
          {icon}
        </motion.div>
      </motion.div>
    </div>
  );
}
