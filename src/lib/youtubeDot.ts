import type { YouTubeTranscriptVideo } from '@/api/youtubeVideos'

export type DotColor = 'gray' | 'yellow' | 'red' | 'green'

// How far a playlist video has got. Red and green are final, so only those rows can be opened.
export type Dot = { color: DotColor; label: string; clickable: boolean }

function dot(color: DotColor, label: string): Dot {
  return { color, label, clickable: color === 'red' || color === 'green' }
}

// The dot for one playlist video, from its recorded video, or undefined when nobody has recorded it.
export function youtubeDot(video: YouTubeTranscriptVideo | undefined): Dot {
  if (!video) return dot('gray', 'No transcript yet')
  switch (video.state) {
    case 'waiting':
      return dot('gray', 'Transcript waiting')
    case 'working':
      return dot('gray', 'Fetching transcript')
    case 'no_captions':
      return dot('red', 'No captions')
    case 'failed':
      return dot('red', 'Transcript failed')
    case 'done':
      switch (video.summary?.state) {
        case 'failed':
          return dot('red', 'Summary failed')
        case 'done':
          return dot('green', 'Summary available')
        case 'nothing_to_summarise':
          return dot('green', 'Nothing to summarise')
        case 'working':
          return dot('yellow', 'Summarising')
        default:
          return dot('yellow', 'Summary waiting')
      }
  }
}

// The dot for a playlist item, or null while the recorded videos are not known (still loading, or failed to load).
export function dotForPlaylistVideo(
  recorded: YouTubeTranscriptVideo[] | undefined,
  videoId: string | null,
): Dot | null {
  if (!recorded) return null
  return youtubeDot(videoId === null ? undefined : recorded.find((video) => video.youtube_id === videoId))
}
