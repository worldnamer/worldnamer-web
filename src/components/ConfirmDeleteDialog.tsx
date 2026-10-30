import { useRef } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// "Delete this?" with Cancel and Delete. The dialog is controlled: the caller holds `open` and the thing being deleted,
// so the title keeps its text while the dialog fades out, and the caller shows any error. `onConfirm` runs when Delete is
// pressed; `focusAfterClose` says where focus goes once the dialog has closed, given whether Delete was pressed.
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  onConfirm,
  focusAfterClose,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  onConfirm: () => void
  focusAfterClose: (confirmed: boolean) => HTMLElement | null
}) {
  const confirmed = useRef(false)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="border-border bg-panel"
        onCloseAutoFocus={(event) => {
          // Radix only restores focus to a trigger, and this dialog has none, so the caller picks the element. The flag is
          // cleared as it is read, ready for the next time the dialog opens.
          event.preventDefault()
          const wasConfirmed = confirmed.current
          confirmed.current = false
          focusAfterClose(wasConfirmed)?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl tracking-wide">{title}</AlertDialogTitle>
          <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              confirmed.current = true
              onConfirm()
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
