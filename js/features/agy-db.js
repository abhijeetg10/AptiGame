import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// --- FIREBASE AUTH CONFIG ---
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

// Re-export Auth Functions
export { signInWithPopup, signOut, onAuthStateChanged };

// --- DECODER (RESTORING TIMESTAMPS) ---
function decodeFirebaseData(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    // If it looks like a Firebase Timestamp object {seconds, nanoseconds}
    if (obj.hasOwnProperty('seconds') && obj.hasOwnProperty('nanoseconds') && Object.keys(obj).length === 2) {
        return {
            seconds: obj.seconds,
            nanoseconds: obj.nanoseconds,
            toDate: () => new Date(obj.seconds * 1000),
            toLocaleString: () => new Date(obj.seconds * 1000).toLocaleString()
        };
    }

    // Recursively process arrays and objects
    if (Array.isArray(obj)) {
        return obj.map(decodeFirebaseData);
    }
    
    const decoded = {};
    for (const key in obj) {
        decoded[key] = decodeFirebaseData(obj[key]);
    }
    return decoded;
}

const storage = {
    get: (key) => decodeFirebaseData(JSON.parse(localStorage.getItem(key) || '[]')),
    set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
    getDoc: (key) => decodeFirebaseData(JSON.parse(localStorage.getItem(key) || '{}')),
    setDoc: (key, val) => localStorage.setItem(key, JSON.stringify(val))
};

// --- FIRESTORE EMULATION (AGYDB) ---
export const db = { type: 'agy-local' };

export const Timestamp = {
    now: () => new Date(),
    fromDate: (date) => date,
    fromMillis: (ms) => new Date(ms)
};

// Mocking serverTimestamp as a current Date
export function serverTimestamp() {
    return new Date().toISOString();
}

// Mocking increment
export function increment(n) {
    return { __type: 'increment', value: n };
}

// Mocking arrayUnion
export function arrayUnion(...elements) {
    return { __type: 'arrayUnion', elements };
}

export class Query {
    constructor(path, filters = []) {
        this.path = path; // array of path segments
        this.filters = filters;
        this.sortField = null;
        this.sortDir = 'asc';
        this.limitCount = Infinity;
    }
}

export function collection(db, ...path) {
    return new Query(path);
}

export function doc(db, ...path) {
    return { path };
}

export function query(q, ...operators) {
    const newQuery = new Query(q.path, [...q.filters]);
    operators.forEach(op => {
        if (op.type === 'orderBy') {
            newQuery.sortField = op.field;
            newQuery.sortDir = op.dir;
        } else if (op.type === 'limit') {
            newQuery.limitCount = op.count;
        } else if (op.type === 'where') {
            newQuery.filters.push(op);
        }
    });
    return newQuery;
}

export function where(field, op, value) {
    return { type: 'where', field, op, value };
}

export function orderBy(field, dir = 'asc') {
    return { type: 'orderBy', field, dir };
}

export function limit(count) {
    return { type: 'limit', count };
}

export async function getCountFromServer(q) {
    const key = getCollectionKey(q.path);
    const data = storage.get(key);
    // Apply filters if any
    let filtered = data;
    q.filters.forEach(f => {
        if (f.op === '==') filtered = filtered.filter(d => d[f.field] === f.value);
    });
    return {
        data: () => ({ count: filtered.length })
    };
}

// --- DATA OPERATIONS ---

function getCollectionKey(path) {
    return `agy_col_${path.join('_')}`;
}

export async function getDocs(q) {
    const key = getCollectionKey(q.path);
    let data = storage.get(key);

    // Filter
    q.filters.forEach(f => {
        if (f.op === '==') data = data.filter(d => d[f.field] === f.value);
    });

    // Sort
    if (q.sortField) {
        data.sort((a, b) => {
            const valA = a[q.sortField];
            const valB = b[q.sortField];
            if (q.sortDir === 'desc') return valB > valA ? 1 : -1;
            return valA > valB ? 1 : -1;
        });
    }

    // Limit
    data = data.slice(0, q.limitCount);

    return {
        forEach: (callback) => data.forEach(d => callback({ id: d._id || d.id, data: () => d })),
        docs: data.map(d => ({ id: d._id || d.id, data: () => d })),
        empty: data.length === 0,
        size: data.length
    };
}

