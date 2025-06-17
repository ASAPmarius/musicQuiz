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
          // 🎯 FIXED SCOPES - Added user-read-private for premium detection
          scope: [
            'user-read-email',
            'user-read-private',              // 🆕 THIS IS THE MISSING SCOPE!
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read',
            'streaming',                      // ✅ Essential for Web Playbook SDK
            'user-read-playback-state',       // ✅ Essential for reading state
            'user-modify-playback-state',     // ✅ Essential for controls
            'user-read-currently-playing',
            'user-read-recently-played',
            'app-remote-control'              // ✅ Additional playback control
          ].join(' '),
          show_dialog: 'true'  // Force fresh tokens with new scopes
        }
      }
    })
  ],
  
  callbacks: {
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
            
            if (existingAccount) {
              console.log('🔄 Updating account with fixed scopes')
              
              await prisma.account.update({
                where: { id: existingAccount.id },
                data: {
                  access_token: account.access_token,
                  refresh_token: account.refresh_token,
                  expires_at: account.expires_at,
                  token_type: account.token_type,
                  scope: account.scope,
                }
              })
              
              console.log('✅ Account updated with user-read-private scope')
            }
          }
        } catch (error) {
          console.error('❌ Error updating account:', error)
        }
      }
      
      return true
    },

    async session({ session, user }) {
      if (user?.id) {
        try {
          const account = await prisma.account.findFirst({
            where: {
              userId: user.id,
              provider: 'spotify'
            }
          })

          if (account?.access_token) {
            const tokenExpired = account.expires_at && account.expires_at < Date.now() / 1000
            const hasStreaming = account.scope?.includes('streaming') || false
            const hasModifyPlayback = account.scope?.includes('user-modify-playback-state') || false
            const hasReadPrivate = account.scope?.includes('user-read-private') || false // 🆕 Check for the new scope
            
            console.log('🔍 Session with fixed scopes:', {
              tokenPreview: account.access_token.substring(0, 20) + '...',
              scopes: account.scope,
              hasStreaming,
              hasModifyPlayback,
              hasReadPrivate, // 🆕 Log the new scope
              scopeCount: account.scope?.split(' ').length || 0,
              tokenExpired
            });

            // Add all session data
            (session as any).accessToken = account.access_token;
            (session as any).refreshToken = account.refresh_token;
            (session as any).spotifyId = account.providerAccountId;
            (session as any).tokenType = account.token_type;
            (session as any).scope = account.scope;
            (session as any).expiresAt = account.expires_at;
            (session as any).tokenExpired = tokenExpired;

            const hasAllRequiredScopes = hasStreaming && hasModifyPlayback && hasReadPrivate
            console.log(hasAllRequiredScopes ? 
              '✅ Has ALL required scopes (including user-read-private for premium detection)' : 
              '❌ Still missing required scopes')
          }
        } catch (error) {
          console.error('❌ Session callback error:', error)
        }
      }

      return session
    }
  },
  
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 24
  },
  
  debug: true
}

export default NextAuth(authOptions)