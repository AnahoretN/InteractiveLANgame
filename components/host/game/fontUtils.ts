/**
 * Font size calculation utilities for game components
 */

/**
 * Calculate dynamic font size for question text
 * @param text - The question text
 * @param baseSize - Base font size in rem (current size: 4 for mobile, 7 for desktop)
 * @returns Font size in rem (can go down to 25% of base for very long text)
 */
export function calculateQuestionFontSize(text: string, baseSize: number): number {
  const minSize = baseSize * 0.25; // Can go down to 25% for very long text
  const maxLength = 400; // At 400+ chars, use minimum size
  const shortThreshold = 30; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation between baseSize and minSize
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - mobile version
 * @param text - Answer text
 * @returns Font size in rem (max 1.5rem, min 0.75rem)
 */
export function calculateAnswerFontSizeMobile(text: string): number {
  const baseSize = 1.5; // 1.5rem max for mobile
  const minSize = 0.75; // 0.75rem min for mobile
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate font size for answer options - desktop version
 * @param text - Answer text
 * @returns Font size in rem (max 3rem, min 1.5rem)
 */
export function calculateAnswerFontSizeDesktop(text: string): number {
  const baseSize = 3; // 3rem max for desktop
  const minSize = 1.5; // 1.5rem min for desktop
  const maxLength = 50; // At 50+ chars, use minimum size
  const shortThreshold = 5; // Text length considered "short"

  const length = text.length;
  if (length <= shortThreshold) return baseSize;
  if (length >= maxLength) return minSize;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize - (baseSize - minSize) * ratio;
}

/**
 * Calculate dynamic font size for theme card text
 * @param text - The theme name
 * @param cardSizeFactor - Card size factor (1.0 for default, smaller for smaller cards)
 * @returns Font size in pixels
 */
export function calculateThemeCardFontSize(text: string, cardSizeFactor: number = 1.0): number {
  const baseSize = 36; // Base font size in pixels (reduced by 25% from 48px)
  const shortThreshold = 8;   // Characters for full size
  const maxLength = 40;       // Characters for minimum size
  const minSizeRatio = 0.35;  // Minimum size is 35% of base

  const length = text.length;
  if (length <= shortThreshold) return baseSize * cardSizeFactor;
  if (length >= maxLength) return baseSize * minSizeRatio * cardSizeFactor;

  // Linear interpolation
  const ratio = (length - shortThreshold) / (maxLength - shortThreshold);
  return baseSize * cardSizeFactor * (1 - ratio * (1 - minSizeRatio));
}

/**
 * Calculate grid layout and card size based on number of themes
 * @param themeCount - Number of themes
 * @returns Object with columns, rows, container dimensions, and card size factor
 */
export function calculateThemeGrid(themeCount: number) {
  const defaultColumns = 3;
  const defaultRows = 3;
  const defaultThemeCount = 9;
  const containerWidth = 1040;
  const containerHeight = 520;

  if (themeCount <= defaultThemeCount) {
    return {
      columns: defaultColumns,
      rows: defaultRows,
      width: containerWidth,
      height: containerHeight,
      cardSizeFactor: 1.0
    };
  }

  // Calculate scale factor for more themes
  const themeRatio = themeCount / defaultThemeCount;
  const scaleFactor = 1 / Math.sqrt(themeRatio);

  // Calculate new columns and rows
  let columns = defaultColumns;
  let rows = Math.ceil(themeCount / columns);

  if (rows > 5) {
    columns = Math.ceil(Math.sqrt(themeCount));
    rows = Math.ceil(themeCount / columns);
  }

  return {
    columns,
    rows,
    width: Math.round(containerWidth * scaleFactor * (columns / defaultColumns)),
    height: Math.round(containerHeight * scaleFactor * (rows / defaultRows)),
    cardSizeFactor: scaleFactor
  };
}