export async function getDoc(dRef) {
    const segments = dRef.path;
    const docId = segments[segments.length - 1];
    
    // 1. Check Collection First
    if (segments.length % 2 === 0) {
        const collectionKey = getCollectionKey(segments.slice(0, -1));
        const items = storage.get(collectionKey);
        const item = items.find(i => (i._id || i.id) === docId);
        if (item) return { exists: () => true, data: () => item };
    }

    // 2. Check Individual Doc Key (Fallback/Repair)
    const docKey = `agy_doc_${segments.join('_')}`;
    const data = storage.getDoc(docKey);
    const exists = Object.keys(data).length > 0;
    
    // PROACTIVE SYNC: If it exists in individual doc but NOT in collection, sync it now!
    if (exists && segments.length % 2 === 0) {
        console.log(`Self-healing AgyDB: Syncing missing doc to collection for ${segments.join('/')}`);
        // We use the storage set directly to avoid infinite loops and keep it fast
        const collectionKey = getCollectionKey(segments.slice(0, -1));
        let collectionData = storage.get(collectionKey);
        const syncData = { ...data, _id: docId, id: docId };
        collectionData.push(syncData);
        storage.set(collectionKey, collectionData);
    }
    
    return {
        exists: () => exists,
        data: () => data
    };
}

export async function setDoc(dRef, data, options = {}) {
    const segments = dRef.path;
    const docKey = `agy_doc_${segments.join('_')}`;
    let existing = storage.getDoc(docKey);
    
    let finalData = options.merge ? { ...existing, ...data } : data;
    
    // Handle increments and arrayUnions
    Object.keys(finalData).forEach(k => {
        if (finalData[k] && finalData[k].__type === 'increment') {
            finalData[k] = (Number(existing[k]) || 0) + finalData[k].value;
        } else if (finalData[k] && finalData[k].__type === 'arrayUnion') {
            const currentArr = Array.isArray(existing[k]) ? existing[k] : [];
            finalData[k] = [...new Set([...currentArr, ...finalData[k].elements])];
        }
    });

    storage.setDoc(docKey, finalData);

    // SYNC TO COLLECTION (Ensures admin dashboard and leaderboards see the update)
    if (segments.length % 2 === 0) {
        const collectionPath = segments.slice(0, -1);
        const collectionKey = getCollectionKey(collectionPath);
        const docId = segments[segments.length - 1];
        
        let collectionData = storage.get(collectionKey);
        const index = collectionData.findIndex(item => (item._id || item.id) === docId);
        
        // Ensure ID is preserved in collection item
        const syncData = { ...finalData, _id: docId, id: docId };
        
        if (index > -1) {
            collectionData[index] = syncData;
        } else {
            collectionData.push(syncData);
        }
        storage.set(collectionKey, collectionData);
    }
}

export async function addDoc(cRef, data) {
    const key = getCollectionKey(cRef.path);
    const items = storage.get(key);
    const docId = Math.random().toString(36).substr(2, 9);
    const newItem = { 
        ...data, 
        id: docId,
        _id: docId,
        timestamp: new Date().toISOString()
    };
    items.push(newItem);
    storage.set(key, items);

    // Also save as individual doc for individual getDoc calls
    const docKey = `agy_doc_${[...cRef.path, docId].join('_')}`;
    storage.setDoc(docKey, newItem);

    return { id: docId };
}

export async function updateDoc(dRef, data) {
    return setDoc(dRef, data, { merge: true });
}

export async function deleteDoc(dRef) {
    const segments = dRef.path;
    const docKey = `agy_doc_${segments.join('_')}`;
    localStorage.removeItem(docKey);

    if (segments.length % 2 === 0) {
        const collectionKey = getCollectionKey(segments.slice(0, -1));
        const id = segments[segments.length - 1];
        let items = storage.get(collectionKey);
        items = items.filter(i => (i._id || i.id) !== id);
        storage.set(collectionKey, items);
    }
}

// No local init needed anymore as we use real Firebase Auth.
