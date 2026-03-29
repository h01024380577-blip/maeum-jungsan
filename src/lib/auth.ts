import { PrismaAdapter } from "@auth/prisma-adapter";
import KakaoProvider from "next-auth/providers/kakao";
import { prisma } from "./prisma";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || '',
      clientSecret: process.env.KAKAO_CLIENT_SECRET || 'UNUSED',
    }),
  ],
  debug: true,
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
};
