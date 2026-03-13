"use client"

import { motion } from "framer-motion"
import { cn } from "@/common/lib/utils"

interface BorderBeamProps {
  size?: number
  duration?: number
  delay?: number
  colorFrom?: string
  colorTo?: string
  className?: string
  borderWidth?: number
}

export function BorderBeam({
  className,
  size = 50,
  delay = 0,
  duration = 6,
  colorFrom = "#ffaa40",
  colorTo = "#9c40ff",
  borderWidth = 1.5,
}: BorderBeamProps) {
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
      style={{
        padding: `${borderWidth}px`,
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}
    >
      <motion.div
        className={cn("absolute aspect-square", className)}
        style={{
          width: size,
          offsetPath: `rect(0 auto auto 0 round ${size}px)`,
          background: `linear-gradient(to left, ${colorFrom}, ${colorTo}, transparent)`,
        }}
        initial={{ offsetDistance: '0%' }}
        animate={{ offsetDistance: '100%' }}
        transition={{
          repeat: Infinity,
          ease: "linear",
          duration,
          delay: -delay,
        }}
      />
    </div>
  )
}
