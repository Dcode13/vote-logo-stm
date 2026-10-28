import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rankLogos, resultsToCsv } from '../src/lib/results.ts'

test('ranking gives tied votes equal ranks without inventing a winner for zero votes', () => {
  const results = { totalVotes: 10, logos: [{ id: 3, votes: 0 }, { id: 2, votes: 5 }, { id: 1, votes: 5 }], lastUpdated: '' }
  const ranking = rankLogos(results)
  assert.deepEqual(ranking.map((logo) => [logo.id, logo.rank, logo.percentage]), [[1, 1, 50], [2, 1, 50], [3, null, 0]])
  assert.deepEqual(results.logos.map((logo) => logo.id), [3, 2, 1])
})

test('empty votes have finite zero percentages and CSV matches the ranked totals', () => {
  const empty = { totalVotes: 0, logos: [{ id: 1, votes: 0 }], lastUpdated: '' }
  assert.equal(rankLogos(empty)[0].percentage, 0)
  assert.equal(rankLogos(empty)[0].rank, null)
  assert.match(resultsToCsv(empty), /,Logo 01,0,0\.00%/)
  assert.ok(resultsToCsv(empty).startsWith('\uFEFF'))
})
