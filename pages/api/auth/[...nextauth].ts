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
          scope: 'user-read-email playlist-read-private user-library-read streaming user-read-playback-state user-modify-playback-state'
        }
      }
    })
  ],
  
  callbacks: {
    // ✅ Force account update on every sign-in
    async signIn({ account, profile }) {
      if (account?.provider === 'spotify' && profile?.email) {
        console.log('🔄 Forcing account update on sign-in')
        
        try {
          // Find existing user by email
          const existingUser = await prisma.user.findUnique({
            where: { email: profile.email },
            include: { accounts: true }
          })

          if (existingUser) {
            console.log('👤 Found existing user, updating Spotify account...')
            
            // Find existing Spotify account
            const existingAccount = existingUser.accounts.find(acc => acc.provider === 'spotify')
            
            if (existingAccount) {
              console.log('🔄 Updating existing Spotify account with new tokens')
              
              // Update the account with new tokens and scopes
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
              
              console.log('✅ Account updated with new tokens and scopes')
            }
          }
        } catch (error) {
          console.error('❌ Error updating account:', error)
          // Don't block sign-in if update fails
        }
      }
      
      return true
    },

    async session({ session, user }) {
      console.log('📋 Session callback for user:', user?.id)

      if (user?.id) {
        try {
          const account = await prisma.account.findFirst({
            where: {
              userId: user.id,
              provider: 'spotify'
            }
          });

          console.log('🔍 Account found:', {
            exists: !!account,
            hasAccessToken: !!account?.access_token,
            scope: account?.scope,
            tokenPreview: account?.access_token?.substring(0, 20) + '...' || 'No token'
          })

          if (account) {
            (session as any).accessToken = account.access_token;
            (session as any).refreshToken = account.refresh_token;
            (session as any).spotifyId = account.providerAccountId;
            (session as any).tokenType = account.token_type;
            (session as any).scope = account.scope;
            (session as any).expiresAt = account.expires_at;

            console.log('✅ Session updated with tokens')
          }
        } catch (error) {
          console.error('❌ Session callback error:', error)
        }
      }

      return session;
    }
  },
  
  debug: true,
}

export default NextAuth(authOptions)