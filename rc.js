import { collection, addDoc, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";

// --- Constants & Config ---
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT, POINTS_PER_CORRECT } = GAME_CONFIG;

// --- State Variables ---
let highestUnlockedModule = 5;
let currentModule = 1;
let currentLevel = 1;
let score = 0;
let correctAnswers = 0;
let timeLeft = MODULE_TIME_LIMIT;
let timerInterval = null;
const isMock = new URLSearchParams(window.location.search).get('mode') === 'mock';
let currentData = null; 
let currentSolution = null; 
let activeDoc = 0;

const sounds = {
    correct: new Audio('assets/sounds/rc_correct.mp3'),
    wrong: new Audio('assets/sounds/rc_wrong.mp3')
};

// --- DOM Elements ---
const elTimer = document.getElementById('timer-display');
const elScore = document.getElementById('score-display');
const elLevel = document.getElementById('level-display');
const elModule = document.getElementById('module-display');
const elQuestion = document.getElementById('question-text');
const elCardContainer = document.getElementById('cards-grid'); 
const elDocViewer = document.getElementById('paragraph-viewer');
const elReadingView = document.getElementById('reading-view');
const elAnswerBar = document.getElementById('answer-bar');
const elModuleSelection = document.getElementById('module-selection');
const elResultsModal = document.getElementById('results-modal');
const elGameContainer = document.getElementById('game-container');
const elGameHeader = document.getElementById('game-header');
const elModuleGrid = document.getElementById('module-grid');

const elScoreText = document.getElementById('score-text');
const elFinalMarks = document.getElementById('final-marks-val');
const elAccuracyText = document.getElementById('accuracy-text');
const elNextModuleBtn = document.getElementById('next-module-btn');
const elBackToModulesBtn = document.getElementById('back-to-modules-btn');

// --- Initialization ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        loadUserProgress();
    }
});

// Fetch user progress
async function loadUserProgress() {
    const user = auth.currentUser;
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);
            if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.highestModule_rc) {
                    highestUnlockedModule = Math.max(5, data.highestModule_rc);
                }
            }
        } catch (e) { console.error(e); }
    }
    initModuleGrid();
}

