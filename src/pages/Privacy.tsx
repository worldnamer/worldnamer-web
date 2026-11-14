import { resume } from '@/data/resume'

const linkClass = 'text-brand hover:underline'

export function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="border-b pb-4">
        <h1 className="font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground mt-1 text-sm">Last updated November 14, 2026</p>
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-bold">What This Site Is</h2>
        <p>
          This is my personal site. It shows my résumé and holds a few tools I use every day. It's for me and a few
          close friends who have accounts.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-bold">What I Collect</h2>
        <p>
          People with an account give me an email address and a password, which is stored securely, along with whatever 
          they save in the tools. I don't sell or share anything about users of the site. Like most websites, the site 
          records basic information, like which page was viewed, what browser was used, whether something went wrong. 
          I use that to see which pages get read and to fix problems.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-bold">Google Account</h2>
        <p>
          The tools on this site allow a user to connect their Google account so the app can present their Google data,
          such as upcoming calendar events. This only applies to logged-in users, and only if they connect their account.
          That data is stored securely and is available only to the user it belongs to.
        </p>
        <p>
          The site can read the user's calendar once connected, and it shows those events to them on their
          home page. Users can also connect a YouTube playlist so the site can show its videos and save a summary of each.
          The site can view and manage the playlist on their behalf.
        </p>
        <p>
          I don't sell or share this information, or use it for advertising, or to train AI models. The site's use of 
          information received from Google APIs adheres to the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Google API Services User Data Policy
          </a>, including the Limited Use requirements.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl font-bold">Contact</h2>
        <p>
          <a href={`mailto:${resume.contact.email}`} className={linkClass}>
            {resume.contact.email}
          </a>
        </p>
      </section>
    </article>
  )
}
