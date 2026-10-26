import { formatPeriod } from '@/lib/dates'

// The closing card, mirroring the status banner at the top: centered under the end of the wire.
export function EducationCard({
  credential,
  school,
  start,
  end,
}: {
  credential: string
  school: string
  start: string
  end: string
}) {
  return (
    <article className="bg-panel border-brand/40 hover:border-brand/60 mx-auto max-w-xl rounded-lg border p-5 transition-colors md:text-center">
      <p className="text-brand text-sm font-semibold">{school}</p>
      <h3 className="font-display text-xl font-bold">{credential}</h3>
      <p className="text-muted-foreground text-sm">{formatPeriod(start, end)}</p>
    </article>
  )
}
