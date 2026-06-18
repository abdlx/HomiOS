"use client";
import React, { useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "motion/react";

import GlassSurface from "@/components/GlassSurface";

export const FloatingDock = ({
  items,
  desktopClassName,
  mobileClassName,
  glassSurfaces = true,
  reduceMotion = false,
}: {
  items: { title: string; icon: React.ReactNode; href?: string; id?: string, onClick?: () => void }[];
  desktopClassName?: string;
  mobileClassName?: string;
  glassSurfaces?: boolean;
  reduceMotion?: boolean;
}) => {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} glassSurfaces={glassSurfaces} reduceMotion={reduceMotion} />
    </>
  );
};

const FloatingDockDesktop = ({
  items,
  className,
  glassSurfaces,
  reduceMotion,
}: {
  items: { title: string; icon: React.ReactNode; href?: string; id?: string, onClick?: () => void }[];
  className?: string;
  glassSurfaces: boolean;
  reduceMotion: boolean;
}) => {
  let mouseX = useMotionValue(Infinity);
  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={`mx-auto flex h-20 gap-4 items-end rounded-[32px] px-4 pb-3 relative ${className || ""}`}
    >
      <div className="absolute inset-0 -z-10">
        {glassSurfaces ? (
          <GlassSurface
            width="100%"
            height="100%"
            borderRadius={32}
            distortionScale={300}
            opacity={1}
            borderWidth={0.2}
            displace={1.6}
            backgroundOpacity={0}
          />
        ) : (
          <div className="w-full h-full rounded-[32px] bg-black/30 border border-white/10 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-md" />
        )}
      </div>
      {items.map((item) => (
        <IconContainer mouseX={mouseX} reduceMotion={reduceMotion} key={item.title} {...item} />
      ))}
    </motion.div>
  );
};

function IconContainer({
  mouseX,
  title,
  icon,
  href,
  onClick,
  reduceMotion,
}: {
  mouseX: any;
  title: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  reduceMotion: boolean;
}) {
  let ref = useRef<HTMLDivElement>(null);

  let distance = useTransform(mouseX, (val: number) => {
    let bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  let widthTransform = useTransform(distance, [-150, 0, 150], reduceMotion ? [56, 56, 56] : [56, 80, 56]);
  let heightTransform = useTransform(distance, [-150, 0, 150], reduceMotion ? [56, 56, 56] : [56, 80, 56]);

  let widthTransformIcon = useTransform(distance, [-150, 0, 150], reduceMotion ? [56, 56, 56] : [56, 80, 56]);
  let heightTransformIcon = useTransform(distance, [-150, 0, 150], reduceMotion ? [56, 56, 56] : [56, 80, 56]);

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
        whileTap={reduceMotion ? undefined : { scale: 0.85, y: 4 }}
        transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 400, damping: 17 }}
        className="rounded-[18px] flex items-center justify-center relative cursor-pointer group origin-bottom"
      >
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, y: 10, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              className="px-2.5 py-1 whitespace-pre rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-white absolute left-1/2 -translate-x-1/2 -top-10 w-fit text-[11px] font-medium z-50 pointer-events-none shadow-lg text-center"
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
