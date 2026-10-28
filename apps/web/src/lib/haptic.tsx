// A light tick for a tap, as iOS gives its own segmented controls. Laid over
// a positioned control, it takes the tap, which still bubbles to the control.
// Android has the Vibration API.
export function Haptic() {
  return (
    <label
      aria-hidden
      onClick={() => navigator.vibrate?.(10)}
      className="absolute inset-0 touch-manipulation"
    >
      {/* HACK: Safari has no Vibration API, but plays the system haptic when
          a real tap toggles a native switch, so the label hands the tap on to
          a hidden one. A switch clicked from script no longer ticks (iOS 26). */}
      <input
        type="checkbox"
        // React doesn't know the attribute, so it passes it through as is.
        {...{ switch: "" }}
        tabIndex={-1}
        // The switch's copy of the click mustn't reach the control again.
        onClick={(event) => event.stopPropagation()}
        className="invisible absolute m-0 size-px"
      />
    </label>
  )
}
