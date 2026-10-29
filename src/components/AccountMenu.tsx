import { MenuIcon } from 'lucide-react'
import { logout } from '@/api/session'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// The hamburger button for a logged-in user. The username is a plain label (not a menu item); "Log out" is the only item.
export function AccountMenu({ username }: { username: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="text-muted-foreground hover:text-foreground">
          <MenuIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="border-border">
        <DropdownMenuLabel>{username}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void logout()}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
