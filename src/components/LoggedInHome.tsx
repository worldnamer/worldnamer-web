import { Habits } from './Habits'
import { Tasks } from './Tasks'

// Left-aligned. Layout's <main> supplies px-5 and the top padding (pt-4, sm:pt-6); the negative margin cancels the px-5
// and the pl- classes replace it with the same value as the top padding, so the left margin equals the top margin. The
// gap between the cards uses the same value again.
export function LoggedInHome() {
  return (
    <section aria-label="Logged-in home" className="-ml-5 pl-4 sm:pl-6">
      <Habits />
      <div className="mt-4 sm:mt-6">
        <Tasks />
      </div>
    </section>
  )
}
