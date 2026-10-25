import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '../api/health'

export function Home() {
  // retry: false so a down API shows as failed right away instead of after several automatic retries.
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false })

  return (
    <p role="status">
      API: {health.isPending && 'checking…'}
      {health.isSuccess && 'OK'}
      {health.isError && `FAILED (${health.error.message})`}
    </p>
  )
}
