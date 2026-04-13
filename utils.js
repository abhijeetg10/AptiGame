/**
 * utils.js
 * Shared utility functions for AptiVerse.
 */

export function getISOWeekString() {
    const d = new Date();
    // Copy date to avoid modifying the original
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    // Get first day of year
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    // Return year and week number formatted as YYYY-WW
    const year = date.getUTCFullYear();
    const paddedWeek = weekNo.toString().padStart(2, '0');
    return `${year}-${paddedWeek}`;
}
