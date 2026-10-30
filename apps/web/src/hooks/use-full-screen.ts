import { useEffect, useState } from "react"

// A screen portalled over the whole app, which goes inert (and out of the
// accessibility tree) beneath it. Whether it has entered, a frame after it
// mounts: WebKit can skip a transition begun in the tap's long task.
export function useFullScreen() {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])
  useEffect(() => {
    const app = document.getElementById("root")!
    app.inert = true
    return () => {
      app.inert = false
    }
  }, [])
  return entered
}
