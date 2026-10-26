// Hashtags in the text (#openToWork) are picked out in the brand color.
function withHashtags(text: string) {
  return text.split(/(#\w+)/).map((part, i) =>
    part.startsWith('#') ? (
      <span key={i} className="text-brand font-semibold">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

// Where things stand now. It sits centered above the wire, not on it, because it is not one of the past events.
export function StatusCard({ text }: { text: string }) {
  return (
    <article className="bg-panel border-brand/40 mx-auto max-w-xl rounded-lg border p-5 md:text-center">
      <p className="text-lg">{withHashtags(text)}</p>
    </article>
  )
}
