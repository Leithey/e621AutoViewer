import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { ERROR_TYPES } from './constants.js';
import { getNewImageUrl } from './image-fetcher.js';
import { showLoading, hideLoading } from './ui-controls.js';

//recursive function that gets a new image and apply it to the screen, then waits and repeats
export async function imageLoop(skipNewSearch = false) {
    try {
        Logger.log(`[imageLoop] Called - skipNewSearch: ${skipNewSearch}, isSearchingForNewImage: ${state.isSearchingForNewImage}, paused: ${state.paused}, historySize: ${state.urlHistory.length}`);
        if (!skipNewSearch && !state.isSearchingForNewImage) {
            state.isSearchingForNewImage = true;
            Logger.log(`[imageLoop] Starting image search...`);
            try {
                let imageUrl = await getNewImageUrl();
                Logger.log(`[imageLoop] getNewImageUrl returned: ${imageUrl !== null ? 'valid URL' : 'null'}`);
                if (imageUrl !== null) {
                    // Create a new image object
                    const tempImage = new Image();
                    tempImage.src = imageUrl;
                    Logger.log(`[imageLoop] Loading image: ${imageUrl}`);
                    // Wait for the image to finish loading
                    await new Promise((resolve, reject) => {
                        if (state.firstImageLoaded) {
                            showLoading(true);
                        }
                        tempImage.onload = () => {
                            Logger.log(`[imageLoop] Image loaded successfully`);
                            resolve();
                        };
                        tempImage.onerror = () => {
                            Logger.error(`[imageLoop] Image load failed for: ${imageUrl}`);
                            reject(new Error(ERROR_TYPES.IMAGE_LOAD_FAILED));
                        };
                    });
                    // after the new image finished loading, only show it if not paused (as could happen during download)
                    if (!state.paused && !state.pageIsHidden) {
                        // Update the main image element
                        elements.mainImage.src = imageUrl;
                        state.currentHistoryPos = 0;
                        state.firstImageLoaded = true;
                        hideLoading();
                        Logger.log(`[imageLoop] Image displayed successfully`);
                    } else {
                        Logger.log(`[imageLoop] Image loaded but not displayed (paused: ${state.paused}, pageIsHidden: ${state.pageIsHidden})`);
                    }
                } else {
                    Logger.log(`[imageLoop] No image URL returned, will retry on next loop`);
                }
            } finally {
                // Always reset the flag, even if getNewImageUrl() returned null or an error occurred
                state.isSearchingForNewImage = false;
                Logger.log(`[imageLoop] Reset isSearchingForNewImage flag`);
            }
        } else {
            Logger.log(`[imageLoop] Skipping search - skipNewSearch: ${skipNewSearch}, isSearchingForNewImage: ${state.isSearchingForNewImage}`);
        }
        if (!state.paused) {
            const refreshRateMs = parseFloat(state.presetSettings.refreshRate) * 1000;
            Logger.log(`[imageLoop] Scheduling next loop in ${state.presetSettings.refreshRate}s (${refreshRateMs}ms)`);
            clearTimeout(state.timeoutId); // Clear any existing timeout before setting a new one
            state.timeoutId = setTimeout(imageLoop, refreshRateMs);
        } else {
            Logger.log(`[imageLoop] Not scheduling next loop (paused: ${state.paused})`);
        }
    } catch (error) {
        Logger.error(`[imageLoop] Error in setImageLoop:`, error);
    }
}
