export interface VotingStatus {
  totalVotes: number
  hasVoted: boolean
  votedLogoId: number | null
  isOpen: boolean
}

export interface Results {
  totalVotes: number
  logos: Array<{ id: number; votes: number }>
  lastUpdated: string
}

export interface AdminSession {
  token: string
  expiresAt: string
}
