import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { MOUSE_HIDE_TIMEOUT_MS } from './constants.js';

export function showLoading(showOnTop = false) {
    if (showOnTop) {
        elements.loadingtop.style.display = 'block';
        elements.loadingtop.style.top = "20px";
    } else {
        elements.mainImage.style.display = "none";
        elements.loading.style.display = 'block';
        elements.loading.style.top = "50%";
    }
}

export function hideLoading() {
    elements.mainImage.style.display = "block";
    elements.loading.style.display = 'none';
    elements.loadingtop.style.display = 'none';
}

export function showNoImagesError() {
    hideLoading();
    Logger.log(`No images found.`);
    elements.noImagesFound.style.display = 'block';
    elements.mainImage.style.display = "none";
}

export function hideNoImagesError() {
    elements.noImagesFound.style.display = 'none';
    elements.mainImage.style.display = "block";
}

// Function to hide the cursor after a period of inactivity
export function hideCursor() {
    document.body.style.cursor = 'none';
    state.cursorHidden = true;
}

// Function to show the cursor
export function showCursor() {
    document.body.style.cursor = 'auto';
    state.cursorHidden = false;
}

let blockHideEvents = false; //if true, don't hide the settings button and mouse cursor

// Event listener to track mouse movements
export function setupMouseTracking() {
    document.addEventListener('mousemove', () => {
        // Show settings button when mouse is moved
        elements.settingsButton.style.display = 'block';
        if (state.firstImageLoaded) {
            elements.sourceButton.style.display = 'block';
            elements.downloadButton.style.display = 'block';
        }
        clearTimeout(state.hideTimeout); // Clear the timeout if settings button is visible

        // Hide the cursor after a period of inactivity
        if (state.cursorHidden) {
            showCursor(); // Show the cursor if it's hidden
        }
        state.hideTimeout = setTimeout(mouseStoppedMoving, MOUSE_HIDE_TIMEOUT_MS); // Hide the cursor after inactivity
    });

    function mouseStoppedMoving() {
        if (!blockHideEvents && !state.settingsPanelOpen) {
            elements.settingsButton.style.display = 'none';
            elements.sourceButton.style.display = 'none';
            elements.downloadButton.style.display = 'none';
            hideCursor();
        }
    }

    // Event listener to clear timeout when mouse enters settings button area
    elements.settingsButton.addEventListener('mouseenter', () => {
        blockHideEvents = true;
    });

    // Event listener to hide settings button when mouse leaves settings button area
    elements.settingsButton.addEventListener('mouseleave', () => {
        blockHideEvents = false;
    });
}
