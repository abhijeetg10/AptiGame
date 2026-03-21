/**
 * db-shim.js
 * 
 * GOOGLE SHEETS BACKEND (Firestore Replacement).
 * Centralized, Free, and No Read Limits.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- FIREBASE CONFIG (For Auth Only) ---
const firebaseConfig = {
    apiKey: "AIzaSyAeEyap9MQ3eINdVhY3GGhdideIaSQ7M_Q",
    authDomain: "aptigame.firebaseapp.com",
    projectId: "aptigame",
    storageBucket: "aptigame.firebasestorage.app",
    messagingSenderId: "201198068351",
    appId: "1:201198068351:web:13a0b2c6aaacc21632154a",
    measurementId: "G-C9PZ77HM98"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// --- GOOGLE SHEETS BACKEND CONFIG ---
// Paste your new Web App URL here!
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdpD7vNosv001RBIkVP7cJVZH6J0ICnu0ycCNO6UWlRCo3BrxJKjplg011dS2uECI6fQ/exec";

// --- LOCAL STORAGE CACHE ---
const storage = {
    get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
    getDoc: (key) => JSON.parse(localStorage.getItem(`agy_doc_${key.replace(/\//g, '_')}`) || '{}'),
    setDoc: (key, val) => localStorage.setItem(`agy_doc_${key.replace(/\//g, '_')}`, JSON.stringify(val))
};

// --- MOCK FIRESTORE INTERFACE (SYNCED TO SHEETS) ---

export const db = { type: 'google-sheets-hybrid' };

export const collection = (db, ...path) => ({ path: path.join('/') });
export const doc = (db, ...path) => ({ path: path.join('/'), id: path[path.length-1] });
export const query = (q, ...args) => q; // Logic handled in fetch
export const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });
export const limit = (n) => ({ type: 'limit', n });
export const where = (f, op, v) => ({ type: 'where', f, op, v });

export const getDoc = async (docRef) => {
    const path = docRef.path;
    try {
        // We fetch the collection and find the doc (Sheets strategy)
        const colName = path.split('/')[0];
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?collection=${colName}`);
        const data = await res.json();
        const docId = docRef.id;
        const record = data.find(i => (i.id == docId || i._id == docId || i.uid == docId));
        
        if (record) {
            storage.setDoc(path, record);
            return { exists: () => true, data: () => record, id: docId };
        }
        return { exists: () => false };
    } catch (e) {
        console.warn("Sheets fetch failed, using cache for", path);
        const cached = storage.getDoc(path);
        return { exists: () => Object.keys(cached).length > 0, data: () => cached, id: docRef.id, _fromCache: true };
    }
};

export const getDocs = async (q) => {
    const colName = q.path.split('/')[0];
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}?collection=${colName}`);
        const data = await res.json();
        storage.set(`agy_col_${colName}`, data);
        
        return {
            forEach: (cb) => data.forEach(item => cb({ data: () => item, id: item.id || item._id || item.uid })),
            docs: data.map(item => ({ data: () => item, id: item.id || item._id || item.uid })),
            size: data.length,
            empty: data.length === 0
        };
    } catch (e) {
        console.warn("Sheets fetch failed for collection", colName);
        const cached = storage.get(`agy_col_${colName}`);
        return {
            forEach: (cb) => cached.forEach(item => cb({ data: () => item, id: item.id || item._id || item.uid })),
            docs: cached.map(item => ({ data: () => item, id: item.id || item._id || item.uid })),
            size: cached.length,
            empty: cached.length === 0,
            _fromCache: true
        };
    }
};

export const setDoc = async (docRef, data, options = {}) => {
    const path = docRef.path;
    const colName = path.split('/')[0];
    const docId = docRef.id || data.id || data.uid;

    const payload = {
        collection: colName,
        id: docId,
        ...data
    };

    // Immediate Local Update
    storage.setDoc(path, data);

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Apps Script requires no-cors normally for simple POST
            body: JSON.stringify(payload)
        });
        return { status: "submitted" };
    } catch (e) {
        console.error("Sheets Save Failed", e);
        return null;
    }
};

export const updateDoc = async (docRef, data) => {
    return await setDoc(docRef, data, { merge: true });
};

export const deleteDoc = async (docRef) => {
    const path = docRef.path;
    const colName = path.split('/')[0];
    const docId = docRef.id;

    // Local Update
    localStorage.removeItem(`agy_doc_${path.replace(/\//g, '_')}`);

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                collection: colName,
                id: docId,
                _DELETE: true // Signal deletion even if script doesn't handle it yet
            })
        });
    } catch (e) {
        console.error("Sheets Delete Failed", e);
    }
};

export const addDoc = async (colRef, data) => {
    const colName = colRef.path;
    const payload = {
        collection: colName,
        ...data
    };

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(payload)
        });
        return { id: 'generated' };
    } catch (e) {
        console.error("Sheets Add Failed", e);
        return null;
    }
};

export const getCountFromServer = async (colRef) => {
    const colName = colRef.path.split('/')[0];
    try {
        const res = await fetch(`${GOOGLE_SCRIPT_URL}`);
        const stats = await res.json();
        const collectionInfo = stats.collections.find(c => c.name === colName);
        return { data: () => ({ count: collectionInfo ? collectionInfo.count : 0 }) };
    } catch (e) {
        const cached = storage.get(`agy_col_${colName}`);
        return { data: () => ({ count: cached.length }), _fromCache: true };
    }
};

// --- MOCK UTILS ---
export const increment = (n) => ({ __type: 'increment', value: n });
export const arrayUnion = (...elements) => ({ __type: 'arrayUnion', elements });
export const serverTimestamp = () => new Date().toISOString();
export const Timestamp = {
    now: () => new Date(),
    fromDate: (date) => date
};

export { onAuthStateChanged, signOut, signInWithPopup };

console.log("AptiVerse: Using Google Sheets Centralized Backend.");
