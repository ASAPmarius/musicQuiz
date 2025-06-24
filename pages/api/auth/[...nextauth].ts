// pages/api/auth/[...nextauth].ts
import NextAuth, { NextAuthOptions } from 'next-auth'
import SpotifyProvider from 'next-auth/providers/spotify'
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

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
    // 🆕 ADD JWT CALLBACK: Include user id in JWT token
    async jwt({ token, user, account }) {
      // On initial sign in, user object is available
      if (user) {
        token.userId = user.id
        token.accessToken = account?.access_token
        token.refreshToken = account?.refresh_token
      }
      return token
    },

    // 🆕 ADD SESSION CALLBACK: Include user id and tokens in session
    async session({ session, token }) {
      // Send properties to the client
      if (token) {
        session.user.id = token.userId as string
        session.accessToken = token.accessToken as string
        session.refreshToken = token.refreshToken as string
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
          
          return true
        } catch (error) {
          console.error('❌ Database error during sign-in:', error)
          return false
        }
      }
      return true
    }
  },

  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  },

  session: {
    strategy: "jwt", // 🆕 IMPORTANT: Use JWT strategy to make callbacks work
  },

  debug: process.env.NODE_ENV === 'development'
}

export default NextAuth(authOptions)