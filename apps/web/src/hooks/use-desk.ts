import { useMediaQuery } from "@/hooks/use-media-query"

// The desk: variant's query (index.css), for what CSS alone can't switch.
const query = "(width >= 48rem) and (pointer: fine)"

export function useDesk() {
  return useMediaQuery(query)
}
