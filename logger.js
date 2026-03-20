/**
 * logger.js - Simple error monitoring and logging utility for AptiVerse
 */

export const Logger = {
    info: (message, data = {}) => {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`, data);
    },

    warn: (message, data = {}) => {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, data);
    },

    error: (message, error = {}, context = {}) => {
        console.error(`[AgyDB Error][${context.name || JSON.stringify(context)}] ${new Date().toISOString()}: ${message}`, {
            error: error.message || error,
            stack: error.stack,
            ...context
        });
        
        // Potential extension: Send to a telemetry endpoint (e.g. Sentry, Analytics API)
        // if (typeof gtag === 'function') {
        //     gtag('event', 'exception', { 'description': message, 'fatal': false });
        // }
    },

    handleDatabaseError: (operation, error) => {
        Logger.error(`Database operation failed: ${operation}`, error);
        
        // Show a non-intrusive alert if the operation was critical
        if (operation.includes('saveScore')) {
            alert("Warning: We're having trouble saving your progress locally. Check your browser storage.");
        }
    }
};
