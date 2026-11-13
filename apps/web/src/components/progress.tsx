// A share done when it is known (a watch read, dives towards more stats);
// otherwise, while waiting on the server, a third of the track sweeping.
export function Progress({
  label,
  value = null,
}: {
  label: string
  value?: number | null
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={value == null ? undefined : 0}
      aria-valuemax={value == null ? undefined : 100}
      aria-valuenow={value == null ? undefined : Math.round(value * 100)}
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {value == null ? (
        <span className="absolute inset-y-0 w-1/3 animate-import-progress rounded-full bg-primary motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
      ) : (
        // Slid rather than scaled, which would squash its round end, and
        // linear across the server's answers, a few times a second.
        <span
          className="absolute inset-0 rounded-full bg-primary transition-transform duration-300 ease-linear"
          style={{ transform: `translateX(${(value - 1) * 100}%)` }}
        />
      )}
    </span>
  )
}
