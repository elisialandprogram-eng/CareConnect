import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

// Previously this wrapped each route in a framer-motion fade/slide that delayed
// every navigation by ~350ms. The transition added no real value but blocked
// paint on every page change, so it's now a pass-through.
export function PageTransition({ children }: PageTransitionProps) {
  return <>{children}</>;
}
