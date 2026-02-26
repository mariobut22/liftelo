import { useMutation } from '@tanstack/react-query'

import { sendTestEmail } from '../../services/api'

const useSendTestEmail = () =>
  useMutation({
    mutationFn: () => sendTestEmail(),
  })

export default useSendTestEmail
