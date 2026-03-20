/**
 * db-shim.js
 * 
 * Re-routed to AgyDB (Local Storage) for migration.
 */
import * as agy from "./agy-db.js";

// Export the AgyDB implementation as standard Firebase objects
export const db = agy.db;
export const auth = agy.auth;
export const provider = agy.provider || { type: 'local-google-provider' };

// Firestore Functions
export const collection = agy.collection;
export const getDocs = agy.getDocs;
export const query = agy.query;
export const orderBy = agy.orderBy;
export const limit = agy.limit;
export const doc = agy.doc;
export const where = agy.where;
export const getDoc = agy.getDoc;
export const setDoc = agy.setDoc;
export const updateDoc = agy.updateDoc;
export const deleteDoc = agy.deleteDoc;
export const addDoc = agy.addDoc;
export const getCountFromServer = agy.getCountFromServer;
export const Timestamp = agy.Timestamp;
export const serverTimestamp = agy.serverTimestamp;
export const increment = agy.increment;

// Auth Functions
export const onAuthStateChanged = agy.onAuthStateChanged;
export const signOut = agy.signOut;
export const signInWithPopup = agy.signInWithPopup;

// Initialization
console.log("AptiVerse: Data layer switched to AgyDB.");
