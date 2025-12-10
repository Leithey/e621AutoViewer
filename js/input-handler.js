import { state } from './state.js';
import { elements } from './dom-elements.js';
import { SWIPE_THRESHOLD_PIXELS } from './constants.js';
import { previousImage, nextImage } from './history-manager.js';
import { togglePause } from './helpers.js';
import { closeSettingsPanel } from './settings-manager.js';

let touchStartX = null;
let touchEndX = null;
let touchStartTime = null;

export function addKeyEvents() {
    document.addEventListener('mousedown', function (event) {
        if (event.button === 0) {
            leftClick(event);
        }
    });
    // Add event listener for the left arrow key press
    document.addEventListener('keydown', async function (event) {
        if (event.key === 'ArrowLeft') {
            // Call a function to navigate to the previous image
            await previousImage();
        } else if (event.key == "ArrowRight") {
            await nextImage();
        } else if (event.key === ' ') {
            await togglePause();
        }
    });

    document.addEventListener('touchstart', function (event) {
        touchStartX = event.touches[0].clientX;
        touchStartTime = Date.now();
    })
    document.addEventListener('touchmove', function (event) {
        touchEndX = event.touches[0].clientX;
    })
    document.addEventListener('touchend', function (event) {
        if (touchStartX && touchEndX) {
            let swipeDistance = touchEndX - touchStartX;

            let touchDuration = Date.now() - touchStartTime;

            if (Math.abs(swipeDistance) > SWIPE_THRESHOLD_PIXELS) {
                if (swipeDistance > 0) {
                    previousImage(); // Swipe right → go to previous
                } else {
                    nextImage(); // Swipe left → go to next
                }
            }
        }

        // Reset touch tracking variables
        touchStartX = null;
        touchEndX = null;
    });
}

async function leftClick(event) {
    if (state.settingsPanelOpen && !elements.settingsPanel.contains(event.target) &&
        (event.target === elements.mainImage || event.target === elements.background)) {
        closeSettingsPanel();
    } else if (elements.mainImage.contains(event.target)) {
        await togglePause();
    }
}
