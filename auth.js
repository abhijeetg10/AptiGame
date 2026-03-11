import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { auth, provider } from "./firebase-config.js";

// DOM Elements expected to be in the Navbar
const loginBtn = document.getElementById("nav-login-btn");
const userProfile = document.getElementById("nav-user-profile");
const userAvatar = document.getElementById("nav-user-avatar");
const userName = document.getElementById("nav-user-name");
const logoutBtn = document.getElementById("nav-logout-btn");

// Handle Auth State Changes (Fires on load and every login/logout)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in.
        if (loginBtn) loginBtn.style.display = "none";
        if (userProfile) {
            userProfile.style.display = "flex";
            userName.innerText = user.displayName.split(" ")[0]; // Just first name
            
            // Generate initials for avatar placeholder, or use photoURL if you prefer
            const initial = user.displayName ? user.displayName.charAt(0).toUpperCase() : "U";
            userAvatar.innerText = initial;
            
            // Optional: If you want to use their actual Google Photo
            // if(user.photoURL) {
            //    userAvatar.innerHTML = `<img src="${user.photoURL}" style="width:100%;height:100%;border-radius:50%;" />`;
            //    userAvatar.style.background = "transparent";
            // }
        }
    } else {
        // No user is signed in.
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (userProfile) userProfile.style.display = "none";
    }
});

// NOTE: Replace this with the URL you get after deploying your Google Apps Script
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx9ZicbMGUyZstVQuzOb-bW6qLRMkaGWyJlb2hMgD8GYbftelV1O2qaLO1UR89ZqQKLUQ/exec";

// Login Function
export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Log to Google Sheet
        if (GOOGLE_SCRIPT_URL !== "https://script.google.com/macros/s/AKfycbx9ZicbMGUyZstVQuzOb-bW6qLRMkaGWyJlb2hMgD8GYbftelV1O2qaLO1UR89ZqQKLUQ/exec") {
            try {
                // We use no-cors because Google Scripts block preflight cors requests from browsers
                await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: user.displayName || "Unknown User",
                        email: user.email || "No Email"
                    })
                });
                console.log("Login data sent to Google Sheet.");
            } catch (sheetError) {
                console.error("Failed to sync login to Google Sheet:", sheetError);
            }
        }

    } catch (error) {
        console.error("Login Failed", error);
        alert("Failed to log in with Google.");
    }
};

// Logout Function
export const logout = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Failed", error);
    }
};

// Attach Listeners if the buttons exist on the page
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

// Helper getter that other scripts (like games) can use to check who is playing
export const getCurrentUser = () => {
    return auth.currentUser;
};

// Protect Game Links on Homepage
document.addEventListener("DOMContentLoaded", () => {
    const gameLinks = document.querySelectorAll(".game-link");
    gameLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            if (!getCurrentUser()) {
                e.preventDefault(); // Stop them from going to the game page
                alert("Please log in to play the challenges!");
                loginWithGoogle();
            }
        });
    });
});
