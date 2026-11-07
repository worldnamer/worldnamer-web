import { MenuIcon } from 'lucide-react'
import { Link } from 'react-router'
import { logout } from '@/api/session'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { sections } from '@/lib/sections'

// The hamburger button for a logged-in user. The sections come first as links, then a separator, then the username
// as a plain label (not a menu item) and "Log out".
export function Menu({ username }: { username: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu" className="text-muted-foreground hover:text-foreground">
          <MenuIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-border">
        {sections.map((section) => (
          <DropdownMenuItem key={section.to} asChild>
            <Link to={section.to}>{section.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{username}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void logout()}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
