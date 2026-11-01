// CSS classes of the frames holding card images, for landscape and turned cards.

import type { Turn } from '../engine/geometry';

/** Classes of a landscape frame showing the portrait card image inside it turned a quarter to one side (with a leading space). */
export function turnedClass(turn: Turn): string {
  return ` landscape${turn === 'right' ? ' turned-right' : ''}`;
}

/**
 * Classes of the frame holding a card's image (with a leading space): a landscape frame shows the image turned a
 * quarter to the left for the front and to the right for the back, which is printed the other way round.
 */
export function landscapeClass(landscape: boolean, faceUp: boolean): string {
  return landscape ? turnedClass(faceUp ? 'left' : 'right') : '';
}
