import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { setDoc, doc, getDoc, arrayUnion, increment } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { auth, provider, db } from "./firebase-config.js";

const loginBtn = document.getElementById("nav-login-btn");
const userProfile = document.getElementById("nav-user-profile");
const userAvatar = document.getElementById("nav-user-avatar");
const userName = document.getElementById("nav-user-name");
const logoutBtn = document.getElementById("nav-logout-btn");

// NEW GOOGLE SCRIPT URL
const GOOGLE_SCRIPT_URL =
"https://script.google.com/macros/s/AKfycbwz5YPrzW7dxg3qnF6toMVIBahoWWoUk6mKeZtaZ-vfoh49NAdbLiyfQAXIDVuZ7ggVKQ/exec";


// Detect login state
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (loginBtn) loginBtn.style.display = "none";
        if (userProfile) {
            userProfile.style.display = "flex";
            const firstName = user.displayName ? user.displayName.split(" ")[0] : "User";
            userName.innerText = firstName;
            const initial = firstName.charAt(0).toUpperCase();
            userAvatar.innerText = initial;

            // Add Profile Link if not exists
            if (!document.getElementById('nav-profile-link')) {
                const profileLink = document.createElement('a');
                profileLink.id = 'nav-profile-link';
                profileLink.href = 'profile.html';
                profileLink.innerText = 'My Profile';
                profileLink.style.cssText = 'font-size: 0.85rem; color: var(--primary); font-weight: 700; margin-left: 1rem;';
                userProfile.insertBefore(profileLink, logoutBtn);
            }
        }
        // ROBUST SYNC: Ensure the user exists in Firestore even if they were auto-logged in
        await syncUserToFirestore(user);
    } else {
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (userProfile) userProfile.style.display = "none";
        const existingLink = document.getElementById('nav-profile-link');
        if (existingLink) existingLink.remove();
    }
});

// ROBUST SYNC FUNCTION
async function syncUserToFirestore(user) {
    if (!user) return;
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        const today = new Date().toLocaleDateString();
        
        let loginsToday = 1;
        let hasRated = false;

        if (userSnap.exists()) {
            const data = userSnap.data();
            hasRated = data.hasRated || false;
            const lastLogin = data.lastLogin;
            let lastLoginDate = "";
            
            if (lastLogin) {
                const dateObj = (typeof lastLogin.toDate === 'function') ? lastLogin.toDate() : new Date(lastLogin);
                lastLoginDate = dateObj.toLocaleDateString();
            }

            // If it's the SAME day, we only increment if it's a NEW session (we can't easily detect full sessions without state, 
            // but we can at least ensure the record exists). For now, let's just update lastLogin and sync basic info.
            if (lastLoginDate === today) {
                loginsToday = (data.loginsToday || 0); 
                // We'll increment only if this is reached via explicit login button in loginWithGoogle
            }
        }

        await setDoc(userDocRef, {
            name: user.displayName || "Unknown",
            email: user.email || "No Email",
            photoURL: user.photoURL || "",
            lastLogin: new Date(),
            // Only defaults if new doc
            loginsToday: loginsToday,
            totalLogins: increment(0), // Just ensuring the field exists
            hasRated: hasRated
        }, { merge: true }); 
    } catch (e) {
        console.error("Auto-sync failed:", e);
    }
}


// LOGIN FUNCTION
export const loginWithGoogle = async () => {

    try {

        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // 1. Google Sheets Logging
        const payload = {
            name: user.displayName || "Unknown",
            email: user.email || "No Email",
            score: 0,
            challenge: "Login",
            time: new Date().toLocaleTimeString()
        };

        await fetch(GOOGLE_SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        console.log("User login tracked via Webhook.");

        // 2. Firebase Database Logging (For the Admin Dashboard)
        try {
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                lastLogin: new Date(),
                loginsToday: increment(1),
                totalLogins: increment(1),
                loginHistory: arrayUnion(new Date().toISOString())
            }, { merge: true }); 
            console.log("Explicit login tracked in Firestore.");
        } catch (dbError) {
            console.error("Failed to sync user to Database:", dbError);
        }

    } catch (error) {

        console.error("Login Failed", error);
        alert("Failed to log in with Google.");

    }

};


// LOGOUT
export const logout = async () => {

    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Failed", error);
    }

};


// Button listeners
if (loginBtn) {

    loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        loginWithGoogle();
    });

}

if (logoutBtn) {

    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
    });

}


// Helper function
export const getCurrentUser = () => {
    return auth.currentUser;
};


// Protect game links
document.addEventListener("DOMContentLoaded", () => {
    const gameLinks = document.querySelectorAll(".game-link");
    gameLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            if (!getCurrentUser()) {
                e.preventDefault();
                alert("Please log in to play the challenges!");
                loginWithGoogle();
            }
        });
    });
});
