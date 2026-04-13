/**
 * duel.js
 * Real-time Duel Lobby Logic for AptiVerse.
 */
import { 
    db, auth, collection, doc, setDoc, getDoc, updateDoc, 
    onSnapshot, serverTimestamp, deleteDoc 
} from "./db-shim.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

// -- DOM Elements --
const lobbyGrid = document.getElementById('lobby-grid');
const activeRoom = document.getElementById('active-room');
const displayCode = document.getElementById('display-code');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const startDuelBtn = document.getElementById('start-duel-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const p1Name = document.getElementById('p1-name');
const p1Avatar = document.getElementById('p1-avatar');
const p2Name = document.getElementById('p2-name');
const p2Avatar = document.getElementById('p2-avatar');
const p2Status = document.getElementById('p2-status');

const gameOpts = document.querySelectorAll('.game-opt');

// -- Local State --
let currentRoomId = null;
let currentUnsubscribe = null;
let selectedGame = 'motion';
let currentUser = null;

// -- Initialization --
onAuthStateChanged(auth, (user) => {
    if (!user) {
        alert("Please login to enter the Battle Arena.");
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    document.getElementById('nav-user-name').innerText = user.displayName || "Warrior";
    document.getElementById('nav-user-avatar').innerText = (user.displayName || "W").charAt(0).toUpperCase();
});

// -- Game Selection --
gameOpts.forEach(opt => {
    opt.onclick = () => {
        gameOpts.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        selectedGame = opt.dataset.game;
    };
});

// -- Room Logic --
async function createRoom() {
    const roomId = Math.floor(100000 + Math.random() * 900000).toString();
    const roomRef = doc(db, "rooms", roomId);

    const roomData = {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || "Host",
        guestId: null,
        guestName: null,
        gameType: selectedGame,
        status: "waiting", // waiting, playing, complete
        createdAt: serverTimestamp()
    };

    try {
        await setDoc(roomRef, roomData);
        currentRoomId = roomId;
        enterRoomView(roomId, true);
        listenToRoom(roomId);
    } catch (err) {
        console.error("Failed to create room:", err);
        alert("Failed to create room. Try again.");
    }
}

async function joinRoom() {
    const roomId = roomCodeInput.value.trim();
    if (roomId.length !== 6) {
        alert("Enter a valid 6-digit code.");
        return;
    }

    const roomRef = doc(db, "rooms", roomId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
        alert("Room not found.");
        return;
    }

    const data = snap.data();
    if (data.guestId && data.guestId !== currentUser.uid) {
        alert("Room is full.");
        return;
    }

    if (data.hostId === currentUser.uid) {
        // Re-joining as host
        currentRoomId = roomId;
        enterRoomView(roomId, true);
        listenToRoom(roomId);
        return;
    }

    try {
        await updateDoc(roomRef, {
            guestId: currentUser.uid,
            guestName: currentUser.displayName || "Challenger",
            status: "ready"
        });
        currentRoomId = roomId;
        enterRoomView(roomId, false);
        listenToRoom(roomId);
    } catch (err) {
        console.error("Join error:", err);
    }
}

function enterRoomView(code, isHost) {
    lobbyGrid.style.display = "none";
    activeRoom.style.display = "flex";
    displayCode.innerText = code;
}

function listenToRoom(roomId) {
    if (currentUnsubscribe) currentUnsubscribe();

    currentUnsubscribe = onSnapshot(doc(db, "rooms", roomId), (snap) => {
        if (!snap.exists()) {
            alert("Room has been closed by the host.");
            exitRoom();
            return;
        }

        const data = snap.data();
        
        // Update P1 (Host)
        p1Name.innerText = data.hostName;
        p1Avatar.innerText = data.hostName.charAt(0).toUpperCase();

        // Update P2 (Guest)
        if (data.guestId) {
            p2Name.innerText = data.guestName;
            p2Avatar.innerText = data.guestName.charAt(0).toUpperCase();
            p2Avatar.style.opacity = "1";
            p2Status.innerText = "READY TO DUEL";
            p2Status.className = "badge-pill badge-purple";
            
            if (data.hostId === currentUser.uid) {
                startDuelBtn.disabled = false;
                startDuelBtn.innerText = "START DUEL";
            } else {
                startDuelBtn.innerText = "Waiting for Host...";
            }
        } else {
            p2Name.innerText = "Searching...";
            p2Avatar.style.opacity = "0.3";
            p2Avatar.innerHTML = '<i class="fas fa-user-plus"></i>';
            p2Status.innerText = "Invite a friend";
            p2Status.className = "waiting-text";
            startDuelBtn.disabled = true;
            startDuelBtn.innerText = "Waiting for Opponent...";
        }

        // Check if game started
        if (data.status === "playing") {
            const gameUrl = `${data.gameType}.html?roomId=${roomId}&role=${data.hostId === currentUser.uid ? 'host' : 'guest'}`;
            window.location.href = gameUrl;
        }
    });
}

function exitRoom() {
    if (currentUnsubscribe) currentUnsubscribe();
    lobbyGrid.style.display = "grid";
    activeRoom.style.display = "none";
    currentRoomId = null;
}

async function startDuel() {
    if (!currentRoomId) return;
    const roomRef = doc(db, "rooms", currentRoomId);
    await updateDoc(roomRef, { status: "playing" });
}

async function leaveRoom() {
    if (!currentRoomId) return;
    
    // If host leaves, delete room
    const roomRef = doc(db, "rooms", currentRoomId);
    const snap = await getDoc(roomRef);
    if (snap.exists() && snap.data().hostId === currentUser.uid) {
        await deleteDoc(roomRef);
    } else {
        // Just remove guest
        await updateDoc(roomRef, { guestId: null, guestName: null, status: "waiting" });
    }
    exitRoom();
}

// -- Event Listeners --
createRoomBtn.onclick = createRoom;
joinRoomBtn.onclick = joinRoom;
startDuelBtn.onclick = startDuel;
leaveRoomBtn.onclick = leaveRoom;
