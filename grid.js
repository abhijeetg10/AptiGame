import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { db, auth } from "./firebase-config.js";
import { getCurrentUser } from "./auth.js";

// --- Auth Guard ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        alert("Authentication required. Redirecting to home page...");
        window.location.href = "index.html";
    }
});

// --- Configuration ---
const TOTAL_MODULES = 5;
const LEVELS_PER_MODULE = 18; // 18 levels per module
const INITIAL_TIME = 8 * 60; // 8 minutes

// --- State ---
let currentModule = 1;
let currentLevel = 1;
let correctAnswers = 0;
let wrongAnswers = 0;
let timeRemaining = INITIAL_TIME;
let timerInterval;
let moduleScores = [];

// Memory Engine State
let numDots = 12; // Static number of dots on screen
let sequenceLength = 3;
let currentSequence = []; // Array of dot indices [2, 7, 4...]
let userRecallSequence = []; // What the user clicks during recall
let currentSequenceStep = 0; // Where we are in the sequence loop

let dotsArray = []; // DOM elements

// Phases: INACTIVE, SHOW_DOT, QUESTION, RECALL
let currentPhase = "INACTIVE";

// --- DOM Elements ---
const elModuleSelection = document.getElementById("module-selection");
const elGameHeader = document.getElementById("game-header");
const elGameContainer = document.getElementById("game-container");
const moduleBtns = document.querySelectorAll(".module-card");
const elBackToModulesBtn = document.getElementById("back-to-modules-btn");

const elModule = document.getElementById("module-display");
const elLevel = document.getElementById("level-display");
const elTimer = document.getElementById("timer-display");

const elDotContainer = document.getElementById("dot-matrix-container");
const elDistractionUI = document.getElementById("distraction-question-container");
const elPromptText = document.getElementById("grid-prompt-text");
const elDistractionPrompt = document.getElementById("distraction-prompt");
const elVisuals = document.getElementById("distraction-visuals");
const btnTrue = document.getElementById("btn-true");
const btnFalse = document.getElementById("btn-false");

const elModal = document.getElementById("results-modal");
const elModalTitle = document.getElementById("modal-title");
const elScoreText = document.getElementById("score-text");
const elCorrectCount = document.getElementById("correct-count");
const elWrongCount = document.getElementById("wrong-count");
const elNextBtn = document.getElementById("next-module-btn");

let currentQuestionAnswer = true;

// --- Initialization & Event Listeners ---
moduleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        let selectedModule = parseInt(btn.getAttribute("data-module"));
        startModule(selectedModule);
    });
});

if (elBackToModulesBtn) {
    elBackToModulesBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showModuleSelection();
    });
}

btnTrue.addEventListener("click", () => answerQuestion(true));
btnFalse.addEventListener("click", () => answerQuestion(false));

function startModule(modNum) {
    currentModule = modNum;
    currentLevel = 1;
    correctAnswers = 0;
    wrongAnswers = 0;
    moduleScores = [];
    timeRemaining = INITIAL_TIME;

    elModuleSelection.classList.add("hidden");
    elGameHeader.classList.remove("hidden");
    elGameContainer.classList.remove("hidden");

    startTimer();
    loadLevel();
}

function showModuleSelection() {
    clearInterval(timerInterval);
    elModuleSelection.classList.remove("hidden");
    elGameHeader.classList.add("hidden");
    elGameContainer.classList.add("hidden");
}

// --- Dynamic Positioning Engine ---
function generateDotMatrix() {
    elDotContainer.innerHTML = "";
    dotsArray = [];

    // Create random, non-overlapping positions for dots
    let positions = [];
    let padding = 10; // % from edges
    let minDistance = 15; // % distance between dots

    for (let i = 0; i < numDots; i++) {
        let maxAttempts = 50;
        let valid = false;
        let x, y;

        while (!valid && maxAttempts > 0) {
            x = padding + Math.random() * (100 - padding * 2);
            y = padding + Math.random() * (100 - padding * 2);
            valid = true;

            for (let j = 0; j < positions.length; j++) {
                let dx = positions[j].x - x;
                let dy = positions[j].y - y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDistance) {
                    valid = false;
                    break;
                }
            }
            maxAttempts--;
        }

        positions.push({ x, y });

        let dot = document.createElement("div");
        dot.className = "matrix-dot";
        dot.style.left = `${x}%`;
        dot.style.top = `${y}%`;
        dot.dataset.index = i;

        dot.addEventListener("click", () => handleDotClick(i, dot));

        elDotContainer.appendChild(dot);
        dotsArray.push(dot);
    }
}

