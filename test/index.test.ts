import { describe, expect, test } from 'vitest'
import {
  balancedGroups,
  balancedGroupsByTag,
  parseParticipants,
  parseTaggedParticipants,
  shuffle,
} from '../src/index'

// Deterministic RNG (mulberry32) so balance invariants can be asserted exactly.
const seededRng = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

describe('shuffle', () => {
  test('preserves all items and is deterministic with a seeded rng', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const first = shuffle(items, seededRng(42))
    const second = shuffle(items, seededRng(42))
    expect([...first].sort()).toEqual([...items].sort())
    expect(first).toEqual(second)
  })
})

describe('parseParticipants', () => {
  test('splits on newlines and commas, drops empties', () => {
    expect(parseParticipants('A, B\n\nC, , D')).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('parseTaggedParticipants', () => {
  test('accepts bracket and pipe syntax, case-insensitive against validCodes', () => {
    const input = ['Alisson [gk]', 'Courtois | GK', 'Mbappé [fw]', 'No Tag'].join('\n')
    expect(parseTaggedParticipants(input, ['GK', 'DF', 'MF', 'FW'])).toEqual([
      { name: 'Alisson', tag: 'GK' },
      { name: 'Courtois', tag: 'GK' },
      { name: 'Mbappé', tag: 'FW' },
      { name: 'No Tag' },
    ])
  })

  test('unknown codes degrade to plain names', () => {
    expect(parseTaggedParticipants('X [ZZ]', ['GK'])).toEqual([{ name: 'X [ZZ]' }])
  })
})

describe('balancedGroups', () => {
  test('produces even sizes (<=1 difference) and keeps everyone', () => {
    const names = Array.from({ length: 23 }, (_, i) => `p${i}`)
    const groups = balancedGroups(names, 4)
    expect(groups).toHaveLength(4)
    expect(groups.flat().sort()).toEqual([...names].sort())
    const sizes = groups.map(g => g.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
  })

  test('groupCount above participant count yields singleton groups then empties', () => {
    const groups = balancedGroups(['A', 'B'], 3)
    expect(groups.flat()).toHaveLength(2)
    expect(groups.filter(g => g.length === 1)).toHaveLength(2)
    expect(groups.filter(g => g.length === 0)).toHaveLength(1)
  })

  test('throws on invalid input', () => {
    expect(() => balancedGroups(['A'], 0)).toThrow(RangeError)
    expect(() => balancedGroups([], 2)).toThrow(RangeError)
  })
})

describe('balancedGroupsByTag', () => {
  const soccer = parseTaggedParticipants(
    [
      'Alisson [GK]',
      'Courtois | GK',
      'Van Dijk [DF]',
      'Dias [DF]',
      'Shaw [DF]',
      'Walker [DF]',
      'Modrić [MF]',
      'De Bruyne [MF]',
      'Foden [MF]',
      'Mount [MF]',
      'Mbappé [FW]',
      'Haaland [FW]',
    ].join('\n'),
    ['GK', 'DF', 'MF', 'FW'],
  )

  test('soccer scenario: 2 teams of 6, each gets exactly 1 GK / 2 DF / 2 MF / 1 FW', () => {
    const teams = balancedGroupsByTag(soccer, ['GK', 'DF', 'MF', 'FW'], 2, seededRng(7))
    expect(teams).toHaveLength(2)
    for (const team of teams) {
      expect(team).toHaveLength(6)
      const byTag = team.reduce<Record<string, number>>((acc, m) => {
        const tag = m.tag ?? 'none'
        acc[tag] = (acc[tag] ?? 0) + 1
        return acc
      }, {})
      expect(byTag.GK).toBe(1)
      expect(byTag.DF).toBe(2)
      expect(byTag.MF).toBe(2)
      expect(byTag.FW).toBe(1)
    }
  })

  test('gender mix: two genders never collapse into single-gender groups', () => {
    const roster = parseTaggedParticipants(
      ['A [m]', 'B [m]', 'C [f]', 'D [f]'].join('\n'),
      ['m', 'f'],
    )
    const groups = balancedGroupsByTag(roster, ['m', 'f'], 2, seededRng(3))
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(group.filter(m => m.tag === 'm')).toHaveLength(1)
      expect(group.filter(m => m.tag === 'f')).toHaveLength(1)
    }
  })

  test('odd tag counts spread within <=1 across groups', () => {
    const roster = parseTaggedParticipants(
      ['a [x]', 'b [x]', 'c [x]', 'd [y]', 'e [y]', 'f', 'g', 'h', 'i'].join('\n'),
      ['x', 'y'],
    )
    const groups = balancedGroupsByTag(roster, ['x', 'y'], 3, seededRng(11))
    const xPer = groups.map(g => g.filter(m => m.tag === 'x').length)
    const yPer = groups.map(g => g.filter(m => m.tag === 'y').length)
    expect(Math.max(...xPer) - Math.min(...xPer)).toBeLessThanOrEqual(1)
    expect(Math.max(...yPer) - Math.min(...yPer)).toBeLessThanOrEqual(1)
    expect(groups.flat()).toHaveLength(9)
  })

  test('untagged members even out sizes without breaking tag balance', () => {
    const roster = parseTaggedParticipants(
      ['a [x]', 'b [x]', 'c [y]', 'd [y]', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6'].join('\n'),
      ['x', 'y'],
    )
    const groups = balancedGroupsByTag(roster, ['x', 'y'], 2, seededRng(5))
    const sizes = groups.map(g => g.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(groups.flat()).toHaveLength(10)
  })

  test('throws on invalid input', () => {
    expect(() => balancedGroupsByTag([{ name: 'A' }], ['x'], 0)).toThrow(RangeError)
    expect(() => balancedGroupsByTag([], ['x'], 2)).toThrow(RangeError)
  })
})
