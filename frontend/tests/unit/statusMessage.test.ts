import { describe, expect, it } from 'vitest'
import { resolveStatusMessageClassName, resolveStatusMessageRole } from '../../src/services/statusMessage'

describe('resolveStatusMessageRole', () => {
  it.each([
    ['error', 'alert'],
    ['warning', 'alert'],
    ['review', 'alert'],
    ['success', 'status'],
    ['info', 'status'],
  ] as const)('%s -> role %s', (tone, role) => {
    expect(resolveStatusMessageRole(tone)).toBe(role)
  })
})

describe('resolveStatusMessageClassName', () => {
  it.each([
    ['error', 'message error'],
    ['warning', 'message warning'],
    ['review', 'message review'],
    ['success', 'message'],
    ['info', 'message'],
  ] as const)('%s -> className %s', (tone, className) => {
    expect(resolveStatusMessageClassName(tone)).toBe(className)
  })
})
