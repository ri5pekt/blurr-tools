import { FastifyRequest, FastifyReply } from 'fastify'
import { AuthUser } from '@blurr-tools/types'

// Tell @fastify/jwt what the JWT payload / request.user looks like
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser
    user: AuthUser
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
}
