"use client"

import { useEffect } from "react"

export const UNSAVED_CHANGES_MESSAGE =
  "You have unsaved changes. Leave without saving?"

export function useUnsavedChangesWarning(when: boolean) {
  useEffect(() => {
    if (!when) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = UNSAVED_CHANGES_MESSAGE
      return UNSAVED_CHANGES_MESSAGE
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [when])
}

export function confirmDiscardUnsavedChanges(when: boolean) {
  return !when || window.confirm(UNSAVED_CHANGES_MESSAGE)
}
