/**
 * logger.js - Simple error monitoring and logging utility for AptiGame
 */

export const Logger = {
    info: (message, data = {}) => {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`, data);
    },

    warn: (message, data = {}) => {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, data);
    },

    error: (message, error = {}, context = {}) => {
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, {
            error: error.message || error,
            stack: error.stack,
            ...context
        });
        
        // Potential extension: Send to a telemetry endpoint (e.g. Sentry, Firebase Analytics)
        // if (typeof gtag === 'function') {
        //     gtag('event', 'exception', { 'description': message, 'fatal': false });
        // }
    },

    /**
     * Specialized handler for Firestore operation failures
     * @param {string} operation - The name of the operation (e.g., 'saveScore')
     * @param {Error} error - The caught error
     */
    handleFirestoreError: (operation, error) => {
        Logger.error(`Firestore operation failed: ${operation}`, error);
        
        // Show a non-intrusive alert if the operation was critical
        if (operation.includes('saveScore')) {
            alert("Warning: We're having trouble saving your score. Check your internet connection.");
        }
    }
};
