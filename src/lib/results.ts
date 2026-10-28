import type { Results } from './types'

export function rankLogos(results: Results) {
  const sorted = [...results.logos].sort((a, b) => b.votes - a.votes || a.id - b.id)
  return sorted.map((logo) => ({
    ...logo,
    rank: logo.votes > 0 ? sorted.findIndex((item) => item.votes === logo.votes) + 1 : null,
    percentage: results.totalVotes ? (logo.votes / results.totalVotes) * 100 : 0,
  }))
}

export function resultsToCsv(results: Results): string {
  const rows = rankLogos(results).map((logo) => [logo.rank ?? '', `Logo ${String(logo.id).padStart(2, '0')}`, logo.votes, `${logo.percentage.toFixed(2)}%`].join(','))
  return '\uFEFFPeringkat,Logo,Jumlah suara,Persentase\r\n' + rows.join('\r\n')
}
