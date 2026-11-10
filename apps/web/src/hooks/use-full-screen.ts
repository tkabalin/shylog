import { useEffect } from "react"

// A screen portalled over the whole app, which goes inert (and out of the
// accessibility tree) beneath it.
export function useFullScreen() {
  useEffect(() => {
    const app = document.getElementById("root")!
    app.inert = true
    return () => {
      app.inert = false
    }
  }, [])
}
