// Whether the phone asks for reduced motion, which a script's animations
// and smooth scrolls otherwise ignore.
export const reduced = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches

export const scrolling = (): ScrollBehavior => (reduced() ? "auto" : "smooth")