// --- Challenge Generator Engine ---
function calculateDifficulty() {
    // Number of dots starts at 12 to ensure enough screen space for 10 sequences
    numDots = 11 + currentModule;

    // Sequence length linearly scales from 2 at level 1 to 10 at level 18
    // We add a slight bump for higher modules
    let baseSeq = 2 + (currentModule - 1);
    sequenceLength = baseSeq + Math.round((currentLevel - 1) * (8 / 17));
    sequenceLength = Math.min(sequenceLength, 12); // cap at 12 for sanity
}

function loadLevel() {
    elModule.innerText = `${currentModule} / ${TOTAL_MODULES}`;
    elLevel.innerText = `${currentLevel} / ${LEVELS_PER_MODULE}`;

    calculateDifficulty();
    generateDotMatrix();

    // Generate Target Sequence
    currentSequence = [];
    for (let i = 0; i < sequenceLength; i++) {
        // Allow same dot to be clicked multiple times, but not consecutively
        let lastDot = currentSequence.length > 0 ? currentSequence[currentSequence.length - 1] : -1;
        let randomDot;
        do {
            randomDot = Math.floor(Math.random() * numDots);
        } while (randomDot === lastDot);
        currentSequence.push(randomDot);
    }

    userRecallSequence = [];
    currentSequenceStep = 0;

    // Start Sequence Loop
    switchPhase("SHOW_DOT");
}

function switchPhase(phase) {
    currentPhase = phase;

    if (phase === "SHOW_DOT") {
        elDistractionUI.style.display = "none";
        elDotContainer.style.display = "block";
        elPromptText.innerText = `Watch carefully... (Step ${currentSequenceStep + 1} of ${sequenceLength})`;

        // Highlight the n-th dot in the sequence
        let targetDotIdx = currentSequence[currentSequenceStep];
        let targetDot = dotsArray[targetDotIdx];

        // Ensure all are white
        dotsArray.forEach(d => d.classList.remove("active", "selected"));

        setTimeout(() => {
            targetDot.classList.add("active");

            // Wait 1.5 seconds, then hide and show question
            setTimeout(() => {
                targetDot.classList.remove("active");
                if (!elGameContainer.classList.contains("hidden")) {
                    switchPhase("QUESTION");
                }
            }, 1500);
        }, 500); // 0.5s pause before flash

    } else if (phase === "QUESTION") {
        elDotContainer.style.display = "none";
        elDistractionUI.style.display = "flex";
        elPromptText.innerText = "Answer the distraction question!";
        generateQuestion();

    } else if (phase === "RECALL") {
        elDistractionUI.style.display = "none";
        elDotContainer.style.display = "block";
        elPromptText.innerText = "Recall Phase! Click the dots in the exact order they appeared.";
        dotsArray.forEach(d => {
            d.classList.remove("active");
            d.style.cursor = "pointer";
        });
    }
}

// Helper to create a shape
function createShape(type, color, rotation = 0) {
    let div = document.createElement("div");
    // basic styling
    div.style.width = "60px";
    div.style.height = "60px";
    div.style.backgroundColor = color;
    div.style.transform = `rotate(${rotation}deg)`;

    // Some basic geometries
    if (type === "circle") {
        div.style.borderRadius = "50%";
    } else if (type === "square") {
        div.style.borderRadius = "0";
    } else if (type === "triangle") {
        div.style.width = "0";
        div.style.height = "0";
        div.style.backgroundColor = "transparent";
        div.style.borderLeft = "30px solid transparent";
        div.style.borderRight = "30px solid transparent";
        div.style.borderBottom = `60px solid ${color}`;
    } else if (type === "diamond") {
        div.style.transform = `rotate(${rotation + 45}deg)`;
    }
    return div;
}

