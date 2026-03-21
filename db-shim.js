/**
 * db-shim.js
 * 
 * HYBRID QUOTA-RESILIENT DATA LAYER (Firebase + AgyDB Cache).
 * Restored to Centralized Firebase as primary.
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

// --- HELPER: LOCAL STORAGE CACHE ---
const storage = {
    get: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
    getDoc: (key) => JSON.parse(localStorage.getItem(`agy_doc_${key.replace(/\//g, '_')}`) || '{}'),
    setDoc: (key, val) => localStorage.setItem(`agy_doc_${key.replace(/\//g, '_')}`, JSON.stringify(val))
};

// --- WRAPPER LOGIC ---

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
export { Timestamp };
export const serverTimestamp = fbsServerTimestamp;
export const increment = fbsIncrement;
export const arrayUnion = fbsArrayUnion;

export const getDoc = async (docRef) => {
    const path = getPath(docRef);
    try {
        const snap = await fbsGetDoc(docRef);
        if (snap.exists()) storage.setDoc(path, snap.data());
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable') {
            const data = storage.getDoc(path);
            return { exists: () => Object.keys(data).length > 0, data: () => data, id: docRef.id, _fromCache: true };
        }
        throw e;
    }
};

export const getDocs = async (q) => {
    const colPath = getPath(q);
    try {
        const snap = await fbsGetDocs(q);
        const items = [];
        snap.forEach(d => items.push({ ...d.data(), id: d.id }));
        if (colPath) storage.set(`agy_col_${colPath}`, items);
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable') {
            const cached = storage.get(`agy_col_${colPath}`);
            return {
                forEach: (cb) => cached.forEach(item => cb({ data: () => item, id: item.id })),
                docs: cached.map(item => ({ data: () => item, id: item.id })),
                size: cached.length,
                empty: cached.length === 0,
                _fromCache: true
            };
        }
        throw e;
    }
};

export const setDoc = async (docRef, data, options = {}) => {
    const path = getPath(docRef);
    storage.setDoc(path, data);
    return await fbsSetDoc(docRef, data, options);
};

export const updateDoc = async (docRef, data) => {
    return await fbsUpdateDoc(docRef, data);
};

export const deleteDoc = async (docRef) => {
    return await fbsDeleteDoc(docRef);
};

export const addDoc = async (colRef, data) => {
    return await fbsAddDoc(colRef, data);
};

export const getCountFromServer = async (colRef) => {
    try {
        const snap = await fbsGetCount(colRef);
        return snap;
    } catch (e) {
        if (e.code === 'resource-exhausted' || e.code === 'unavailable') {
            const colPath = getPath(colRef);
            const cached = storage.get(`agy_col_${colPath}`);
            return { data: () => ({ count: cached.length }), _fromCache: true };
        }
        throw e;
    }
};

export { onAuthStateChanged, signOut, signInWithPopup };

console.log("AptiVerse: Restored to Firebase (Centralized).");
