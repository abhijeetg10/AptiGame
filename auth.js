import { signInWithPopup, signOut, onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

import { auth, provider } from "./firebase-config.js";

const loginBtn = document.getElementById("nav-login-btn");
const userProfile = document.getElementById("nav-user-profile");
const userAvatar = document.getElementById("nav-user-avatar");
const userName = document.getElementById("nav-user-name");
const logoutBtn = document.getElementById("nav-logout-btn");

// NEW GOOGLE SCRIPT URL
const GOOGLE_SCRIPT_URL =
"https://script.google.com/macros/s/AKfycbwz5YPrzW7dxg3qnF6toMVIBahoWWoUk6mKeZtaZ-vfoh49NAdbLiyfQAXIDVuZ7ggVKQ/exec";


// Detect login state
onAuthStateChanged(auth, (user) => {

    if (user) {

        if (loginBtn) loginBtn.style.display = "none";

        if (userProfile) {

            userProfile.style.display = "flex";

            const firstName = user.displayName
                ? user.displayName.split(" ")[0]
                : "User";

            userName.innerText = firstName;

            const initial = firstName.charAt(0).toUpperCase();
            userAvatar.innerText = initial;

        }

    } else {

        if (loginBtn) loginBtn.style.display = "inline-block";
        if (userProfile) userProfile.style.display = "none";

    }

});


// LOGIN FUNCTION
export const loginWithGoogle = async () => {

    try {

        const result = await signInWithPopup(auth, provider);
        const user = result.user;

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

        console.log("User login stored in Google Sheet");

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
