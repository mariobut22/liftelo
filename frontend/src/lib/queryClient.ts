import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
    mutations: {
      retry: 0,
      networkMode: 'always', // never pause a save while offline: the forms store it in the outbox instead
    },
  },
})

export default queryClient
