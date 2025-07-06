// types/next-auth.d.ts
import NextAuth from "next-auth"

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
    accessToken?: string
    refreshToken?: string
    error?: string
  }

  interface User {
    id: string
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    userId?: string
    accessToken?: string
    accessTokenExpires?: number
    refreshToken?: string
    error?: string
  }
}