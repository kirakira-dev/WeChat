import { createHash } from 'crypto'

export function md5(input: string): string {
  return createHash('md5').update(input).digest('hex')
}

export function messageTableName(username: string): string {
  return `Msg_${md5(username)}`
}
