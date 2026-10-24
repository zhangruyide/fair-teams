# fair-teams

Zero-dependency fair grouping: split participants into even teams while balancing tags (gender, skill level, positions, …) across every team.

Built for and extracted from [Random Group Generator](https://random-group-generator.com) — try the full web tool with exports, scenarios and 9 languages.

## Why

Most "random group" helpers shuffle a list and deal it out. That is fair per-person, but the *composition* of each team is luck: one team ends up with all the goalkeepers, one class group gets all the girls. `fair-teams` deals each tag pool round-robin so every team gets an even share of every tag, then repairs size differences with moves chosen to preserve that balance.

- **Even team sizes** — sizes never differ by more than 1
- **Tag balance** — every tag (gender, skill, position) spreads across teams as evenly as the counts allow
- **Zero dependencies**, ESM + TypeScript types
- **Injectable RNG** — pass your own PRNG for reproducible draws

## Install

```sh
npm install fair-teams
```

## Usage

### Plain even groups

```ts
import { balancedGroups } from 'fair-teams'

balancedGroups(['Alice', 'Bob', 'Carol', 'Dave', 'Eve'], 2)
// [['Carol', 'Alice'], ['Dave', 'Bob', 'Eve']] — random, sizes differ by <= 1
```

### Balanced by tag (gender, skill, position…)

```ts
import { balancedGroupsByTag, parseTaggedParticipants } from 'fair-teams'

const roster = parseTaggedParticipants(
  `
  Alisson [GK]
  Courtois | GK
  Van Dijk [DF]
  Dias [DF]
  Shaw [DF]
  Walker [DF]
  Modrić [MF]
  De Bruyne [ MF ]
  Foden [MF]
  Mount | MF
  Mbappé [FW]
  Haaland | FW
  `,
  ['GK', 'DF', 'MF', 'FW'],
)

const teams = balancedGroupsByTag(roster, ['GK', 'DF', 'MF', 'FW'], 2)
// Two teams of 6 — each team gets exactly 1 GK, 2 DF, 2 MF, 1 FW.
```

Entries accept `Name [CODE]` or `Name | CODE` syntax (case-insensitive); unrecognized tags degrade to a plain name, and untagged members are dealt randomly after the tag pools.

### Deterministic draws

```ts
const seeded = () => 0.42 // any () => number
balancedGroups(names, 3, seeded)
```

## API

| Export | Description |
| --- | --- |
| `balancedGroups(participants, groupCount, rng?)` | Even-sized random groups (strings). |
| `balancedGroupsByTag(participants, tagOrder, groupCount, rng?)` | Tag-balanced even groups (`{ name, tag? }` members). Groups come back sorted by tag order. |
| `parseParticipants(input)` | Split a newline/comma list into names. |
| `parseTaggedParticipants(input, validCodes?)` | Parse `Name [CODE]` / `Name \| CODE` entries into tagged members. |
| `shuffle(items, rng?)` | Fisher–Yates shuffle, new array. |

Both grouping functions throw `RangeError` on `groupCount < 1` or an empty roster. `groupCount` larger than the roster yields singleton groups followed by empty groups.

## How tag balancing works

1. Shuffle, then bucket members into one pool per tag (in `tagOrder`); untagged members form their own pool.
2. Deal each pool round-robin across groups, so each group receives an even share of every tag.
3. Even out sizes to the target (floor/remainder split): while any group is over/under target, move the member whose tag is most over-represented in the source group and least represented in the target group — balance survives the repair.

## License

MIT
