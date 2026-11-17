import { useQuery } from '@tanstack/react-query'
import { getYouTubeVideos } from '@/api/youtubeVideos'

// The recorded videos of the chosen playlist. The playlist card and the transcripts card both read them through this, so
// they share one request and one cache entry.
export function useYouTubeVideos({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['youtube_videos'],
    queryFn: getYouTubeVideos,
    retry: false, // a down API should show the error at once, not after several retries
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled,
  })
}
