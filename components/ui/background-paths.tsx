"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full text-blue-200/60" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.08 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.6 }}
            animate={{
              pathLength: 1,
              opacity: [0.2, 0.5, 0.2],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

export function BackgroundPaths({
  title = "Premium Rental Management",
  subtitle = "A clear view of maintenance, payments, and tenant care in one place",
}: {
  title?: string;
  subtitle?: string;
}) {
  const words = title.split(" ");

  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800">
      <div className="absolute inset-0">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-4 py-24 text-center md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.6 }}
          className="max-w-4xl"
        >
          <h1 className="mb-6 pb-1 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl md:text-7xl">
            {words.map((word, wordIndex) => (
              <span key={wordIndex} className="mr-3 inline-block last:mr-0">
                {word.split("").map((letter, letterIndex) => (
                  <motion.span
                    key={`${wordIndex}-${letterIndex}`}
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                      delay: wordIndex * 0.1 + letterIndex * 0.03,
                      type: "spring",
                      stiffness: 140,
                      damping: 24,
                    }}
                    className="inline-block bg-gradient-to-r from-white via-blue-100 to-blue-200 bg-clip-text text-transparent"
                  >
                    {letter}
                  </motion.span>
                ))}
              </span>
            ))}
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-base text-blue-100/90 sm:text-lg">
            {subtitle}
          </p>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-white px-8 text-base font-semibold text-blue-900 shadow-lg shadow-blue-950/30 transition-transform duration-200 hover:-translate-y-0.5 hover:bg-blue-50"
            >
              <Link href="/dashboard">Manager Dashboard</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-blue-200/60 bg-white/10 px-8 text-base font-semibold text-white backdrop-blur hover:bg-white/20"
            >
              <Link href="/dashboard/tenant">Tenant Portal</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
