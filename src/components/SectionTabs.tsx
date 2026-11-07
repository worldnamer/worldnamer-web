import { NavLink } from 'react-router'
import { sections } from '@/lib/sections'
import { cn } from '@/lib/utils'

// The sections as a vertical stack of tabs. Shown only from the lg breakpoint up; below it the Menu is the way
// between sections. `end` keeps the Home tab ("/") from counting as current on every other path.
export function SectionTabs() {
  return (
    <nav aria-label="Sections" className="hidden w-40 shrink-0 flex-col gap-1 text-sm lg:flex">
      {sections.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          end
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2 transition-colors hover:text-foreground',
              isActive ? 'bg-panel text-foreground' : 'text-muted-foreground',
            )
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  )
}
