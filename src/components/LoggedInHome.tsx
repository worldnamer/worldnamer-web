import { Habits } from './Habits'
import { Tasks } from './Tasks'
import { TodayCard } from './TodayCard'

// Left-aligned. Layout's <main> supplies px-5 and the top padding (pt-4, sm:pt-6); the negative margin cancels the px-5
// and the pl- classes replace it with the same value as the top padding, so the left margin equals the top margin. The
// gap between the cards uses the same value again.
// Below lg everything stacks with the Today card first. From lg the Habits and Tasks column is half the width and the
// Today card is a quarter, moved to the right with `order-last` while staying first in the DOM (and so first for the
// keyboard and screen readers).
export function LoggedInHome() {
  return (
    <section aria-label="Logged-in home" className="-ml-5 flex flex-col gap-4 pl-4 sm:gap-6 sm:pl-6 lg:flex-row lg:items-start">
      <TodayCard />
      <div className="w-full lg:w-1/2">
        <Habits />
        <div className="mt-4 sm:mt-6">
          <Tasks />
        </div>
      </div>
    </section>
  )
}
