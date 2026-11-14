import { useQuery } from '@tanstack/react-query'
import { getYouTubeConnection } from '@/api/youtubeConnection'
import { Button } from '@/components/ui/button'

// The YouTube card: the state of the YouTube link and, once it is connected, the chosen playlist.
export function YouTubePlaylistCard() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['youtube_connection'],
    queryFn: getYouTubeConnection,
    retry: false, // a down API should show the error at once, not after several retries
    // The API asks Google whether the stored token works, so the status is not refetched whenever the user tabs back.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return (
    <section aria-labelledby="youtube-heading" className="w-full">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border pb-2">
        <h2 id="youtube-heading" className="font-display text-xl tracking-wide">
          YouTube
        </h2>
      </div>
      <div className="grid gap-2 border-b border-border py-2">
        {isPending && <p className="text-muted-foreground">Loading YouTube...</p>}
        {isError && !data && (
          <p role="alert" className="text-destructive">
            Couldn't load your YouTube connection. Try reloading the page.
          </p>
        )}
        {(data?.status === 'not_connected' || data?.status === 'lost') && (
          <Button className="justify-self-start">Connect YouTube</Button>
        )}
        {data?.status === 'connected' && <p>YouTube connected.</p>}
      </div>
    </section>
  )
}
