import { ActivityLogger } from "./activity-logger.js";
import { collection, addDoc, doc, getDoc, setDoc, onAuthStateChanged, db, auth, increment, serverTimestamp, updateDoc, onSnapshot } from "./db-shim.js";
import { initRatingSystem } from "./rating-system.js";
import { GAME_CONFIG } from "./game-constants.js";
import { Logger } from "./logger.js";
import { getISOWeekString } from "./utils.js";

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

// Global roomId and role from URL
window.roomId = new URLSearchParams(window.location.search).get('roomId');
window.duelRole = new URLSearchParams(window.location.search).get('role');

// --- DUEL LOGIC ---
function initDuelMode() {
    console.log("Duel Mode Initialized:", window.roomId, window.duelRole);
    const vsBar = document.getElementById('duel-vs-bar');
    if (vsBar) {
        vsBar.classList.remove('hidden');
        vsBar.style.display = 'flex';
    }

    const roomRef = doc(db, "rooms", window.roomId);
    onSnapshot(roomRef, (snap) => {
        if (!snap.exists()) {
            alert("Room closed.");
            window.location.href = "duel.html";
            return;
        }
        const data = snap.data();
        
        // Update Names/Scores
        document.getElementById('p1-duel-name').innerText = data.hostName;
        document.getElementById('p1-duel-score').innerText = data.hostScore || 0;
        document.getElementById('p2-duel-name').innerText = (data.guestName || "Waiting...") + (data.status === 'ready' ? ' (READY)' : '');
        document.getElementById('p2-duel-score').innerText = data.guestScore || 0;
    });

    // Automatically start first module if in duel
    setTimeout(() => startModule(1), 1000);
}

async function updateDuelScore() {
    if (!window.roomId) return;
    const roomRef = doc(db, "rooms", window.roomId);
    const scoreField = window.duelRole === 'host' ? 'hostScore' : 'guestScore';
    try {
        await updateDoc(roomRef, { [scoreField]: score });
    } catch (e) {
        console.error("Duel score sync failed:", e);
    }
}
// initModuleGrid() will be called from loadUserProgress()

// --- Data Generation ---
// --- Data Generation ---
function generateRCResources() {
    const topics = [
        { 
            name: "Global Climate Policy", 
            facts: [
                "the current carbon tax is set at 5%", 
                "the net-zero target year is 2050", 
                "the initial budget for green projects is $2.5 billion", 
                "the share of renewable energy has reached 40%"
            ] 
        },
        { 
            name: "Advanced Robotics AI", 
            facts: [
                "the latest software version is 4.2", 
                "the external sensor range is 25 meters", 
                "the processor operates at a speed of 2GHz", 
                "the emergency battery lasts for 12 hours"
            ] 
        },
        { 
            name: "Urban Planning 2030", 
            facts: [
                "the minimum required green space is 30%", 
                "the city plans to build 500km of bike lanes", 
                "the inner city traffic speed is limited to 40kph", 
                "the total population capacity is capped at 2 million"
            ] 
        },
        { 
            name: "Maritime Logistics", 
            facts: [
                "the port capacity is 1.5 million TEU", 
                "the main dredging depth is 18 meters", 
                "the maximum vessel length is 400 meters", 
                "the standard wait time for docking is 48 hours"
            ] 
        },
        { 
            name: "Deep Sea Exploration", 
            facts: [
                "the water pressure reaches 1100 atmospheres", 
                "the maximum oxygen duration is 8 hours", 
                "the maximum recorded depth is 11 kilometers", 
                "over 450 new species have been identified"
            ] 
        },
        { 
            name: "Semiconductor Markets", 
            facts: [
                "the average manufacturing yield rate is 94%", 
                "the new chip size is 3nm", 
                "the total fabrication cost is $5.8 billion", 
                "the average production lead time is 16 weeks"
            ] 
        }
    ];

    return topics.map((t, idx) => {
        const p = `The ${t.name} report provides several key metrics for the upcoming fiscal cycle. It states that ${t.facts[0]}. Additionally, the document confirms that ${t.facts[1]}. Specialists also noted that ${t.facts[2]}, which serves as a baseline for future growth. Finally, the report indicates that ${t.facts[3]}.`;
        return { id: idx, title: t.name, text: p, facts: t.facts };
    });
}

