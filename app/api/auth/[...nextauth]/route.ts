import NextAuth from "next-auth"
import Spotify from "next-auth/providers/spotify"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Keep the database adapter for user persistence
  adapter: PrismaAdapter(prisma),
  
  providers: [
    Spotify({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'user-read-email playlist-read-private user-library-read'
        }
      }
    }),
  ],
  
  callbacks: {
    async session({ session, user }) {
      console.log('📋 Session Callback - Fetching tokens from database...');
      console.log('👤 User ID:', user?.id);

      if (user?.id) {
        try {
          // Fetch the user's Spotify account from database
          const account = await prisma.account.findFirst({
            where: {
              userId: user.id,
              provider: 'spotify'
            }
          });

          console.log('🔍 Database account found:', {
            exists: !!account,
            hasAccessToken: !!account?.access_token,
            hasRefreshToken: !!account?.refresh_token,
            providerAccountId: account?.providerAccountId
          });

          if (account) {
            // Add Spotify tokens to session
            (session as any).accessToken = account.access_token;
            (session as any).refreshToken = account.refresh_token;
            (session as any).spotifyId = account.providerAccountId;
            (session as any).tokenType = account.token_type;
            (session as any).scope = account.scope;
            (session as any).expiresAt = account.expires_at;

            console.log('✅ Successfully added tokens to session');
            console.log('🎵 Access token preview:', account.access_token?.substring(0, 20) + '...');
          } else {
            console.log('❌ No Spotify account found in database');
          }
        } catch (error) {
          console.error('❌ Error fetching account from database:', error);
        }
      }

      return session;
    },
  },

  // Enable debug logging
  debug: process.env.NODE_ENV === 'development',
});

export const { GET, POST } = handlers;