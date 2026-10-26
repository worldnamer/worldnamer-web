// Text where **double-asterisk** phrases are shown in the brand color (not bold). For editing words in the data file
// without putting markup in the components.
export function Emphasized({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/).map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="text-brand">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}
