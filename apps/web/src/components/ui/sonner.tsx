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
      className="toaster group !font-sans"
      position="bottom-center"
      offset={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      mobileOffset={{
        bottom:
          "calc(3.0625rem + max(0.5rem, env(safe-area-inset-bottom)) + 1rem)",
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
          toast:
            "cn-toast !min-h-12 gap-3 !py-1 !pr-2 !pl-4 !font-sans !text-sm !font-medium shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)]",
          title: "truncate",
          actionButton:
            "!h-9 !bg-transparent !px-2.5 !text-sm !font-semibold !text-background opacity-85 transition-opacity duration-150 hover:opacity-70 active:opacity-50 active:duration-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
