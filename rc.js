import { ActivityLogger } from "./activity-logger.js";
import { collection, addDoc, doc, setDoc, getDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { initRatingSystem } from "./rating-system.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";

// --- Constants & Config ---
const { TOTAL_MODULES, LEVELS_PER_MODULE, MODULE_TIME_LIMIT, POINTS_PER_CORRECT } = GAME_CONFIG;

// --- State Variables ---
let highestUnlockedModule = 10;
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
                highestUnlockedModule = 10; // Forced unlock
            }
        } catch (e) {
            console.error("Error loading progress:", e);
        }
    }
    
    if (isMock) {
        startModule(1);
        const elModuleSelection = document.getElementById('module-selection');
        const elGameContainer = document.getElementById('game-container');
        if (elModuleSelection) elModuleSelection.style.display = 'none';
        if (elGameContainer) elGameContainer.classList.remove('hidden');
    } else {
        initModuleGrid();
    }
}

function initModuleGrid() {
    const modules = [
        { id: 1, name: "Module 1", desc: "Explicit Information", color: "linear-gradient(135deg, #3b82f6, #60a5fa)" },
        { id: 2, name: "Module 2", desc: "Inference & Logic", color: "linear-gradient(135deg, #10b981, #34d399)" },
        { id: 3, name: "Module 3", desc: "Technical Synthesis", color: "linear-gradient(135deg, #f59e0b, #fbbf24)" },
        { id: 4, name: "Module 4", desc: "Abstract Concepts", color: "linear-gradient(135deg, #8b5cf6, #a78bfa)" },
        { id: 5, name: "Module 5", desc: "Strategic Reading", color: "linear-gradient(135deg, #ef4444, #f87171)" },
        { id: 6, name: "Module 6", desc: "Advanced Analysis", color: "linear-gradient(135deg, #c90076, #ff4b2b)" },
        { id: 7, name: "Module 7", desc: "Complex Synthesis", color: "linear-gradient(135deg, #2563eb, #3b82f6)" },
        { id: 8, name: "Module 8", desc: "Hyper-Deductive RC", color: "linear-gradient(135deg, #059669, #10b981)" },
        { id: 9, name: "Module 9", desc: "Patterns in Prose", color: "linear-gradient(135deg, #d97706, #f59e0b)" },
        { id: 10, name: "Module 10", desc: "Legendary Comprehension", color: "linear-gradient(135deg, #4f46e5, #6366f1)" }
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
// --- Data Generation ---
function generateRCData() {
    const topics = [
        { name: "Global Climate Policy", facts: ["Carbon tax is 5%", "Target year is 2050", "Initial Budget is $2.5B", "Current Renewables share 40%"] },
        { name: "Advanced Robotics AI", facts: ["Version 4.2 released", "Sensor range is 25m", "Standard Processing speed 2GHz", "Emergency Battery life 12h"] },
        { name: "Urban Planning 2030", facts: ["Green space min 30%", "Planned Bike lanes 500km", "City Traffic limit 40kph", "Projected Population cap 2M"] },
        { name: "Maritime Logistics", facts: ["Port capacity 1.5M TEU", "Dredging depth 18m", "Vessel length limit 400m", "Standard Wait time 48h"] },
        { name: "Deep Sea Exploration", facts: ["Pressure 1100 atm", "Max Oxygen duration 8h", "Max recorded depth 11km", "New Species found 450"] },
        { name: "Semiconductor Markets", facts: ["Average Yield rate 94%", "Nano-size 3nm", "Fabrication cost $5.8B", "Production Lead time 16 weeks"] }
    ];

    const docs = topics.map((t, idx) => {
        const p = `The latest ${t.name} analysis report highlights several critical targets. Regarding benchmarks, it notes that ${t.facts[0]}. Furthermore, the ${t.facts[1]} remains a primary objective for the next decade. Internal auditors suggested that ${t.facts[2]} is the baseline for current operations. Finally, field reports confirmed that ${t.facts[3]} was achieved during the most recent trial phase.`;
        return { id: idx, title: t.name, text: p, facts: t.facts };
    });

    const targetDoc = docs[Math.floor(Math.random() * docs.length)];
    let questionText = "";
    let solution = "";

    const roll = Math.random();
    
    if (roll < 0.33) {
        // Multi-fact check
        const f0 = targetDoc.facts[0];
        const f1 = targetDoc.facts[1];
        questionText = `Based on the technical reports, does the relevant framework confirm both that ${f0} and that the ${f1}?`;
        solution = "Yes";
    } else if (roll < 0.66) {
        // Comparison logic
        const otherDoc = docs[(targetDoc.id + 1) % docs.length];
        const myValue = parseFloat(targetDoc.facts[0].match(/\d+/)[0]);
        const otherValue = parseFloat(otherDoc.facts[0].match(/\d+/)[0]);
        
        const isHigher = myValue > otherValue;
        const isCorrect = Math.random() > 0.5;
        const targetResult = isCorrect ? (isHigher ? "higher" : "lower") : (isHigher ? "lower" : "higher");
        
        questionText = `Comparing different datasets, is the primary benchmark value in the document mentioning "${targetDoc.facts[1]}" ${targetResult} than the value in the document mentioning "${otherDoc.facts[1]}"?`;
        solution = isCorrect ? "Yes" : "No";
    } else {
        // Logical deduction (e.g., doubling a value)
        const fact = targetDoc.facts[2]; // e.g., "Initial Budget is $2.5B"
        const valueMatch = fact.match(/[\d.]+/);
        if (valueMatch) {
            const val = parseFloat(valueMatch[0]);
            const doubledVal = val * 2;
            const isCorrect = Math.random() > 0.5;
            const displayVal = isCorrect ? doubledVal : doubledVal + 5;
            
            questionText = `If the project requirements for the initiative related to ${targetDoc.facts[3]} were to double the current baseline of ${val}, would the total requirement reach ${displayVal}?`;
            solution = isCorrect ? "Yes" : "No";
        } else {
            // Fallback to simple fact check if no numbers found
            questionText = `Does any analytical report explicitly verify that ${targetDoc.facts[0]}?`;
            solution = "Yes";
        }
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
        if (timeLeft <= 0) {
            timeLeft = 0;
            clearInterval(timerInterval);
            endGame();
            updateTimerDisplay();
            return;
        }
        timeLeft--;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const displayTime = Math.max(0, timeLeft);
    const mins = Math.floor(displayTime / 60);
    const secs = displayTime % 60;
    elTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function endGame() {
    clearInterval(timerInterval);
    ActivityLogger.log('solve', 'rc');
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

    // Add LinkedIn Share Button
    let linkedinBtn = document.getElementById('linkedin-share-btn');
    if (!linkedinBtn) {
        linkedinBtn = document.createElement('button');
        linkedinBtn.id = 'linkedin-share-btn';
        linkedinBtn.className = 'btn btn-outline';
        linkedinBtn.style.marginTop = '0.5rem';
        linkedinBtn.style.width = '100%';
        linkedinBtn.innerHTML = '<i class="fab fa-linkedin"></i> Share on LinkedIn';
        linkedinBtn.onclick = () => {
            const text = `I just completed RC Challenge Module ${currentModule} on AptiVerse with ${correctAnswers}/${LEVELS_PER_MODULE} correct! 🚀 #AptitudeReasoning #AptiVerse`;
            const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`;
            window.open(url, '_blank', 'width=600,height=400');
        };
        elResultsModal.querySelector('.modal-content').appendChild(linkedinBtn);
    }

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
        if (currentModule < TOTAL_MODULES) startModule(currentModule + 1);
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
