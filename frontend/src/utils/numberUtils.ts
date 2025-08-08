// Utility functions for safe number handling

/**
 * Safely format a number with toFixed, handling null/undefined values
 * @param value - The value to format
 * @param decimals - Number of decimal places
 * @param defaultValue - Default value if input is null/undefined
 * @returns Formatted string
 */
export function safeToFixed(value: number | null | undefined, decimals: number = 2, defaultValue: number = 0): string {
  const safeValue = value ?? defaultValue;
  if (typeof safeValue !== 'number' || isNaN(safeValue)) {
    return defaultValue.toFixed(decimals);
  }
  return safeValue.toFixed(decimals);
}

/**
 * Safely get a numeric value, handling null/undefined
 * @param value - The value to check
 * @param defaultValue - Default value if input is null/undefined
 * @returns Safe numeric value
 */
export function safeNumber(value: number | null | undefined, defaultValue: number = 0): number {
  const safeValue = value ?? defaultValue;
  if (typeof safeValue !== 'number' || isNaN(safeValue)) {
    return defaultValue;
  }
  return safeValue;
}

/**
 * Safely calculate speed from velocity components
 * @param vx - Linear velocity X
 * @param vy - Linear velocity Y
 * @returns Speed magnitude
 */
export function safeSpeed(vx: number | null | undefined, vy: number | null | undefined): number {
  const safeVx = safeNumber(vx, 0);
  const safeVy = safeNumber(vy, 0);
  return Math.sqrt(safeVx * safeVx + safeVy * safeVy);
}

/**
 * Safely format percentage
 * @param value - The percentage value
 * @param decimals - Number of decimal places
 * @returns Formatted percentage string
 */
export function safePercentage(value: number | null | undefined, decimals: number = 1): string {
  return safeToFixed(value, decimals, 0) + '%';
}

/**
 * Safely format distance/position
 * @param value - The distance value
 * @param decimals - Number of decimal places
 * @param unit - Unit string (default: 'm')
 * @returns Formatted distance string
 */
export function safeDistance(value: number | null | undefined, decimals: number = 3, unit: string = 'm'): string {
  return safeToFixed(value, decimals, 0) + ' ' + unit;
}

/**
 * Safely format velocity
 * @param value - The velocity value
 * @param decimals - Number of decimal places
 * @param unit - Unit string (default: 'm/s')
 * @returns Formatted velocity string
 */
export function safeVelocity(value: number | null | undefined, decimals: number = 3, unit: string = 'm/s'): string {
  return safeToFixed(value, decimals, 0) + ' ' + unit;
}

/**
 * Safely format angular velocity
 * @param value - The angular velocity value
 * @param decimals - Number of decimal places
 * @param unit - Unit string (default: 'rad/s')
 * @returns Formatted angular velocity string
 */
export function safeAngularVelocity(value: number | null | undefined, decimals: number = 3, unit: string = 'rad/s'): string {
  return safeToFixed(value, decimals, 0) + ' ' + unit;
}

/**
 * Safely format voltage
 * @param value - The voltage value
 * @param decimals - Number of decimal places
 * @returns Formatted voltage string
 */
export function safeVoltage(value: number | null | undefined, decimals: number = 2): string {
  return safeToFixed(value, decimals, 0) + 'V';
}