function initModuleGrid() {
    const modules = [
        { id: 1, name: "Module 1", desc: "Explicit Information", color: "linear-gradient(135deg, #3b82f6, #60a5fa)" },
        { id: 2, name: "Module 2", desc: "Inference & Logic", color: "linear-gradient(135deg, #10b981, #34d399)" },
        { id: 3, name: "Module 3", desc: "Technical Synthesis", color: "linear-gradient(135deg, #f59e0b, #fbbf24)" },
        { id: 4, name: "Module 4", desc: "Abstract Concepts", color: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
        { id: 5, name: "Module 5", desc: "Strategic Reading", color: "linear-gradient(135deg, #ef4444, #f87171)" }
    ];

    elModuleGrid.innerHTML = '';
    modules.forEach(m => {
        const card = document.createElement('div');
        card.className = "card module-card";
        
        const isLocked = m.id > highestUnlockedModule;
        card.style.cursor = isLocked ? "not-allowed" : "pointer";
        card.style.opacity = isLocked ? "0.5" : "1";
        card.title = isLocked ? "Complete previous modules to unlock" : "Click to play";

        card.innerHTML = `
            <div class="card-img" style="height: 140px; background: ${m.color}; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 4rem; font-weight: 800; color: white; opacity: 0.9;">${m.id}</span>
            </div>
            <div class="card-content">
                <h3>${m.name}</h3>
                <p>${m.desc}</p>
            </div>
        `;
        if (!isLocked) {
            card.onclick = () => startModule(m.id);
        }
        elModuleGrid.appendChild(card);
    });
}
// initModuleGrid() will be called from loadUserProgress()

// --- Data Generation ---
function generateRCData() {
    const topics = [
        { name: "Global Climate Policy", facts: ["Carbon tax is 5%", "Target year is 2050", "Budget is $2B", "Renewables share 40%"] },
        { name: "Advanced Robotics AI", facts: ["Version 4.2 released", "Sensor range is 10m", "Processing speed 2GHz", "Battery life 12h"] },
        { name: "Urban Planning 2030", facts: ["Green space min 30%", "Bike lanes 500km", "Traffic limit 40kph", "Population cap 2M"] },
        { name: "Maritime Logistics", facts: ["Port capacity 1M TEU", "Dredging depth 15m", "Vessel limit 400m", "Wait time 48h"] },
        { name: "Deep Sea Exploration", facts: ["Pressure 1000 atm", "Oxygen duration 8h", "Max depth 11km", "Species found 450"] },
        { name: "Semiconductor Markets", facts: ["Yield rate 94%", "Nano-size 3nm", "Fabrication cost $5B", "Lead time 16 weeks"] }
    ];

    const docs = topics.map((t, idx) => {
        const p = `The current ${t.name} framework outlines several critical parameters. ${t.facts[0]}. Furthermore, the ${t.facts[1]} remains a key milestone. Additional reports suggest a ${t.facts[2]} is required for Phase 1. Finally, researchers noted that ${t.facts[3]} during the last audit.`;
        return { id: idx, title: t.name, text: p, facts: t.facts };
    });

    const targetDoc = docs[Math.floor(Math.random() * docs.length)];
    const targetFact = targetDoc.facts[Math.floor(Math.random() * targetDoc.facts.length)];
    
    let questionText = "";
    let solution = "";

    const roll = Math.random();
    if (roll < 0.5) {
        questionText = `Does the document "${targetDoc.title}" state that ${targetFact}?`;
        solution = "Yes";
    } else {
        const wrongDoc = docs.find(d => d.id !== targetDoc.id);
        questionText = `Does the document "${wrongDoc.title}" mention ${targetFact}?`;
        solution = "No";
    }

    return { docs, questionText, solution };
}

// --- Rendering ---
function renderDocCards() {
    elCardContainer.innerHTML = '';
    currentData.docs.forEach((doc, index) => {
        const card = document.createElement('div');
        card.className = 'data-card';
        card.innerHTML = `
            <i class="fas fa-file-alt card-icon"></i>
            <div class="card-label">DOCUMENT</div>
            <div class="card-title">${doc.title}</div>
        `;
        card.onclick = () => {
            activeDoc = index;
            toggleReadingView(true);
            renderActiveDoc();
        };
        elCardContainer.appendChild(card);
    });
}

function toggleReadingView(show) {
    if (show) {
        elCardContainer.style.display = 'none';
        elReadingView.style.display = 'flex';
        elAnswerBar.style.display = 'flex';
    } else {
        elCardContainer.style.display = 'grid';
        elReadingView.style.display = 'none';
        elAnswerBar.style.display = 'none';
    }
}
window.toggleReadingView = toggleReadingView;

function renderActiveDoc() {
    const doc = currentData.docs[activeDoc];
    elDocViewer.innerText = doc.text;
}

// --- Game Flow ---
window.startModule = (mod) => {
    currentModule = mod;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    timeLeft = MODULE_TIME_LIMIT;
    
    elModuleSelection.classList.add('hidden');
    elResultsModal.classList.add('hidden');
    elGameContainer.classList.remove('hidden');
    elGameHeader.classList.remove('hidden');
    
    elModule.innerText = `${currentModule} / 5`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elScore.innerText = score;
    
    nextLevel();
    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
};

function nextLevel() {
    if (currentLevel > LEVELS_PER_MODULE) {
        endGame();
        return;
    }
    toggleReadingView(false);
    currentData = generateRCData();
    currentSolution = currentData.solution;
    elQuestion.innerHTML = currentData.questionText;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    document.getElementById('level-indicator').innerText = `Q${currentLevel}`;
    renderDocCards();
}

window.handleAnswer = (ans) => {
    const buttons = document.querySelectorAll('.ans-btn');
    buttons.forEach(btn => btn.style.pointerEvents = 'none');
    
    // Find the clicked button
    const clickedBtn = Array.from(buttons).find(btn => {
        const btnText = btn.innerText.toLowerCase().replace(/['’]/g, "");
        const searchText = ans.toLowerCase().replace(/['’]/g, "");
        return btnText.includes(searchText);
    });

    if (ans === currentSolution) {
        score += POINTS_PER_CORRECT;
        correctAnswers++;
        sounds.correct.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('correct');
        showFeedbackPopup("CORRECT!", "+3 MARKS", "#22c55e");
    } else {
        sounds.wrong.play().catch(() => {});
        if (clickedBtn) clickedBtn.classList.add('incorrect');
        
        showFeedbackPopup(`WRONG!<br><span style="font-size: 0.9rem; opacity: 0.8; font-weight: 500;">Answer: ${currentSolution}</span>`, "", "#ef4444");

        setTimeout(() => {
            const correctBtn = Array.from(buttons).find(btn => {
                const btnText = btn.innerText.toLowerCase().replace(/['’]/g, "");
                const searchText = currentSolution.toLowerCase().replace(/['’]/g, "");
                return btnText.includes(searchText);
            });
            if (correctBtn) correctBtn.classList.add('correct');
        }, 500);
    }
    
    currentLevel++;
    setTimeout(() => {
        buttons.forEach(btn => {
            btn.classList.remove('correct', 'incorrect');
            btn.style.pointerEvents = 'auto';
        });
        nextLevel();
    }, 1500);
};

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeLeft--;
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        elTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft <= 0) endGame();
    }, 1000);
}

async function endGame() {
    clearInterval(timerInterval);
    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
        return;
    }
    const ratingContainer = document.getElementById('rating-section');
    if (ratingContainer) initRatingSystem(ratingContainer);
    
    elResultsModal.classList.remove('hidden');
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elFinalMarks.innerText = score;
    elAccuracyText.innerText = `${Math.round((correctAnswers / LEVELS_PER_MODULE) * 100)}%`;

    const user = auth.currentUser;
    if (user) {
        // 1. PRIORITIZE PROGRESSION
        try {
            const moduleReached = Math.min(TOTAL_MODULES, currentModule + 1);
            if (moduleReached > highestUnlockedModule) {
                highestUnlockedModule = moduleReached;
                await setDoc(doc(db, "users", user.uid), {
                    highestModule_rc: moduleReached
                }, { merge: true });
                console.log("RC progression saved.");
            }
        } catch (progError) {
            console.error("RC progression save failed:", progError);
        }

        // 2. ATTEMPT LEADERBOARD (Non-blocking)
        try {
            const scoreRef = doc(db, "leaderboards", "rc", "scores", user.uid);
            const scoreSnap = await getDoc(scoreRef);
            
            let existingModuleScores = {};
            if (scoreSnap.exists()) {
                const oldData = scoreSnap.data();
                if (oldData.moduleScores) {
                    existingModuleScores = oldData.moduleScores;
                } else if (typeof oldData.score === "number") {
                    existingModuleScores["1"] = oldData.score; // Migration
                }
            }

            if (existingModuleScores[currentModule] === undefined || score > existingModuleScores[currentModule]) {
                existingModuleScores[currentModule] = score;
            }

            let totalScore = 0;
            let totalPossible = 0;
            for (const mod in existingModuleScores) {
                totalScore += existingModuleScores[mod];
                totalPossible += LEVELS_PER_MODULE; 
            }

            await setDoc(scoreRef, {
                name: user.displayName || "Guest Player",
                score: totalScore,
                totalLevels: totalPossible,
                moduleScores: existingModuleScores,
                metrics: { correctAnswers, timeSpent: MODULE_TIME_LIMIT - timeLeft },
                timestamp: new Date()
            }, { merge: true });
            console.log("RC leaderboard updated.");
        } catch (lbError) {
            console.warn("RC leaderboard save failed (Permissions?):", lbError);
        }
    }

    elNextModuleBtn.onclick = () => {
        if (currentModule < 5) startModule(currentModule + 1);
        else window.location.href = 'index.html';
    };

    if (isMock) {
        window.parent.postMessage({ type: 'MODULE_COMPLETE', score: score }, '*');
    }
}

if (elBackToModulesBtn) {
    elBackToModulesBtn.onclick = (e) => {
        e.preventDefault();
        clearInterval(timerInterval);
        elGameContainer.classList.add('hidden');
        elGameHeader.classList.add('hidden');
        elModuleSelection.classList.remove('hidden');
    };
}

function showFeedbackPopup(status, points, color) {
    const popup = document.getElementById('feedback-popup');
    const statusEl = document.getElementById('feedback-status');
    const pointsEl = document.getElementById('feedback-points');
    statusEl.innerText = status;
    statusEl.style.color = color;
    pointsEl.innerText = points;
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('hidden'), 1000);
}
