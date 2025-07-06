// pages/api/auth/[...nextauth].ts
import NextAuth, { NextAuthOptions } from 'next-auth'
import SpotifyProvider from 'next-auth/providers/spotify'
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"
import { JWT } from "next-auth/jwt"

const prisma = new PrismaClient()

// Function to refresh Spotify access token
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    console.log('🔄 Refreshing Spotify access token...')
    
    // 🔧 FIX: Check for null refresh token
    if (!token.refreshToken) {
      console.error('❌ No refresh token available')
      throw new Error('No refresh token available')
    }
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken, // Now TypeScript knows this is not null
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      console.error('❌ Token refresh failed:', refreshedTokens)
      throw refreshedTokens
    }

    console.log('✅ Token refreshed successfully!')
    
    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Use new refresh token if provided
    }
  } catch (error) {
    console.error('❌ Error refreshing access token:', error)
    
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'user-read-email',
            'user-read-private',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read',
            'streaming',
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing',
            'user-read-recently-played',
            'app-remote-control'
          ].join(' '),
          show_dialog: 'true'
        }
      }
    })
  ],
  
  callbacks: {
    // 🔄 ENHANCED JWT CALLBACK: Handle token refresh automatically
    async jwt({ token, user, account }) {
      // Initial sign in
      if (account && user) {
        console.log('🆕 Initial sign-in, storing tokens')
        return {
          ...token,
          userId: user.id,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
          refreshToken: account.refresh_token,
        }
      }

      // Return previous token if the access token has not expired yet
      const tokenExpiresAt = token.accessTokenExpires as number
      if (Date.now() < tokenExpiresAt) {
        console.log('✅ Token still valid, no refresh needed')
        return token
      }

      // Access token has expired, try to refresh it
      console.log('⏰ Token expired, refreshing...')
      return refreshAccessToken(token)
    },

    // 🔄 ENHANCED SESSION CALLBACK: Handle refresh errors
    async session({ session, token }) {
      // Send properties to the client
      if (token) {
        session.user.id = token.userId as string
        session.accessToken = token.accessToken as string
        session.refreshToken = token.refreshToken as string
        session.error = token.error as string | undefined
      }
      return session
    },

    async signIn({ account, profile }) {
      if (account?.provider === 'spotify' && profile?.email) {
        console.log('🔄 Sign-in with FIXED scopes (including user-read-private)')
        console.log('🔍 New scopes:', account.scope)
        
        try {
          const existingUser = await prisma.user.findUnique({
            where: { email: profile.email },
            include: { accounts: true }
          })

          if (existingUser) {
            const existingAccount = existingUser.accounts.find(acc => acc.provider === 'spotify')
            
            if (existingAccount && account.access_token) {
              await prisma.account.update({
                where: { id: existingAccount.id },
                data: {
                  access_token: account.access_token,
                  refresh_token: account.refresh_token,
                  expires_at: account.expires_at,
                  scope: account.scope
                }
              })
              console.log('✅ Updated existing account with new scopes!')
            }
          }
        } catch (error) {
          console.error('❌ Error updating account:', error)
        }
      }
      return true
    }
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },

  session: {
    strategy: 'jwt',
  },

  // Add this to enable debug logs
  debug: process.env.NODE_ENV === 'development',
}

export default NextAuth(authOptions)