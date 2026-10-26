import { cn } from '@/lib/utils'

type Variant = 'tech' | 'skill' | 'concept'

const styles: Record<Variant, string> = {
  tech: 'border-brand/50 text-brand',
  skill: 'border-skill/50 text-skill',
  // The silver ones also get a faint fill, so they read as a badge and not as plain text in a box.
  concept: 'border-concept/60 bg-concept/10 text-concept',
}

// A small badge. Technologies use the brand color, non-technical skills (leadership, architecture) the skill green,
// and concepts that are not one specific technology (REST, NoSQL) silver.
export function Chip({ children, variant = 'tech' }: { children: string; variant?: Variant }) {
  return <li className={cn('rounded border px-2 py-0.5 text-xs', styles[variant])}>{children}</li>
}