function generateQuestionFromResources(docs, level) {
    // 3 questions per doc, 6 docs total = 18 questions
    const docIdx = Math.min(5, Math.floor((level - 1) / 3));
    const targetDoc = docs[docIdx];
    let questionText = "";
    let solution = "";
    const docNum = targetDoc.id + 1;

    const roll = Math.random();
    
    if (roll < 0.4) {
        const fIdx = Math.floor(Math.random() * 4);
        const fact = targetDoc.facts[fIdx];
        const isCorrect = Math.random() > 0.3;
        
        if (isCorrect) {
            questionText = `According to <strong>Document ${docNum}</strong>, is it true that ${fact}?`;
            solution = "Yes";
        } else {
            let falseFact = fact.replace(/\d+/, (m) => parseInt(m) + 10);
            questionText = `Does <strong>Document ${docNum}</strong> explicitly state that ${falseFact}?`;
            solution = "No";
        }
    } else if (roll < 0.7) {
        const f1 = targetDoc.facts[0];
        const f2 = targetDoc.facts[1];
        questionText = `Based on <strong>Document ${docNum}</strong>, does the text confirm both that ${f1} and that ${f2}?`;
        solution = "Yes";
    } else {
        const fact = targetDoc.facts[0];
        const valueMatch = fact.match(/[\d.]+/);
        if (valueMatch) {
            const val = parseFloat(valueMatch[0]);
            const doubledVal = val * 2;
            const isCorrect = Math.random() > 0.5;
            const displayVal = isCorrect ? doubledVal : doubledVal + 5;
            questionText = `If the value in <strong>Document ${docNum}</strong> regarding ${fact.split(' is ')[0]} doubled, would the new total be ${displayVal}${fact.includes('%') ? '%' : ''}?`;
            solution = isCorrect ? "Yes" : "No";
        } else {
            questionText = `Does <strong>Document ${docNum}</strong> verify that ${targetDoc.facts[0]}?`;
            solution = "Yes";
        }
    }

    return { questionText, solution };
}

// --- Rendering ---
function renderResourceTabs() {
    const elResourceTabs = document.getElementById('resource-tabs');
    elResourceTabs.innerHTML = '';
    currentDataResources.forEach((doc, index) => {
        const tabEl = document.createElement('div');
        tabEl.className = `res-tab ${activeDoc === index ? 'active' : ''}`;
        
        tabEl.innerHTML = `
            <i class="fas fa-file-alt"></i>
            <span class="res-tab-num">DOC ${index + 1}</span>
        `;
        tabEl.onclick = () => {
            activeDoc = index;
            renderResourceTabs();
            renderActiveDoc();
        };
        elResourceTabs.appendChild(tabEl);
    });
}

function renderActiveDoc() {
    const doc = currentData.docs[activeDoc];
    elDocViewer.innerText = doc.text;
}

// --- Game Flow ---
let currentDataResources = null;

window.startModule = (mod) => {
    currentModule = mod;
    currentLevel = 1;
    score = 0;
    correctAnswers = 0;
    timeLeft = MODULE_TIME_LIMIT;
    activeDoc = 0;
    
    // Check for Duel Mode
    if (window.roomId) {
        initDuelMode();
    }

    currentDataResources = generateRCResources();
    
    elModuleSelection.classList.add('hidden');
    elResultsModal.classList.add('hidden');
    elGameContainer.classList.remove('hidden');
    elGameHeader.classList.remove('hidden');
    elAnswerBar.style.display = 'flex';
    
    elModule.innerText = `${currentModule}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    elScore.innerText = score;
    
    renderResourceTabs();
    renderActiveDoc();
    nextLevel();
    if (!isMock) startTimer();
    else if (elTimer) elTimer.style.display = 'none';
};

function nextLevel() {
    if (currentLevel > LEVELS_PER_MODULE) {
        endGame();
        return;
    }
    
    // Auto sync active doc to the relevant one for the level (3 questions per doc)
    activeDoc = Math.min(5, Math.floor((currentLevel - 1) / 3));
    renderResourceTabs();
    renderDocView();

    const qData = generateQuestionFromResources(currentDataResources, currentLevel);
    currentSolution = qData.solution;
    elQuestion.innerHTML = qData.questionText;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;
    document.getElementById('level-indicator').innerText = `Q${currentLevel}`;
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
        updateDuelScore(); // Sync duel progress
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
            // DENORMALIZATION
            const userDocRef = doc(db, "users", user.uid);
            const updateField = `gameScores.${isMock ? 'mock_' : ''}rc`;
            await setDoc(userDocRef, {
                totalScore: increment(score),
                modulesCompleted: increment(1),
                [updateField]: increment(score),
                lastPlayed: new Date()
            }, { merge: true });

            // 3. WEEKLY LEADERBOARD (New)
            try {
                const weekId = getISOWeekString();
                const weeklyRef = doc(db, "weekly_leaderboards", weekId, "scores", user.uid);
                await setDoc(weeklyRef, {
                    name: user.displayName || "Guest Player",
                    score: increment(score),
                    timestamp: serverTimestamp()
                }, { merge: true });
            } catch (weeklyError) {
                console.warn("Weekly leaderboard save failed:", weeklyError);
            }

            // 4. COLLEGE LEADERBOARD (New)
            try {
                const userSnap = await getDoc(doc(db, "users", user.uid));
                if (userSnap.exists() && userSnap.data().college) {
                    const collegeName = userSnap.data().college;
                    const collegeId = collegeName.toLowerCase().trim().replace(/\s+/g, '_');
                    const collRef = doc(db, "colleges_leaderboard", collegeId);
                    await setDoc(collRef, {
                        displayName: collegeName,
                        totalScore: increment(score),
                        timestamp: serverTimestamp()
                    }, { merge: true });

                    // Also update college in the individual score entry
                    await setDoc(scoreRef, { college: collegeName }, { merge: true });
                }
            } catch (collError) {
                console.warn("College leaderboard update failed:", collError);
            }
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
