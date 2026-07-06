"use client"

import * as React from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { AlertTriangle } from "lucide-react"

import { cn } from "@/lib/utils"

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: "default" | "danger"
}

type ConfirmState = ConfirmOptions & {
  open: boolean
  resolve?: (confirmed: boolean) => void
}

const defaultState: ConfirmState = {
  open: false,
  title: "",
}

/**
 * Promise-based confirmation dialog. Drop-in styled replacement for
 * `window.confirm`:
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (await confirm({ title: "Discard changes?" })) { ... }
 *   // render {confirmDialog} once in the component tree
 */
export function useConfirm() {
  const [state, setState] = React.useState<ConfirmState>(defaultState)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, open: true, resolve })
    })
  }, [])

  const settle = React.useCallback(
    (confirmed: boolean) => {
      state.resolve?.(confirmed)
      setState((current) => ({ ...current, open: false, resolve: undefined }))
    },
    [state]
  )

  const confirmDialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return { confirm, confirmDialog }
}

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isDanger = tone === "danger"

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-[90] bg-[#0b1020]/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-[95] flex w-[calc(100vw-3rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[10px] border border-[#e4e8f0] bg-white p-6 text-[#30384b] shadow-[0_24px_60px_rgba(17,24,61,0.22)] transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                isDanger
                  ? "bg-[#fff1f1] text-[#ff5f67]"
                  : "bg-[#eef3ff] text-[#2448dd]"
              )}
            >
              <AlertTriangle className="size-5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <AlertDialog.Title className="text-[16px] font-semibold text-[#11183d]">
                {title}
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="mt-1.5 text-[13px] leading-5 text-[#697083]">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
          </div>

          <div className="mt-1 flex justify-end gap-3">
            <AlertDialog.Close className="h-10 rounded-[6px] border border-[#dce2ec] bg-white px-5 text-[14px] font-medium text-[#4f586a] transition hover:bg-[#f7f8ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8aa4ef]">
              {cancelLabel}
            </AlertDialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              className={cn(
                "h-10 rounded-[6px] px-5 text-[14px] font-medium text-white transition focus-visible:outline-none focus-visible:ring-2",
                isDanger
                  ? "bg-[#ff5f67] hover:bg-[#f2515a] focus-visible:ring-[#ffb4b8]"
                  : "bg-[#7280f7] hover:bg-[#6472ea] focus-visible:ring-[#8aa4ef]"
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
