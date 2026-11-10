import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertOctagon,
  IconLoader,
} from "@tabler/icons-react"

import { useTheme } from "@/components/theme-provider"

// Shylog's own ThemeProvider in place of next-themes. Toasts are the
// board's inverted pill (RecentlyDeletedHifi), held clear of the tab bar on
// a phone and the home bar on every screen.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      // Sonner's own CSS isn't in a layer, so it beats Tailwind's: the
      // board's type and size need !important.
      // On a desktop, centred on the content beside the sidebar, as the
      // dialogs are.
      className="toaster group !font-sans desk:!left-[calc(50%+var(--sidebar-width)/2)]"
      position="bottom-center"
      // Left to itself, Sonner reads the direction from the page's computed
      // style on every render, forcing a style recalc on each navigation.
      dir="ltr"
      // Sonner switches to its mobile offset below 600px, not at desk:,
      // so both read index.css's --toast-bottom, which does.
      offset={{ bottom: "var(--toast-bottom)" }}
      mobileOffset={{
        bottom: "var(--toast-bottom)",
        left: "1rem",
        right: "1rem",
      }}
      icons={{
        success: <IconCircleCheck className="size-4" />,
        info: <IconInfoCircle className="size-4" />,
        warning: <IconAlertTriangle className="size-4" />,
        error: <IconAlertOctagon className="size-4" />,
        loading: <IconLoader className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--foreground)",
          "--normal-text": "var(--background)",
          "--normal-border": "transparent",
          "--border-radius": "14px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // A toast with a second line gets room above and below it, which
          // the board's one-line pill doesn't need.
          toast:
            "cn-toast !min-h-12 gap-3 !py-1 !pr-2 !pl-4 !font-sans !text-sm !font-medium shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] has-[[data-description]]:!py-3",
          title: "truncate",
          // Sonner's grey is drawn for its own background, not the board's
          // inverted one, and all but disappears on it.
          description: "!text-background/75 !font-normal",
          // Reaches 44px tall for a finger, past its 36px pill.
          actionButton:
            "relative after:absolute after:inset-x-0 after:-inset-y-1 !h-9 !bg-transparent !px-2.5 !text-sm !font-semibold !text-background opacity-85 transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
