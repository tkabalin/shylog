// Tries a download now, whenever the signal comes back, and once a new
// worker takes the page, one run at a time however many reasons to try
// arrive together. The extract and the site images both download so.
export function keepTrying(task: () => Promise<void>) {
  let running: Promise<void> | undefined
  const attempt = () => {
    running ??= task()
      .catch(() => {})
      .finally(() => (running = undefined))
  }
  attempt()
  window.addEventListener("online", attempt)
  navigator.serviceWorker?.addEventListener("controllerchange", attempt)
}
