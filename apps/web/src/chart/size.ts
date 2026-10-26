import { useLayoutEffect, useState, type RefObject } from "react"

// An element's layout size, before any transform, so a view drawn a
// quarter turn round still measures its own width and height.
export function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current!
    // Whole pixels already.
    const read = () =>
      setSize({ width: element.offsetWidth, height: element.offsetHeight })
    const observer = new ResizeObserver(read)
    observer.observe(element)
    read()
    return () => observer.disconnect()
  }, [ref])
  return size
}
