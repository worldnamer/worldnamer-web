import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { resume } from '@/data/resume'
import { scheduleLines } from '@/lib/dossier'

// A "case file" about John, typed out line by line. Every value is real text in the page from the start (the
// animation only reveals it), so search engines and screen readers get all of it. The values come from resume.ts.

type Line = {
  label: string
  text: string
  // Long text fades in rather than typing, because typing needs one unwrapped line.
  typed: boolean
  // What to render instead of the plain text (a link, or highlighted words).
  content?: ReactNode
}

const status = resume.timeline.find((event) => event.kind === 'status')
const latestRole = resume.timeline.find((event) => event.kind === 'role')

// Wraps #hashtags in the brand color, like the résumé's status banner.
function withHashtags(text: string): ReactNode[] {
  return text.split(/(#\w+)/).map((part, i) =>
    part.startsWith('#') ? (
      <span key={i} className="text-brand">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

const external = 'text-brand underline-offset-4 hover:underline'

const lines: Line[] = [
  { label: 'SUBJECT', text: resume.name, typed: true, content: <span className="text-brand">{resume.name}</span> },
  { label: 'ALIAS', text: 'worldnamer', typed: true },
  ...resume.headline
    .split(' / ')
    .map((domain, i): Line => ({ label: i === 0 ? 'DOMAINS' : '', text: domain, typed: true })),
  ...(latestRole?.kind === 'role' && latestRole.location
    ? [{ label: 'BASE', text: latestRole.location, typed: true }]
    : []),
  ...(status?.kind === 'status'
    ? [{ label: 'STATUS', text: status.text, typed: false, content: withHashtags(status.text) }]
    : []),
  { label: 'PHONE', text: `REDACTED, ${resume.contact.phone}`, typed: true },
  { label: 'MISSION', text: resume.mission, typed: false },
  {
    label: 'LINKS',
    text: 'Full résumé · LinkedIn · GitHub',
    typed: true,
    content: (
      <>
        <Link to="/resume" className={external}>
          Full résumé
        </Link>
        {' · '}
        <a href={resume.contact.linkedin} target="_blank" rel="noopener noreferrer" className={external}>
          LinkedIn
        </a>
        {' · '}
        <a href={resume.contact.github} target="_blank" rel="noopener noreferrer" className={external}>
          GitHub
        </a>
      </>
    ),
  },
]

const timings = scheduleLines(lines)
// The closing <EOF> line appears once the last line has finished.
const last = timings[timings.length - 1]
const eofDelay = last.delay + last.duration

export function Dossier() {
  return (
    <section aria-label="About John" className="font-mono pl-5 text-sm sm:text-base">
      <p className="text-muted-foreground mb-3 tracking-widest sm:mb-4">// DOSSIER · URGENT</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 sm:gap-x-8 sm:gap-y-2.5">
        {lines.map((line, i) => {
          const { delay, duration, length } = timings[i]
          return (
            <div key={i} className="contents">
              <dt className="text-muted-foreground tracking-widest">{line.label}</dt>
              <dd>
                <span
                  className={line.typed ? 'dossier-typed' : 'dossier-fade'}
                  style={
                    {
                      '--delay': `${delay}ms`,
                      '--dur': `${duration}ms`,
                      '--len': length,
                    } as React.CSSProperties
                  }
                >
                  {line.content ?? line.text}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
      <p
        aria-hidden="true"
        className="dossier-fade text-brand mt-3 sm:mt-4"
        style={{ '--delay': `${eofDelay}ms`, '--dur': '300ms' } as React.CSSProperties}
      >
        {'<EOF>'} <span className="dossier-cursor">▌</span>
      </p>
    </section>
  )
}
