/**
 * db-shim.js
 * 
 * Re-routed to CENTRALIZED FIREBASE for global data sharing.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { 
    getFirestore, collection, getDocs, query, orderBy, limit, doc, 
    where, getDoc, setDoc, updateDoc, deleteDoc, addDoc, 
    getCountFromServer, Timestamp, serverTimestamp, increment, arrayUnion 
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

export { 
    collection, getDocs, query, orderBy, limit, doc, 
    where, getDoc, setDoc, updateDoc, deleteDoc, addDoc, 
    getCountFromServer, Timestamp, serverTimestamp, increment, arrayUnion,
    onAuthStateChanged, signOut, signInWithPopup
};

console.log("AptiVerse: Data layer switched back to CENTRALIZED FIREBASE.");