function generateQuestion() {
    let type = Math.floor(Math.random() * 2); // 0: Match?, 1: Symmetrical?
    let isTrue = Math.random() > 0.5;
    currentQuestionAnswer = isTrue;

    elVisuals.innerHTML = ""; // clear previous

    const shapes = ["circle", "square", "triangle", "diamond"];
    const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"];

    if (type === 0) {
        // Match Question: Are these figures exactly the same?
        elDistractionPrompt.innerText = "Are these figures exactly the same?";

        let shape1 = shapes[Math.floor(Math.random() * shapes.length)];
        let color1 = colors[Math.floor(Math.random() * colors.length)];
        let rot1 = Math.floor(Math.random() * 4) * 90; // 0, 90, 180, 270

        let shape2 = shape1;
        let color2 = color1;
        let rot2 = rot1;

        if (!isTrue) {
            // make them different
            let diffType = Math.floor(Math.random() * 3);
            if (diffType === 0) {
                // different shape
                do { shape2 = shapes[Math.floor(Math.random() * shapes.length)]; } while (shape1 === shape2);
            } else if (diffType === 1) {
                // different color
                do { color2 = colors[Math.floor(Math.random() * colors.length)]; } while (color1 === color2);
            } else {
                // different rotation
                if (shape1 === "triangle") {
                    rot2 = rot1 + 180;
                } else if (shape1 === "diamond") {
                    do { shape2 = shapes[Math.floor(Math.random() * shapes.length)]; } while (shape1 === shape2);
                } else {
                    do { color2 = colors[Math.floor(Math.random() * colors.length)]; } while (color1 === color2);
                }
            }
        }

        let el1 = createShape(shape1, color1, rot1);
        let el2 = createShape(shape2, color2, rot2);

        elVisuals.appendChild(el1);
        elVisuals.appendChild(el2);

    } else {
        // Symmetrical Question: Is this figure horizontally symmetrical?
        elDistractionPrompt.innerText = "Is this figure symmetrical?";

        let color = colors[Math.floor(Math.random() * colors.length)];

        let grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "30px 30px";
        grid.style.gridTemplateRows = "30px 30px";
        grid.style.gap = "2px";

        let cells = [0, 0, 0, 0];
        if (isTrue) {
            let symType = Math.floor(Math.random() * 3);
            if (symType === 0) { cells = [1, 1, 0, 0]; }
            else if (symType === 1) { cells = [1, 0, 1, 0]; }
            else if (symType === 2) { cells = [1, 1, 1, 1]; }
        } else {
            let asymType = Math.floor(Math.random() * 3);
            if (asymType === 0) { cells = [1, 0, 0, 0]; }
            else if (asymType === 1) { cells = [1, 1, 1, 0]; }
            else if (asymType === 2) { cells = [0, 1, 1, 0]; }
        }

        for (let i = 0; i < 4; i++) {
            let chunk = document.createElement("div");
            chunk.style.backgroundColor = cells[i] ? color : "transparent";
            grid.appendChild(chunk);
        }

        elVisuals.appendChild(grid);
    }
}

function answerQuestion(userAns) {
    if (currentPhase !== "QUESTION") return;

    if (userAns !== currentQuestionAnswer) {
        // Penalty for distraction task? Usually working memory tasks just dock you overall.
        // Let's dock a wrong answer stat immediately to force them to care.
        wrongAnswers++;
        elDistractionPrompt.innerText = "Incorrect!";
        elDistractionPrompt.style.color = "var(--error)";
    } else {
        elDistractionPrompt.innerText = "Correct!";
        elDistractionPrompt.style.color = "var(--success)";
    }

    setTimeout(() => {
        elDistractionPrompt.style.color = "var(--text-dark)";
        currentSequenceStep++;

        if (currentSequenceStep < sequenceLength) {
            switchPhase("SHOW_DOT");
        } else {
            switchPhase("RECALL");
        }
    }, 800);
}

function handleDotClick(index, dotEl) {
    if (currentPhase !== "RECALL") return;

    // User cannot click same dot recursively, must be sequence
    userRecallSequence.push(index);

    // Visually mark it briefly so they know they clicked it
    dotEl.classList.add("selected");
    setTimeout(() => dotEl.classList.remove("selected"), 300);

    elPromptText.innerText = `Recalled ${userRecallSequence.length} of ${sequenceLength} dots...`;

    if (userRecallSequence.length === sequenceLength) {
        checkFinalAnswer();
    }
}

function checkFinalAnswer() {
    currentPhase = "INACTIVE";
    let isCorrect = true;
    for (let i = 0; i < sequenceLength; i++) {
        if (userRecallSequence[i] !== currentSequence[i]) {
            isCorrect = false;
            break;
        }
    }

    if (isCorrect) {
        elPromptText.innerText = "Sequence Completely Correct!";
        elPromptText.style.color = "var(--success)";
        correctAnswers++;
        setTimeout(() => {
            elPromptText.style.color = "inherit";
            advanceLevel();
        }, 1500);
    } else {
        elPromptText.innerText = "Sequence Mismatch!";
        elPromptText.style.color = "var(--error)";
        wrongAnswers++;

        // Flash correct sequence
        revealCorrectSequence(0, () => {
            elPromptText.style.color = "inherit";
            advanceLevel();
        });
    }
}

