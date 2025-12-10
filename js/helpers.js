import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { buildPostApiUrl } from './api-client.js';
import { DEFAULT_BATCH_SIZE } from './constants.js';

export function isWhitelisted(postData) {
    let whitelist = state.globalSettings.globalwhitelist.split(" ");
    let presetwhitelist = state.presetSettings.whitelist.split(" ");
    whitelist = whitelist.concat(presetwhitelist);
    whitelist = whitelist.filter(item => item.trim() !== '');

    if (whitelist.length > 0 /*|| globalSettings.globalwhitelist.length > 0*/) {
        // Convert all tags to a Set for O(1) lookups
        const allTagsSet = new Set(Object.values(postData.tags).flatMap(tags => tags));

        // Check if all whitelist tags are present in the post's tags
        return whitelist.every(tag => allTagsSet.has(tag));
    } else {
        return true; //there is no whitelist, default to true
    }
}

//check if the postData is a allowed filetype
export function isFiletypeAllowed(postData) {
    const filetypelist = state.config.allowed_filetypes;

    const fileUrl = postData.file.url; // Get the URL of the file
    const lastIndex = fileUrl.lastIndexOf('.'); // Find the index of the last dot
    if (lastIndex !== -1) { // Check if a dot was found
        const fileType = fileUrl.slice(lastIndex); // Extract the characters after the dot

        // Check if the file extension is allowed
        if (filetypelist.includes(fileType)) {
            return true; // Filetype is allowed
        } else {
            Logger.log("Not allowed filetype:", fileType);
            return false; // Filetype is not allowed
        }
    } else {
        Logger.log("No file extension found.");
        return false; // No file extension found, consider it as not allowed
    }
}

//Toggles the pause state
export async function togglePause() {
    // Get the pause icon element
    const pauseIcon = elements.pauseIcon;
    if (state.paused) {
        await unPause();
    } else {
        await pause();
    }
}

//pauses the autoviewer
export async function pause() {
    state.paused = true;
    elements.pauseIcon.style.display = 'block';
    clearTimeout(state.timeoutId);
    state.isSearchingForNewImage = false;
    const { hideLoading } = await import('./ui-controls.js');
    hideLoading();
    updateDocumentTitle(); // Defined below in this same file
}

//unpauses the autoviewer. Input true to not search for a new image after unpausing and to instead wait the normal delay 
export async function unPause(skipNewSearch = false) {
    if (!state.isSearchingForNewImage) {
        state.paused = false;
        elements.pauseIcon.style.display = 'none';
        clearTimeout(state.timeoutId);
        updateDocumentTitle();
        const { imageLoop } = await import('./image-loop.js');
        await imageLoop(skipNewSearch);
    } else {
        Logger.log("Not unpausing, new image is being searched");
    }
}

export function getHistoryPosInArray() {
    return state.urlHistory.length + state.currentHistoryPos - 1;
}

export function downloadImage() {
    const imageUrl = "https://corsproxy.io/?" + getCurrentFileURL();
    const lastIndex = imageUrl.lastIndexOf("/");
    const filename = imageUrl.substring(lastIndex + 1);
    Logger.log(filename);

    // Fetch the image as a Blob
    fetch(imageUrl)
        .then(response => response.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result; // Base64-encoded data URL
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            reader.readAsDataURL(blob);
        })
        .catch(error => {
            Logger.error('Error fetching image:', error.message);
        });
}

export function getCurrentId() {
    Logger.log(getHistoryPosInArray() + state.urlHistory);
    const currentId = state.urlHistory[getHistoryPosInArray()][1];
    return currentId;
}

export function getCurrentFileURL() {
    const currentFileURL = state.urlHistory[getHistoryPosInArray()][0];
    return currentFileURL;
}

export function getCurrentSourceURL() {
    const currentId = getCurrentId();
    return buildPostApiUrl(currentId);
}

export function openSource() {
    window.open(getCurrentSourceURL());
}

// Event handler for visibility change
export function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Page is visible
        Logger.log('Page is visible');
        state.pageIsHidden = false;
    } else if (document.visibilityState === 'hidden') {
        // Page is hidden
        Logger.log('Page is hidden');
        state.pageIsHidden = true;
        // Clear timeouts when page becomes hidden to prevent unnecessary operations
        clearTimeout(state.timeoutId);
        clearTimeout(state.hideTimeout);
    }
}

// Helper function to convert refreshRate from milliseconds to seconds if needed (for backward compatibility)
export function normalizeRefreshRate(refreshRate) {
    const value = parseFloat(refreshRate);
    // If value is > 100, assume it's in milliseconds (old format) and convert to seconds
    if (value > 100) {
        return (value / 1000).toString();
    }
    return refreshRate.toString();
}

// Function to update the document title based on preset and pause state
export function updateDocumentTitle() {
    if (typeof state.presetSettings === 'undefined' || !state.presetSettings) {
        document.title = 'e621 Slideshow';
        return;
    }
    
    const presetName = state.presetSettings.presetName || 'Unknown Preset';
    
    if (state.paused) {
        document.title = `e621 AutoViewer (Paused) - ${presetName}`;
    } else {
        document.title = `${presetName} - e621 AutoViewer`;
    }
}

