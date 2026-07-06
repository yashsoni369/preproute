"use client"

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react"
import { Toast } from "@base-ui/react/toast"

import { cn } from "@/lib/utils"

// A single global manager so toasts can be queued from anywhere in the app,
// including from outside the React tree (e.g. helper functions).
export const toastManager = Toast.createToastManager()

type ToastVariant = "success" | "error" | "info"

type ToastOptions = {
  description?: string
  duration?: number
}

function show(variant: ToastVariant, title: string, options?: ToastOptions) {
  return toastManager.add({
    title,
    description: options?.description,
    type: variant,
    timeout: options?.duration ?? (variant === "error" ? 6000 : 4000),
    priority: variant === "error" ? "high" : "low",
  })
}

/**
 * App-wide toast helper. Usage: `toast.success("Logged in")`.
 */
export const toast = {
  success: (title: string, options?: ToastOptions) =>
    show("success", title, options),
  error: (title: string, options?: ToastOptions) =>
    show("error", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  dismiss: (toastId?: string) => toastManager.close(toastId),
}

const variantStyles: Record<
  ToastVariant,
  { accent: string; icon: typeof CheckCircle2; iconColor: string }
> = {
  success: {
    accent: "border-l-[#18ad72]",
    icon: CheckCircle2,
    iconColor: "text-[#18ad72]",
  },
  error: {
    accent: "border-l-[#ff5f67]",
    icon: TriangleAlert,
    iconColor: "text-[#ff5f67]",
  },
  info: {
    accent: "border-l-[#5f86e9]",
    icon: Info,
    iconColor: "text-[#5f86e9]",
  },
}

function ToastList() {
  const { toasts } = Toast.useToastManager()

  return toasts.map((toastItem) => {
    const variant = (toastItem.type as ToastVariant) ?? "info"
    const styles = variantStyles[variant] ?? variantStyles.info
    const Icon = styles.icon

    return (
      <Toast.Root
        key={toastItem.id}
        toast={toastItem}
        swipeDirection="right"
        className={cn(
          "pointer-events-auto relative flex w-full items-start gap-3 rounded-[8px] border border-[#e4e8f0] border-l-4 bg-white p-4 shadow-[0_16px_40px_rgba(17,24,61,0.14)] select-none",
          "transition-all duration-300 ease-out",
          "data-starting-style:translate-x-[calc(100%+2rem)] data-starting-style:opacity-0",
          "data-ending-style:translate-x-[calc(100%+2rem)] data-ending-style:opacity-0",
          "data-[swipe-direction=right]:data-ending-style:translate-x-[calc(100%+2rem)]",
          styles.accent
        )}
      >
        <Icon className={cn("mt-0.5 size-5 shrink-0", styles.iconColor)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title className="text-[14px] font-semibold text-[#11183d]" />
          <Toast.Description className="text-[13px] leading-5 text-[#697083]" />
        </div>
        <Toast.Close
          aria-label="Dismiss notification"
          className="shrink-0 rounded-[6px] p-1 text-[#98a2b3] transition hover:bg-[#f5f6ff] hover:text-[#2448dd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8aa4ef]"
        >
          <X className="size-4" />
        </Toast.Close>
      </Toast.Root>
    )
  })
}

/**
 * Mount once near the root of the app (see app/layout.tsx).
 */
export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed top-[1rem] right-[1rem] bottom-auto left-auto z-[100] flex w-[calc(100vw-2rem)] flex-col gap-3 sm:top-[1.5rem] sm:right-[1.5rem] sm:w-[22.5rem]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
