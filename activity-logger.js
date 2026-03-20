import { collection, addDoc, serverTimestamp, db, auth } from "./db-shim.js";

/**
 * Activity Logger - Tracks user engagement for the Consistency Calendar
 */
export const ActivityLogger = {
    /**
     * Log a specific activity event
     * @param {string} type - 'solve', 'login', or 'mock_test'
     * @param {string} challenge - The id of the challenge (e.g., 'sudoku', 'grid')
     * @param {object} metadata - Optional extra data
     */
    log: async function(type, challenge = 'general', metadata = {}) {
        const user = auth.currentUser;
        if (!user) return;

        try {
            await addDoc(collection(db, "activity_logs"), {
                uid: user.uid,
                type: type,
                challenge: challenge,
                timestamp: serverTimestamp(),
                ...metadata
            });
            console.log(`Activity Logged: ${type} for ${challenge}`);
        } catch (e) {
            console.warn("Activity logging failed:", e);
        }
    }
};
