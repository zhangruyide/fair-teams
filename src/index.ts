export interface TaggedParticipant {
  name: string
  tag?: string
}

export type Rng = () => number

/** Fisher–Yates shuffle. Returns a new array; pass an `rng` for deterministic runs. */
export const shuffle = <T>(items: T[], rng: Rng = Math.random): T[] => {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(rng() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }
  return result
}

/**
 * Parse plain participants, one per line or comma.
 */
export const parseParticipants = (input: string): string[] => {
  return input
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

const BRACKET_TAG_RE = /^(.+?)\s*\[([^\][]+)\]\s*$/
const PIPE_TAG_RE = /^(.+?)\s*\|\s*(\S+)\s*$/

/**
 * Parse tagged entries, one per line or comma. Recognized syntax:
 * "Name [CODE]" or "Name | CODE" (code matched case-insensitively against
 * validCodes). Unrecognized or missing tags degrade to a plain name.
 */
export const parseTaggedParticipants = (
  input: string,
  validCodes: string[] = [],
): TaggedParticipant[] => {
  const canonicalByUpper = new Map<string, string>()
  for (const code of validCodes) {
    const trimmed = code.trim()
    if (trimmed) canonicalByUpper.set(trimmed.toUpperCase(), trimmed)
  }

  return input
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(line => {
      for (const pattern of [BRACKET_TAG_RE, PIPE_TAG_RE]) {
        const match = line.match(pattern)
        if (!match) continue
        const name = match[1]?.trim() ?? ''
        const tag = canonicalByUpper.get(match[2]?.trim().toUpperCase() ?? '')
        if (name && tag) return { name, tag }
      }
      return { name: line }
    })
}

const assertGroupCount = (groupCount: number) => {
  if (!Number.isInteger(groupCount) || groupCount < 1) {
    throw new RangeError('groupCount must be an integer >= 1')
  }
}

/**
 * Split participants into `groupCount` teams of even size (sizes differ by at
 * most 1) in random order.
 */
export const balancedGroups = (
  participants: string[],
  groupCount: number,
  rng: Rng = Math.random,
): string[][] => {
  assertGroupCount(groupCount)
  if (!participants.length) {
    throw new RangeError('participants must not be empty')
  }

  const groups: string[][] = Array.from({ length: groupCount }, () => [])
  shuffle(participants, rng).forEach((name, index) => {
    groups[index % groupCount]?.push(name)
  })
  return groups
}

/**
 * Assign tagged participants to `groupCount` teams so every tag (gender, skill
 * level, position, …) spreads as evenly as possible.
 *
 * Each tag pool is dealt round-robin so every group gets an even share, then
 * group sizes are evened out (≤1 difference, matching the plain path's promise)
 * by moving members from over-target groups to under-target groups — picking
 * the tag most represented in the source and least represented in the target
 * so per-tag balance survives the moves.
 *
 * Members with a tag not present in `tagOrder`, or without a tag, are dealt
 * randomly after the tag pools. Groups are returned sorted by tag order.
 */
export const balancedGroupsByTag = (
  participants: TaggedParticipant[],
  tagOrder: string[],
  groupCount: number,
  rng: Rng = Math.random,
): TaggedParticipant[][] => {
  assertGroupCount(groupCount)
  if (!participants.length) {
    throw new RangeError('participants must not be empty')
  }

  const groups: TaggedParticipant[][] = Array.from({ length: groupCount }, () => [])

  const poolByCode = new Map(tagOrder.map(code => [code, [] as TaggedParticipant[]]))
  const untagged: TaggedParticipant[] = []
  for (const member of shuffle(participants, rng)) {
    const pool = member.tag ? poolByCode.get(member.tag) : undefined
    if (pool) {
      pool.push(member)
    } else {
      untagged.push(member)
    }
  }

  for (const pool of poolByCode.values()) {
    pool.forEach((member, index) => {
      groups[index % groupCount]?.push(member)
    })
  }
  shuffle(untagged, rng).forEach((member, index) => {
    groups[index % groupCount]?.push(member)
  })

  const sizes = groups.map(group => group.length)
  const base = Math.floor(participants.length / groupCount)
  const remainder = participants.length % groupCount
  const targets = sizes.map((_, index) => base + (index < remainder ? 1 : 0))
  const tagCount = (group: TaggedParticipant[], tag: string | undefined) =>
    group.filter(member => member.tag === tag).length

  for (;;) {
    const over = sizes.findIndex((size, index) => size > targets[index]!)
    const under = sizes.findIndex((size, index) => size < targets[index]!)
    if (over < 0 || under < 0) break
    const source = groups[over]!
    const target = groups[under]!
    let bestIndex = 0
    let bestGain = -Infinity
    source.forEach((member, memberIndex) => {
      const gain = tagCount(source, member.tag) - tagCount(target, member.tag)
      if (gain > bestGain) {
        bestGain = gain
        bestIndex = memberIndex
      }
    })
    const moved = source.splice(bestIndex, 1)[0]
    if (moved) target.push(moved)
    sizes[over] = sizes[over]! - 1
    sizes[under] = sizes[under]! + 1
  }

  const rankByCode = new Map(tagOrder.map((code, index) => [code, index]))
  const untaggedRank = tagOrder.length
  return groups.map(group =>
    [...group].sort(
      (a, b) =>
        (a.tag !== undefined ? (rankByCode.get(a.tag) ?? untaggedRank) : untaggedRank) -
        (b.tag !== undefined ? (rankByCode.get(b.tag) ?? untaggedRank) : untaggedRank),
    ),
  )
}
