/**
 * Spaced Repetition System (SRS) Implementation
 * Based on the SM-2 Algorithm by Piotr Wozniak
 */

export type ResponseQuality = 0 | 1 | 2 | 3 | 4 | 5;
export type WordStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SRSCard {
  wordId: string;
  status: WordStatus;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReview: Date;
  lastReview: Date | null;
  totalReviews: number;
  correctReviews: number;
}

const MIN_EASE_FACTOR = 1.3;
const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Create initial progress for a new word
 */
export function createInitialProgress(wordId: string): SRSCard {
  return {
    wordId,
    status: 'new',
    interval: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    repetitions: 0,
    nextReview: new Date(),
    lastReview: null,
    totalReviews: 0,
    correctReviews: 0,
  };
}

/**
 * Calculate the next review date and update progress
 * Quality: 0-5 (0=complete forget, 5=perfect recall)
 */
export function calculateNextReview(
  card: SRSCard,
  quality: ResponseQuality
): SRSCard {
  const now = new Date();
  const newCard = { ...card };

  // Update ease factor using SM-2 formula
  newCard.easeFactor = Math.max(
    MIN_EASE_FACTOR,
    card.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  if (quality >= 3) {
    // Correct response
    if (card.repetitions === 0) {
      newCard.interval = 1;
    } else if (card.repetitions === 1) {
      newCard.interval = 6;
    } else {
      newCard.interval = Math.round(card.interval * newCard.easeFactor);
    }
    newCard.repetitions++;
    newCard.correctReviews++;
  } else {
    // Incorrect response - reset
    newCard.repetitions = 0;
    newCard.interval = 1;
  }

  // Calculate next review date
  newCard.nextReview = new Date(now.getTime() + newCard.interval * 24 * 60 * 60 * 1000);
  newCard.lastReview = now;
  newCard.totalReviews++;

  // Update status based on progress
  if (newCard.repetitions >= 5 && newCard.interval >= 21) {
    newCard.status = 'mastered';
  } else if (newCard.repetitions >= 1) {
    newCard.status = 'reviewing';
  } else {
    newCard.status = 'learning';
  }

  return newCard;
}

/**
 * Map response string to quality value
 */
export function responseToQuality(response: 'easy' | 'medium' | 'hard' | 'forgot'): ResponseQuality {
  const mapping: Record<string, ResponseQuality> = {
    easy: 5,
    medium: 4,
    hard: 3,
    forgot: 0,
  };
  return mapping[response];
}
