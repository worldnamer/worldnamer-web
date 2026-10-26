import { Emphasized } from '@/components/Emphasized'
import { Timeline } from '@/components/resume/Timeline'
import { resume } from '@/data/resume'

const linkClass = 'text-brand hover:underline'

export function Resume() {
  const { name, headline, contact, summary, timeline } = resume

  return (
    <div className="space-y-12">
      <header className="mx-auto max-w-3xl">
        <h1 className="font-display text-center text-4xl font-bold">{name}</h1>
        <p className="text-muted-foreground mt-1 text-center">{headline}</p>
        <div className="mt-6 space-y-3 border-t pt-5 text-justify hyphens-auto">
          {summary.map((paragraph) => (
            <p key={paragraph}>
              <Emphasized text={paragraph} />
            </p>
          ))}
        </div>
        <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 border-t pt-5 text-sm">
          <li>
            <a href={`mailto:${contact.email}`} className={linkClass}>
              {contact.email}
            </a>
          </li>
          <li>
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className={linkClass}>
              LinkedIn
            </a>
          </li>
          <li>
            <a href={contact.github} target="_blank" rel="noopener noreferrer" className={linkClass}>
              GitHub
            </a>
          </li>
          <li className="text-muted-foreground">Phone: {contact.phone}</li>
        </ul>
      </header>

      <section aria-label="Career timeline" className="pt-6">
        <Timeline events={timeline} />
      </section>
    </div>
  )
}
