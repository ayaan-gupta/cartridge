import { SCREEN_H, SCREEN_W } from '@/engine/types'

/**
 * The largest whole-number scale at which the 160 by 144 screen fits the
 * space. Whole numbers only: at 2.5 times, some game pixels would be two
 * screen pixels wide and some three, and the picture would shimmer as it
 * scrolls.
 */
export function integerScale(availableWidth: number, availableHeight: number, max = 4): number {
  const fit = Math.floor(Math.min(availableWidth / SCREEN_W, availableHeight / SCREEN_H))
  return Math.max(1, Math.min(max, fit))
}

/**
 * The scale for the handheld on a page, from the size of the window. It is
 * worked out from the window rather than from the handheld's own container,
 * because the container is sized by the handheld and would only ever agree
 * with whatever scale it already had.
 *
 * The numbers mirror the stylesheet: on a phone the handheld runs edge to
 * edge with 36px of shell around the screen, on wider windows it has 80px of
 * shell and sits in a padded page, and above 900px a column of text sits
 * beside it. About 300px of height goes to the controls and the page header.
 */
export function screenScale(windowWidth: number, windowHeight: number, max = 4): number {
  let width = windowWidth - 36
  if (windowWidth > 430) width = Math.min(windowWidth, 1080) - 48 - 80
  if (windowWidth > 900) width -= 412
  return integerScale(width, windowHeight - 300, max)
}
