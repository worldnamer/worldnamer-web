import { QueryClient } from '@tanstack/react-query'

// The one QueryClient for the app. main.tsx hands it to React, and plain (non-React) code such as the API client
// imports it directly to read and write the session cache, which a hook could not do outside a component.
export const queryClient = new QueryClient()
