/**
 * db-shim.js
 * 
 * HYBRID QUOTA-RESILIENT DATA LAYER.
 * Integrates Centralized Firebase with Local AgyDB Caching & Fallback.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    getFirestore, collection as fbsCollection, getDocs as fbsGetDocs, query as fbsQuery, 
    orderBy as fbsOrderBy, limit as fbsLimit, doc as fbsDoc, where as fbsWhere, 
    getDoc as fbsGetDoc, setDoc as fbsSetDoc, updateDoc as fbsUpdateDoc, 
    deleteDoc as fbsDeleteDoc, addDoc as fbsAddDoc, getCountFromServer as fbsGetCount, 
    Timestamp, serverTimestamp as fbsServerTimestamp, increment as fbsIncrement, arrayUnion as fbsArrayUnion 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { 
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// --- HELPER: LOCAL STORAGE LAYER ---
const storage = {
    getCol: (colName) => JSON.parse(localStorage.getItem(`agy_col_${colName}`) || '[]'),
    setCol: (colName, items) => localStorage.setItem(`agy_col_${colName}`, JSON.stringify(items)),
    getDoc: (docPath) => JSON.parse(localStorage.getItem(`agy_doc_${docPath.replace(/\//g, '_')}`) || '{}'),
    setDoc: (docPath, data) => localStorage.setItem(`agy_doc_${docPath.replace(/\//g, '_')}`, JSON.stringify(data))
};

// --- SYNC ENGINE: SHADOW WRITES & CACHED READS ---

/**
 * Normalizes Firestore path to string
 */
function getPath(obj) {
    if (typeof obj === 'string') return obj;
    if (obj.path) return Array.isArray(obj.path) ? obj.path.join('/') : obj.path;
    return '';
}

export const collection = fbsCollection;
export const doc = fbsDoc;
export const query = fbsQuery;
export const orderBy = fbsOrderBy;
export const limit = fbsLimit;
export const where = fbsWhere;
export const Timestamp = Timestamp;
export const serverTimestamp = fbsServerTimestamp;
export const increment = fbsIncrement;
export const arrayUnion = fbsArrayUnion;

export const getDoc = async (docRef) => {
    const path = getPath(docRef);
    try {
        const snap = await fbsGetDoc(docRef);
        if (snap.exists()) {
            storage.setDoc(path, snap.data());
        }
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable' || e.code === 'permission-denied') {
            const data = storage.getDoc(path);
            const exists = Object.keys(data).length > 0;
            return {
                exists: () => exists,
                data: () => data,
                id: docRef.id,
                _fromCache: true
            };
        }
        throw e;
    }
};

export const getDocs = async (q) => {
    const colPath = getPath(q); // Simplified
    try {
        const snap = await fbsGetDocs(q);
        const items = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id, _id: d.id }));
        if (colPath) storage.setCol(colPath, items);
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable') {
            const items = storage.getCol(colPath);
            return {
                forEach: (cb) => items.forEach(item => cb({ data: () => item, id: item.id || item._id })),
                docs: items.map(item => ({ data: () => item, id: item.id || item._id })),
                size: items.length,
                empty: items.length === 0,
                _fromCache: true
            };
        }
        throw e;
    }
};

export const setDoc = async (docRef, data, options = {}) => {
    const path = getPath(docRef);
    // Shadow Write (Immediate Local Update)
    if (options.merge) {
        const existing = storage.getDoc(path);
        storage.setDoc(path, { ...existing, ...data });
    } else {
        storage.setDoc(path, data);
    }
    
    try {
        return await fbsSetDoc(docRef, data, options);
    } catch (e) {
        console.warn("Global setDoc failed (using local), error:", e.code);
        return null;
    }
};

export const addDoc = async (colRef, data) => {
    const colPath = getPath(colRef);
    const tempId = 'temp_' + Date.now();
    
    // Shadow Write
    const items = storage.getCol(colPath);
    items.unshift({ ...data, _id: tempId, id: tempId });
    storage.setCol(colPath, items);

    try {
        return await fbsAddDoc(colRef, data);
    } catch (e) {
        console.warn("Global addDoc failed (saved locally), error:", e.code);
        return { id: tempId, _fromCache: true };
    }
};

export const getCountFromServer = async (colRef) => {
    try {
        const snap = await fbsGetCount(colRef);
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable') {
            const colPath = getPath(colRef);
            const items = storage.getCol(colPath);
            return {
                data: () => ({ count: items.length }),
                _fromCache: true
            };
        }
        throw e;
    }
};

export { onAuthStateChanged, signOut, signInWithPopup };

console.log("AptiVerse: Hybrid Resilience Layer Active (Firebase + AgyDB Cache).");
