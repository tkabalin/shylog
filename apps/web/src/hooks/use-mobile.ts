import { useMediaQuery } from "@/hooks/use-media-query"

const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

export function useIsMobile() {
  return useMediaQuery(query)
}
