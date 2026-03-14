import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";

const RATING_HTML = `
<div class="rating-container" style="margin-top: 2rem; padding: 1.5rem; border-top: 2px solid #f1f5f9; text-align: center;">
    <h3 style="margin-bottom: 1rem; color: #1e293b; font-weight: 800;">Enjoyed this challenge?</h3>
    <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem;">Your feedback helps us make AptiGame better!</p>
    <div class="star-rating" style="display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 1.5rem;">
        <i class="far fa-star rating-star" data-rating="1" style="font-size: 2rem; color: #cbd5e1; cursor: pointer; transition: all 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="2" style="font-size: 2rem; color: #cbd5e1; cursor: pointer; transition: all 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="3" style="font-size: 2rem; color: #cbd5e1; cursor: pointer; transition: all 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="4" style="font-size: 2rem; color: #cbd5e1; cursor: pointer; transition: all 0.2s;"></i>
        <i class="far fa-star rating-star" data-rating="5" style="font-size: 2rem; color: #cbd5e1; cursor: pointer; transition: all 0.2s;"></i>
    </div>
    <div id="rating-comment-box" class="hidden" style="margin-bottom: 1.5rem;">
        <textarea id="rating-comment" placeholder="Any suggestions? (Optional)" 
            style="width: 100%; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 12px; font-family: inherit; resize: none; min-height: 80px;"></textarea>
        <button id="submit-rating-btn" class="btn btn-primary" style="width: 100%; margin-top: 1rem; padding: 0.75rem;">Submit Review</button>
    </div>
    <p id="rating-status" style="font-size: 0.85rem; color: #10b981; font-weight: 600; min-height: 1.2rem;"></p>
</div>
`;

let selectedRating = 0;

/**
 * Initializes the rating UI in a target container
 * @param {HTMLElement} container 
 */
export async function initRatingSystem(container) {
    if (!container) return;

    const user = auth.currentUser;
    if (!user) return;

    // Check if already rated (using cache)
    const hasRatedCache = localStorage.getItem(`hasRated_${user.uid}`);
    if (hasRatedCache === 'true') return;

    // Check Firestore if not in cache
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists() && userDoc.data().hasRated === true) {
            localStorage.setItem(`hasRated_${user.uid}`, 'true');
            return;
        }
    } catch (e) {
        console.error("Error checking rating status:", e);
    }

    container.innerHTML = RATING_HTML;
    container.classList.remove('hidden');

    const stars = container.querySelectorAll('.rating-star');
    const commentBox = document.getElementById('rating-comment-box');
    const submitBtn = document.getElementById('submit-rating-btn');
    const commentArea = document.getElementById('rating-comment');
    const statusText = document.getElementById('rating-status');

    stars.forEach(star => {
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.dataset.rating);
            highlightStars(stars, rating);
        });

        star.addEventListener('mouseout', () => {
            highlightStars(stars, selectedRating);
        });

        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.rating);
            highlightStars(stars, selectedRating);
            commentBox.classList.remove('hidden');
        });
    });

    submitBtn.addEventListener('click', async () => {
        if (selectedRating === 0) return;

        submitBtn.disabled = true;
        submitBtn.innerText = "Submitting...";

        try {
            // 1. Add to ratings collection
            await addDoc(collection(db, "ratings"), {
                uid: user.uid,
                userName: user.displayName,
                userEmail: user.email,
                rating: selectedRating,
                comment: commentArea.value,
                timestamp: serverTimestamp()
            });

            // 2. Mark user as having rated
            await updateDoc(doc(db, "users", user.uid), {
                hasRated: true
            });

            localStorage.setItem(`hasRated_${user.uid}`, 'true');
            statusText.innerText = "Thank you for your rating!";
            
            setTimeout(() => {
                container.style.opacity = '0';
                setTimeout(() => container.innerHTML = '', 500);
            }, 2000);

        } catch (e) {
            console.error("Error submitting rating:", e);
            statusText.style.color = "#ef4444";
            statusText.innerText = "Failed to submit. Please try again.";
            submitBtn.disabled = false;
            submitBtn.innerText = "Submit Review";
        }
    });
}

function highlightStars(stars, rating) {
    stars.forEach(s => {
        const r = parseInt(s.dataset.rating);
        if (r <= rating) {
            s.classList.remove('far');
            s.classList.add('fas');
            s.style.color = '#fbbf24';
        } else {
            s.classList.remove('fas');
            s.classList.add('far');
            s.style.color = '#cbd5e1';
        }
    });
}
