import { useSession } from 'next-auth/react'
import { signIn } from 'next-auth/react'
import { useEffect } from 'react'

export function useTokenRefresh() {
  const { data: session, status } = useSession()

  useEffect(() => {
    // Check if token refresh failed
    if (session?.error === "RefreshAccessTokenError") {
      console.log('🔄 Token refresh failed, prompting re-authentication')
      
      // Automatically trigger sign-in to get fresh tokens
      signIn('spotify', { 
        callbackUrl: window.location.href,
        redirect: false 
      })
    }
  }, [session])

  return {
    isAuthenticated: status === 'authenticated' && !session?.error,
    needsReauth: session?.error === "RefreshAccessTokenError",
    session
  }
}