function revealCorrectSequence(step, callback) {
    if (step >= sequenceLength) {
        setTimeout(callback, 1000);
        return;
    }

    let dotIdx = currentSequence[step];
    let targetDot = dotsArray[dotIdx];

    targetDot.style.backgroundColor = "var(--error)";
    targetDot.style.transform = "scale(1.2)";
    targetDot.style.boxShadow = "rgba(239, 68, 68, 0.4) 0px 0px 15px";

    setTimeout(() => {
        targetDot.style.backgroundColor = "#fff";
        targetDot.style.transform = "none";
        targetDot.style.boxShadow = "none";
        revealCorrectSequence(step + 1, callback);
    }, 600);
}

function advanceLevel() {
    if (currentLevel < LEVELS_PER_MODULE) {
        currentLevel++;
        loadLevel();
    } else {
        endModule();
    }
}

// --- Timer ---
function startTimer() {
    clearInterval(timerInterval);
    updateTimerDisplay();

    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            endModule("Time's Up!");
        }
    }, 1000);
}

function updateTimerDisplay() {
    let m = Math.floor(timeRemaining / 60);
    let s = timeRemaining % 60;
    elTimer.innerText = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (timeRemaining < 60) {
        elTimer.classList.add("text-error");
    } else {
        elTimer.classList.remove("text-error");
    }
}

async function saveScoreToFirebase(btnElement, redirectCallback) {
    if (moduleScores.length === 0) {
        if (redirectCallback) redirectCallback();
        return;
    }

    if (btnElement) {
        btnElement.innerText = "Saving Score...";
        btnElement.disabled = true;
    }

    try {
        const activeUser = getCurrentUser();
        const playerName = activeUser && activeUser.displayName ? activeUser.displayName : "Guest Player";

        const averageScore = Math.round(moduleScores.reduce((a, b) => a + b, 0) / moduleScores.length);

        const scoreData = {
            name: playerName,
            score: averageScore, // Now stores the averaged module score
            totalLevels: LEVELS_PER_MODULE, // Reset to per-module base logic
            timestamp: new Date()
        };

        await addDoc(collection(db, "leaderboards", "grid", "scores"), scoreData);
        
        if (btnElement) {
            btnElement.innerText = "Score Saved!";
        }
    } catch (error) {
        console.error("Error saving score to Firebase:", error);
        if (btnElement) {
            btnElement.innerText = "Save Failed";
            btnElement.disabled = false;
        }
    }

    if (redirectCallback) {
        setTimeout(redirectCallback, 500); // slight delay
    }
}

// --- Module Progression ---
async function endModule(customTitle) {
    clearInterval(timerInterval);

    elModalTitle.innerText = customTitle || `Module ${currentModule} Complete`;
    elScoreText.innerText = `${correctAnswers} / ${LEVELS_PER_MODULE}`;
    elCorrectCount.innerText = correctAnswers;
    elWrongCount.innerText = wrongAnswers;

    moduleScores.push(correctAnswers);

    const isGameOver = currentModule >= TOTAL_MODULES || customTitle === "Time's Up!";

    if (isGameOver) {
        saveScoreToFirebase(elNextBtn, () => {
            window.location.href = "index.html";
        });
    } else {
        elNextBtn.innerText = "Start Next Module";
        elNextBtn.onclick = nextModule;
    }

    let backBtn = document.getElementById("modal-back-btn");
    if (!backBtn) {
        backBtn = document.createElement("button");
        backBtn.id = "modal-back-btn";
        backBtn.className = "btn btn-outline";
        backBtn.style.marginTop = "0.5rem";
        backBtn.style.display = "block";
        backBtn.style.width = "100%";
        elNextBtn.parentNode.insertBefore(backBtn, elNextBtn.nextSibling);
    }
    backBtn.innerText = "Save & Back to Modules";

    backBtn.onclick = () => {
        saveScoreToFirebase(backBtn, () => {
            elModal.classList.add("hidden");
            elModal.style.display = "none";
            showModuleSelection();
            moduleScores = []; // allow new plays without caching old average
        });
    };

    elModal.classList.remove("hidden");
    elModal.style.display = "flex";
}

function nextModule() {
    elModal.classList.add("hidden");
    elModal.style.display = "none";
    startModule(currentModule + 1);
}
