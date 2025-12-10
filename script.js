//TODO: 
// Import/Export buttons
// Make the save/delete buttons always visible and not scale with the rest
// credit to keru: Favorite images to e621 or locally?
// credit to keru: zoom in somehow, like scrollwheel and pan
// Video Support

/*
 * Logger class to wrapper console.log and allow enabling/disabling via settings.
 */
const Logger = {
    isDebug: () => {
        // Check localStorage first (can be set via console: localStorage.setItem('debug', 'true'))
        if (localStorage.getItem('debug') === 'true') return true;

        // Check global settings if loaded
        if (typeof globalSettings !== 'undefined' && globalSettings.debug === true) return true;

        // Check config if loaded
        if (typeof config !== 'undefined' && config.debug === true) return true;

        return false;
    },

    log: (...args) => {
        if (!Logger.isDebug()) return;

        if (args.length > 0 && typeof args[0] === 'string') {
            const match = args[0].match(/^\[(.*?)\] (.*)/);
            if (match) {
                const tag = match[1];
                const rest = match[2];
                console.log(`%c[${tag}]%c ${rest}`, 'color: #277d89ff; font-weight: bold;', 'color: inherit;', ...args.slice(1));
                return;
            }
        }
        console.log(...args);
    },

    error: (...args) => {
        if (!Logger.isDebug()) return;

        if (args.length > 0 && typeof args[0] === 'string') {
            const match = args[0].match(/^\[(.*?)\] (.*)/);
            if (match) {
                const tag = match[1];
                const rest = match[2];
                console.error(`%c[${tag}]%c ${rest}`, 'color: #f44336; font-weight: bold;', 'color: inherit;', ...args.slice(1));
                return;
            }
        }
        console.error(...args);
    },

    warn: (...args) => {
        if (!Logger.isDebug()) return;

        if (args.length > 0 && typeof args[0] === 'string') {
            const match = args[0].match(/^\[(.*?)\] (.*)/);
            if (match) {
                const tag = match[1];
                const rest = match[2];
                console.warn(`%c[${tag}]%c ${rest}`, 'color: #ff9800; font-weight: bold;', 'color: inherit;', ...args.slice(1));
                return;
            }
        }
        console.warn(...args);
    },

    // Helper to set debug mode from console easily
    setDebug: (enabled) => {
        localStorage.setItem('debug', enabled.toString());
        console.log(`Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
};

// Expose Logger to window for console access
window.Logger = Logger;

let adultMode = false;

let config;
let timeoutId;
let paused = false;
let urlHistory = []; //Array in Array. Element 0 is the direct fileName, Element 1 is the fileId
let urlHistorySet = new Set(); // Set for O(1) history lookups by fileId
let currentHistoryPos = 0;
let pageIsHidden;
let hideTimeout;
let cursorHidden = false;
let mouseMoveTimeout;
let isSearchingForNewImage;
let firstImageLoaded = false;
let settingsPanelOpen = false;
let presetsData = [];
let globalSettings;
let selectedPreset = 0;
let presetSettings;
let temporarySearchActive = false;
let savedPresetSettings = null;
// Batch caching for efficient API usage
let currentPostBatch = [];
let currentBatchIndex = 0;
let currentBatchPage = 1;
let currentBatchQuery = ""; // Track query to detect when tags change
// Prefetching state variables
let prefetchPromise = null; // Promise for ongoing prefetch operation
let prefetchedBatch = []; // Array to store prefetched posts
let prefetchedPage = null; // Page number of prefetched batch
// Query string caching
let cachedQueryString = null; // Cached query string to avoid redundant building

// Error type constants for standardized error handling
const ERROR_TYPES = {
    PAUSED: 'PAUSED',
    NO_IMAGES: 'NO_IMAGES',
    IMAGE_LOAD_FAILED: 'IMAGE_LOAD_FAILED',
    HTTP_ERROR: 'HTTP_ERROR'
};

// Configuration constants
const MAX_RECURSION_DEPTH = 10;
const MAX_PAGES_TO_SEARCH = 100;
const PREFETCH_THRESHOLD_PERCENTAGE = 0.5; // Trigger prefetch at 50% of batch consumed
const SWIPE_THRESHOLD_PIXELS = 10; // Minimum swipe distance to trigger navigation
const MOUSE_HIDE_TIMEOUT_MS = 1000; // Milliseconds before hiding cursor/buttons
const DEFAULT_BATCH_SIZE = 25;

const settingsButton = document.getElementById('settingsButtonDiv');
const mainImage = document.getElementById("mainImage");
const background = document.getElementById('background');
const settingsPanel = document.getElementById('settingsPanel');
const loading = document.getElementById('loading');
const loadingtop = document.getElementById('loadingtop');
const sourceButton = document.getElementById('sourceButton');
const downloadButton = document.getElementById('downloadButton');
const globalSettingsButton = document.getElementById('globalsettingsbutton');
const globalPresetsButton = document.getElementById('presetsettingsbutton');
const creditsButton = document.getElementById('creditsbutton');
const searchButton = document.getElementById('searchbutton');
const presetList = document.getElementById("presetList");
const presetSettingsPanel = document.getElementById("presetsettingspanel");
const globalsettingsPanel = document.getElementById("globalsettingspanel");
const creditsPanel = document.getElementById('creditsPanel');
const searchPanel = document.getElementById('searchPanel');
const usernameInput = document.getElementById('username');
const apiKeyInput = document.getElementById('apikey');
const noImagesFound = document.getElementById('noimages');
const presetNamePrompt = document.getElementById('presetNamePrompt');
const presetNameInput = document.getElementById('presetNameInput');
const presetNameError = document.getElementById('presetNameError');
const presetNameCancel = document.getElementById('presetNameCancel');
const presetNameConfirm = document.getElementById('presetNameConfirm');

///////////////////////////////////////////////////////////////INITIALIZATION/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//loads config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch config.json: ${response.status}`);
        }
        config = await response.json();
        await loadPresets();
        await loadGlobalSettings();
    } catch (error) {
        Logger.error('Error loading config:', error);
        return {}; // Return an empty object in case of error
    }
    Logger.log("Config loaded");
}

//this is called to load the config and initialize the image loop.
async function initialize() {
    try {
        showLoading();
        await loadConfig();
        imageLoop();

        document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (error) {
        Logger.error("Error:", error);
    }
}

///////////////////////////////////////////////////////////////////MAIN FUNCTIONS/////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//recursive function that gets a new image and apply it to the screen, then waits and repeats
async function imageLoop(skipNewSearch = false) {
    try {
        Logger.log(`[imageLoop] Called - skipNewSearch: ${skipNewSearch}, isSearchingForNewImage: ${isSearchingForNewImage}, paused: ${paused}, historySize: ${urlHistory.length}`);
        if (!skipNewSearch && !isSearchingForNewImage) {
            isSearchingForNewImage = true;
            Logger.log(`[imageLoop] Starting image search...`);
            try {
                imageUrl = await getNewImageUrl();
                Logger.log(`[imageLoop] getNewImageUrl returned: ${imageUrl !== null ? 'valid URL' : 'null'}`);
                if (imageUrl !== null) {
                    // Create a new image object
                    const tempImage = new Image();
                    tempImage.src = imageUrl;
                    Logger.log(`[imageLoop] Loading image: ${imageUrl}`);
                    // Wait for the image to finish loading
                    await new Promise((resolve, reject) => {
                        if (firstImageLoaded) {
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
                    if (!paused && !pageIsHidden) {
                        // Update the main image element
                        document.getElementById('mainImage').src = imageUrl;
                        currentHistoryPos = 0;
                        firstImageLoaded = true;
                        hideLoading();
                        Logger.log(`[imageLoop] Image displayed successfully`);
                    } else {
                        Logger.log(`[imageLoop] Image loaded but not displayed (paused: ${paused}, pageIsHidden: ${pageIsHidden})`);
                    }
                } else {
                    Logger.log(`[imageLoop] No image URL returned, will retry on next loop`);
                }
            } finally {
                // Always reset the flag, even if getNewImageUrl() returned null or an error occurred
                isSearchingForNewImage = false;
                Logger.log(`[imageLoop] Reset isSearchingForNewImage flag`);
            }
        } else {
            Logger.log(`[imageLoop] Skipping search - skipNewSearch: ${skipNewSearch}, isSearchingForNewImage: ${isSearchingForNewImage}`);
        }
        if (!paused) {
            const refreshRateMs = parseFloat(presetSettings.refreshRate) * 1000;
            Logger.log(`[imageLoop] Scheduling next loop in ${presetSettings.refreshRate}s (${refreshRateMs}ms)`);
            clearTimeout(timeoutId); // Clear any existing timeout before setting a new one
            timeoutId = setTimeout(imageLoop, refreshRateMs);
        } else {
            Logger.log(`[imageLoop] Not scheduling next loop (paused: ${paused})`);
        }
    } catch (error) {
        Logger.error(`[imageLoop] Error in setImageLoop:`, error);
    }
}

// Prefetch the next batch in the background
async function prefetchNextBatch() {
    // Don't prefetch if already prefetching, paused, or page is hidden
    if (prefetchPromise !== null || paused || pageIsHidden) {
        return;
    }

    // Don't prefetch if we don't have a current batch or query
    if (currentPostBatch.length === 0 || currentBatchQuery === "") {
        return;
    }

    // Don't prefetch if we already have a prefetched batch
    if (prefetchedBatch.length > 0) {
        return;
    }

    const nextPage = currentBatchPage + 1;
    const batchSize = (globalSettings && globalSettings.batchSize) || DEFAULT_BATCH_SIZE; // Use configured batch size

    // Build query string including tags and blacklist
    const queryString = buildQueryString();

    // Verify query hasn't changed before starting prefetch
    if (currentBatchQuery !== queryString) {
        Logger.log(`[prefetchNextBatch] Query changed, aborting prefetch`);
        return;
    }

    const params = {
        "tags": queryString,
        "limit": batchSize,
        "page": nextPage,
        "client": '_client=e621AutoViewer (by Leithey)'
    };

    const queryParams = new URLSearchParams(params).toString();

    const url = buildPostsApiUrl(queryParams);

    let headerParams = {};
    if (globalSettings.username.length > 0 && globalSettings.apikey.length > 0) {
        headerParams.Authorization = `Basic ` + btoa(`${globalSettings.username}:${globalSettings.apikey}`);
    }

    // Create prefetch promise
    prefetchPromise = (async () => {
        try {
            Logger.log(`[prefetchNextBatch] Prefetching page ${nextPage} (${batchSize} posts)`);
            const response = await fetch(url, { headers: headerParams });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const postData = await response.json();

            // Only store if query hasn't changed and we're not paused
            if (currentBatchQuery === queryString && !paused && !pageIsHidden) {
                prefetchedBatch = postData.posts;
                prefetchedPage = nextPage;
                Logger.log(`[prefetchNextBatch] Prefetch completed (page ${nextPage}, ${postData.posts.length} posts)`);
            } else {
                Logger.log(`[prefetchNextBatch] Prefetch completed but discarded (query changed or paused)`);
            }
        } catch (error) {
            Logger.log(`[prefetchNextBatch] Prefetch failed:`, error);
            // Don't throw - prefetch failures shouldn't break main flow
        } finally {
            prefetchPromise = null;
        }
    })();

    // Don't await - fire and forget
    return prefetchPromise;
}

// Build complete query string including tags and blacklist
function buildQueryString() {
    // Return cached query string if available
    if (cachedQueryString !== null) {
        return cachedQueryString;
    }

    // Combine global and preset tags
    let tags = globalSettings.globaltags.split(" ");
    tags = tags.concat(presetSettings.tags.split(" "));
    tags = tags.filter(tag => tag.trim() !== "");

    // Combine global and preset blacklist tags, prefix with '-'
    let blacklist = globalSettings.globalblacklist.split(" ");
    let presetblacklist = presetSettings.blacklist.split(" ");
    blacklist = blacklist.concat(presetblacklist);
    blacklist = blacklist.filter(item => item.trim() !== '');

    // Prefix blacklist tags with '-' for e621 API exclusion syntax
    const negatedBlacklist = blacklist.map(tag => `-${tag}`);

    // Automatically exclude video file types (webm, mp4) using e621's filetype: filter
    // This is more efficient than filtering in code after fetching
    const excludedFileTypes = ['-filetype:webm', '-filetype:mp4'];

    // Combine all tags, blacklist tags, and file type exclusions
    const allTags = tags.concat(negatedBlacklist).concat(excludedFileTypes);

    // Cache and return the result
    cachedQueryString = allTags.join(' ');
    return cachedQueryString;
}

// Invalidate the query string cache (call when settings change)
function invalidateQueryStringCache() {
    cachedQueryString = null;
}

// Get the base API URL based on adult mode and preset settings
function getApiBaseUrl() {
    if (adultMode && presetSettings.adultcontent) {
        return config.url_e621;
    } else {
        return config.url_e926;
    }
}

// Build complete API URL for posts endpoint
function buildPostsApiUrl(queryParams) {
    return `${getApiBaseUrl()}/posts.json/?${queryParams}`;
}

// Build API URL for a specific post
function buildPostApiUrl(postId) {
    return `${getApiBaseUrl()}/posts/${postId}`;
}

//Get the image url of a new image with the matching criteria
async function getNewImageUrl(recursionDepth = 0, page = null, batchSize = null) {
    const maxRecursionDepth = MAX_RECURSION_DEPTH; // Prevent infinite recursion - reduced from 50
    const maxPages = MAX_PAGES_TO_SEARCH; // Maximum pages to try before giving up

    // Build query string including tags and blacklist
    const queryString = buildQueryString();

    // Check if query changed - if so, reset cache and prefetch
    if (currentBatchQuery !== queryString) {
        Logger.log(`[getNewImageUrl] Query changed, resetting cache. Old: "${currentBatchQuery}", New: "${queryString}"`);
        currentPostBatch = [];
        currentBatchIndex = 0;
        currentBatchPage = 1;
        currentBatchQuery = queryString;
        prefetchedBatch = [];
        prefetchedPage = null;
        prefetchPromise = null;
    }

    // Use cached batch if available and we haven't exhausted it
    if (currentPostBatch.length > 0 && currentBatchIndex < currentPostBatch.length) {
        Logger.log(`[getNewImageUrl] Using cached batch (index: ${currentBatchIndex}/${currentPostBatch.length}, page: ${currentBatchPage})`);
        // Continue processing from cached batch
        return processBatch(currentPostBatch, currentBatchIndex, currentBatchPage, recursionDepth);
    }

    // Check for prefetched batch first before making new API call
    if (prefetchedBatch.length > 0 && prefetchedPage !== null) {
        Logger.log(`[getNewImageUrl] Using prefetched batch (page ${prefetchedPage}, ${prefetchedBatch.length} posts)`);
        // Move prefetched batch to current batch
        currentPostBatch = prefetchedBatch;
        currentBatchIndex = 0;
        currentBatchPage = prefetchedPage;
        // Clear prefetched batch
        prefetchedBatch = [];
        prefetchedPage = null;
        // Process the prefetched batch
        return processBatch(currentPostBatch, 0, currentBatchPage, recursionDepth);
    }

    // Need to fetch a new batch
    // Use consistent batch size from global settings to avoid missing posts
    const determinedBatchSize = batchSize !== null ? batchSize : ((globalSettings && globalSettings.batchSize) || DEFAULT_BATCH_SIZE);

    // If batch is exhausted and no explicit page provided, fetch next page
    // Otherwise use the explicitly provided page (for recursive calls)
    const pageToFetch = page !== null ? page : (currentPostBatch.length > 0 ? currentBatchPage + 1 : 1);
    if (pageToFetch > maxPages) {
        Logger.error(`[getNewImageUrl] Max pages (${maxPages}) reached, returning null`);
        return null;
    }
    if (recursionDepth > maxRecursionDepth) {
        Logger.error(`[getNewImageUrl] Max recursion depth (${maxRecursionDepth}) reached, returning null`);
        return null;
    }

    Logger.log(`[getNewImageUrl] Fetching new batch (recursion depth: ${recursionDepth}, page: ${pageToFetch}, batch size: ${determinedBatchSize}, history size: ${urlHistory.length})`);

    const params = {
        "tags": queryString,
        "limit": determinedBatchSize,
        "page": pageToFetch,
        "client": '_client=e621AutoViewer (by Leithey)'
    }

    const queryParams = new URLSearchParams(params).toString();

    const url = buildPostsApiUrl(queryParams);

    let headerParams = {};

    if (globalSettings.username.length > 0 && globalSettings.apikey.length > 0) {
        headerParams.Authorization = `Basic ` + btoa(`${globalSettings.username}:${globalSettings.apikey}`);
    }

    try {
        Logger.log(`[getNewImageUrl] Fetching from: ${url}`);
        const response = await fetch(url, { headers: headerParams });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const postData = await response.json();
        Logger.log(`[getNewImageUrl] Received ${postData.posts.length} posts from API (page ${pageToFetch})`);

        if (postData.posts.length <= 0) {
            Logger.log(`[getNewImageUrl] No posts returned from API (page ${pageToFetch})`);
            // If we're on page 1 and get no results, show error. Otherwise, we've exhausted all pages.
            if (pageToFetch === 1) {
                showNoImagesError();
                throw new Error(ERROR_TYPES.NO_IMAGES);
            } else {
                Logger.log(`[getNewImageUrl] Exhausted all available pages, returning null`);
                return null;
            }
        } else {
            noImagesFound.style.display = 'none';
        }

        // Cache the batch
        currentPostBatch = postData.posts;
        currentBatchIndex = 0;
        currentBatchPage = pageToFetch;

        // If we got fewer posts than requested, we might be near the end
        if (postData.posts.length < determinedBatchSize && pageToFetch > 1) {
            Logger.log(`[getNewImageUrl] Received fewer posts than requested (${postData.posts.length} < ${determinedBatchSize}), may be near end of results`);
        }

        // Process the batch
        return processBatch(postData.posts, 0, pageToFetch, recursionDepth);
    } catch (error) {
        if (error.message !== ERROR_TYPES.PAUSED) {
            if (error.message === ERROR_TYPES.NO_IMAGES) {
                Logger.log(`[getNewImageUrl] No images error caught`);
            } else {
                Logger.error(`[getNewImageUrl] Error caught:`, error);
            }
        } else {
            Logger.log(`[getNewImageUrl] Paused error caught, returning null`);
        }
        return null;
    }
}

// Process a batch of posts, starting from startIndex
async function processBatch(posts, startIndex, page, recursionDepth) {
    let fileUrl;
    let fileId;
    let post;
    let skippedCount = 0;
    let skippedReasons = {
        noUrl: 0,
        wrongFiletype: 0,
        alreadyInHistory: 0,
        notWhitelisted: 0
    };

    for (let i = startIndex; i < posts.length; i++) {
        post = posts[i];

        if (paused || pageIsHidden) {
            Logger.log(`[processBatch] Paused or page hidden, aborting`);
            throw new Error(ERROR_TYPES.PAUSED);
        } else if (!post.file || !post.file.url) {
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): URL is Null`);
            skippedReasons.noUrl++;
            skippedCount++;
            continue;
        } else if (!isFiletypeAllowed(post)) {
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): Wrong filetype`);
            skippedReasons.wrongFiletype++;
            skippedCount++;
            continue;
        } else if (urlHistorySet.has(post.id)) {
            // Skip images that are already in history
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): Already in history`);
            skippedReasons.alreadyInHistory++;
            skippedCount++;
            continue;
        } else if (isWhitelisted(post)) {
            fileUrl = post.file.url;
            fileId = post.id;
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): ACCEPTED - Score: ${post.score.total}, URL: ${fileUrl}`);
            // Update cache index for next time
            currentBatchIndex = i + 1;
            break;
        } else {
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): Not whitelisted`);
            skippedReasons.notWhitelisted++;
            skippedCount++;
            continue;
        }
    }

    Logger.log(`[processBatch] Processed ${posts.length - startIndex} posts (from index ${startIndex}) - Skipped: ${skippedCount} (noUrl: ${skippedReasons.noUrl}, wrongFiletype: ${skippedReasons.wrongFiletype}, alreadyInHistory: ${skippedReasons.alreadyInHistory}, notWhitelisted: ${skippedReasons.notWhitelisted})`);

    if (paused || pageIsHidden) {
        Logger.log(`[processBatch] Paused or page hidden after processing, aborting`);
        throw new Error(ERROR_TYPES.PAUSED);
    }
    if (fileUrl === undefined) {
        // All posts in this batch were skipped, fetch next page
        const nextPage = page + 1;
        Logger.log(`[processBatch] No valid image found in batch (page ${page}), trying next page (${nextPage})`);
        // Clear cache so we fetch fresh batch
        currentPostBatch = [];
        currentBatchIndex = 0;
        // Also clear prefetch state since we're moving to a new page
        prefetchedBatch = [];
        prefetchedPage = null;
        prefetchPromise = null;
        return getNewImageUrl(recursionDepth + 1, nextPage); //no fitting image found, try next page
    } else {
        Logger.log(`[processBatch] SUCCESS - New Image Found! Score: ${post.score.total}, URL: ${fileUrl}, ID: ${fileId}`);
        urlHistory.push([fileUrl, fileId]);
        urlHistorySet.add(fileId);
        currentHistoryPos--;
        Logger.log(`[processBatch] Added to history. History size now: ${urlHistory.length}, cache index now: ${currentBatchIndex}`);

        // Trigger prefetching when we're halfway through the current batch (50% consumed)
        if (currentBatchIndex >= currentPostBatch.length * 0.5) {
            Logger.log(`[processBatch] Halfway through batch (${currentBatchIndex}/${currentPostBatch.length}), triggering prefetch`);
            prefetchNextBatch(); // Fire and forget - don't await
        }

        return fileUrl;
    }
}

////////////////////////////////////////////////////////////////////AGE CHECK/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Listen to button presses on age check
document.addEventListener('DOMContentLoaded', async function () {
    const agePrompt = document.getElementById('agePrompt');
    const yesButton = document.getElementById('yesButton');
    const noButton = document.getElementById('noButton');

    // Check if user has previously confirmed their age
    const userAgeConfirmed = localStorage.getItem('ageConfirmed');
    if (userAgeConfirmed === 'true') {
        // If user has already confirmed their age, proceed with loading images
        await ageCheckPassed();
    } else {
        // If user has not confirmed their age, show the age prompt
        agePrompt.style.display = 'block';

        // Add event listeners to buttons
        yesButton.addEventListener('click', async function () {
            Logger.log("18+")
            localStorage.setItem('ageConfirmed', 'true'); // Save user confirmation

            await ageCheckPassed();
        });

        noButton.addEventListener('click', async function () {
            Logger.log("Not 18+");

            await ageCheckNotPassed();
        });
    }
});

//Pass from age check to main autoviewer
async function ageCheckPassed() {
    adultMode = true;
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    await initialize();
}

async function ageCheckNotPassed() {
    adultMode = false;
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    await initialize();
}

let touchStartX = null;
let touchEndX = null;
let touchStartTime = null;
function addKeyEvents() {
    document.addEventListener('mousedown', function (event) {
        if (event.button === 0) {
            leftClick(event);
        }
    });
    // Add event listener for the left arrow key press
    document.addEventListener('keydown', async function (event) {
        if (event.key === 'ArrowLeft') {
            // Call a function to navigate to the previous image
            previousImage();
        } else if (event.key == "ArrowRight") {
            nextImage();
        } else if (event.key === ' ') {
            togglePause();
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

///////////////////////////////////////////////////////////////INPUT HANDLING/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function leftClick(event) {
    if (settingsPanelOpen && !settingsPanel.contains(event.target) &&
        (event.target === mainImage || event.target === background)) {
        closeSettingsPanel();
    } else if (mainImage.contains(event.target)) {
        togglePause();
    }
}

let blockHideEvents = false; //if true, don't hide the settings button and mouse cursor
// Event listener to track mouse movements
document.addEventListener('mousemove', () => {
    // Show settings button when mouse is moved
    settingsButton.style.display = 'block';
    if (firstImageLoaded) {
        sourceButton.style.display = 'block';
        downloadButton.style.display = 'block';
    }
    clearTimeout(hideTimeout); // Clear the timeout if settings button is visible

    // Hide the cursor after a period of inactivity
    if (cursorHidden) {
        showCursor(); // Show the cursor if it's hidden
    }
    hideTimeout = setTimeout(mouseStoppedMoving, MOUSE_HIDE_TIMEOUT_MS); // Hide the cursor after inactivity
});

function mouseStoppedMoving() {
    if (!blockHideEvents && !settingsPanelOpen) {
        settingsButton.style.display = 'none';
        sourceButton.style.display = 'none';
        downloadButton.style.display = 'none';
        hideCursor();
    }
}

// Event listener to clear timeout when mouse enters settings button area
settingsButton.addEventListener('mouseenter', () => {
    blockHideEvents = true;
});

// Event listener to hide settings button when mouse leaves settings button area
settingsButton.addEventListener('mouseleave', () => {
    blockHideEvents = false;
});

///////////////////////////////////////////////////////////////SETTINGS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
document.getElementById('addPresetBtn').addEventListener('click', createNewPreset);
document.getElementById('savePreset').addEventListener('click', function () { savePreset(selectedPreset); });
document.getElementById('deletePreset').addEventListener('click', function () { deletePreset(selectedPreset); });
document.getElementById('resetPresetsBtn').addEventListener('click', resetPresets);

settingsButton.addEventListener('click', () => {
    if (!settingsPanelOpen) {
        openSettingsPanel();
    } else {
        closeSettingsPanel();
    }
});

function openSettingsPanel() {
    settingsPanelOpen = true;
    settingsPanel.style.display = 'flex';
    clearTimeout(hideTimeout); // Prevent hiding UI while settings panel is open
    pause();
    Logger.log("opening settings");
    // Open Search tab by default
    openSearchTab();
}

document.getElementById('closesettingsbutton').addEventListener('click', closeSettingsPanel);
function closeSettingsPanel() {
    settingsPanelOpen = false;
    settingsPanel.style.display = 'none';
    unPause();
    Logger.log("closing settings");
}

///////////////////////////////////////////////////////////////PRESETS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createNewPreset() {
    var newPreset = {
        "presetName": "New Preset",
        "refreshRate": "10",
        "tags": "",
        "blacklist": "",
        "whitelist": "",
        "adultcontent": "true",
    };
    presetsData.push(newPreset);
    addPresetItem(newPreset.presetName);
}

// Function to add a new preset item
function addPresetItem(name) {
    const presetList = document.getElementById('presetList');

    const newPreset = document.createElement('div');
    newPreset.classList.add('presetItem');
    newPreset.textContent = name;
    newPreset.title = name; // Show full name in tooltip when hovering
    newPreset.dataset.index = presetList.children.length;;
    newPreset.addEventListener('click', function () {
        let index = newPreset.dataset.index;
        loadPreset(index);
    });
    presetList.appendChild(newPreset);
}

async function loadPresets(reset = false) {
    try {
        let localPresetsData = localStorage.getItem("presetsData");

        selectedPreset = localStorage.getItem("selectedPreset");
        if (selectedPreset === null || selectedPreset === undefined) {
            selectedPreset = 0;
        }

        if (!reset && localPresetsData) {
            presetsData = JSON.parse(localPresetsData);
            // Migrate refreshRate values from milliseconds to seconds if needed
            for (let i = 0; i < presetsData.length; i++) {
                if (presetsData[i].refreshRate) {
                    presetsData[i].refreshRate = normalizeRefreshRate(presetsData[i].refreshRate);
                }
            }
            // Save migrated presets back to localStorage
            savePresets();

        } else {
            const response = await fetch('presets.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch config.json: ${response.status}`);
            }
            presetsData = await response.json();
        }
    } catch (error) {
        Logger.error('Error loading config:', error);
        presetsData = []; // Return an empty object in case of error
    }

    presetList.innerHTML = ""; //clear list

    for (var i = 0; i < presetsData.length; i++) {
        addPresetItem(presetsData[i].presetName);
    }
    loadPreset(selectedPreset);
    
    // Check if there's a saved temporary search to restore
    const savedTemporarySearch = localStorage.getItem("temporarySearch");
    const savedTemporarySearchActive = localStorage.getItem("temporarySearchActive");
    
    if (savedTemporarySearchActive === "true" && savedTemporarySearch) {
        try {
            const tempPreset = JSON.parse(savedTemporarySearch);
            // Migrate refreshRate from milliseconds to seconds if needed
            if (tempPreset.refreshRate) {
                tempPreset.refreshRate = normalizeRefreshRate(tempPreset.refreshRate);
            }
            presetSettings = tempPreset;
            temporarySearchActive = true;
            savedPresetSettings = presetsData[selectedPreset]; // Save the preset that was loaded
            
            // Reset batch cache for the temporary search
            currentPostBatch = [];
            currentBatchIndex = 0;
            currentBatchPage = 1;
            currentBatchQuery = "";
            prefetchedBatch = [];
            prefetchedPage = null;
            prefetchPromise = null;
            invalidateQueryStringCache();
            
            Logger.log("Restored temporary search from previous session:", tempPreset.presetName);
        } catch (error) {
            Logger.error("Error restoring temporary search:", error);
            localStorage.removeItem("temporarySearch");
            localStorage.removeItem("temporarySearchActive");
        }
    }
}

// Helper function to convert refreshRate from milliseconds to seconds if needed (for backward compatibility)
function normalizeRefreshRate(refreshRate) {
    const value = parseFloat(refreshRate);
    // If value is > 100, assume it's in milliseconds (old format) and convert to seconds
    if (value > 100) {
        return (value / 1000).toString();
    }
    return refreshRate.toString();
}

function loadPreset(index) {
    presetSettings = presetsData[index];
    
    // Migrate refreshRate from milliseconds to seconds if needed
    presetSettings.refreshRate = normalizeRefreshRate(presetSettings.refreshRate);

    document.getElementById("presetName").value = presetSettings.presetName;
    document.getElementById("refreshRate").value = presetSettings.refreshRate;
    document.getElementById("tags").value = presetSettings.tags;
    document.getElementById("blacklist").value = presetSettings.blacklist;
    document.getElementById("whitelist").value = presetSettings.whitelist;
    document.getElementById("adultcontent").checked = presetSettings.adultcontent;

    selectedPreset = index;
    
    // Clear temporary search state when loading a preset
    temporarySearchActive = false;
    savedPresetSettings = null;
    localStorage.removeItem("temporarySearch");
    localStorage.removeItem("temporarySearchActive");

    // Reset batch cache when preset changes (tags will be different)
    currentPostBatch = [];
    currentBatchIndex = 0;
    currentBatchPage = 1;
    currentBatchQuery = "";
    // Also clear prefetch state
    prefetchedBatch = [];
    prefetchedPage = null;
    prefetchPromise = null;
    // Invalidate query string cache since preset tags changed
    invalidateQueryStringCache();

    const highlightedPreset = document.querySelector(".presetItem.selected");
    if (highlightedPreset) {
        highlightedPreset.classList.remove("selected");
    }
    presetList.children[index].classList.add("selected");

    localStorage.setItem("selectedPreset", index);
    Logger.log("Preset loaded:", presetSettings.presetName);
    updateDocumentTitle();
}

function savePreset(index) {
    Logger.log(index);
    var NameValue = document.getElementById("presetName").value;
    var refreshRateValue = document.getElementById("refreshRate").value;
    var tagsValue = document.getElementById("tags").value;
    var blacklistValue = document.getElementById("blacklist").value;
    var whitelistValue = document.getElementById("whitelist").value;
    var adultcontentValue = document.getElementById("adultcontent").checked;

    var presetSettings = {
        "presetName": NameValue,
        "refreshRate": refreshRateValue,
        "tags": tagsValue,
        "blacklist": blacklistValue,
        "whitelist": whitelistValue,
        "adultcontent": adultcontentValue,
    };

    presetList.children[index].textContent = NameValue;

    presetsData[index] = presetSettings;

    Logger.log("Preset Saved:", index, NameValue);

    savePresets();
    loadPreset(index);
    closeSettingsPanel();
}

function savePresets() {
    let presetsJSON = JSON.stringify(presetsData);

    localStorage.setItem("presetsData", presetsJSON);
}

function deletePreset(index) {
    presetsData.splice(index, 1);
    presetList.removeChild(presetList.children[index]);
    selectedPreset--;

    loadPreset(selectedPreset);
    savePresets();
}

function resetPresets() {
    Logger.log("Resetting Presets");
    loadPresets(true);
}

globalPresetsButton.addEventListener('click', openPresetSettings);
function openPresetSettings() {
    globalsettingsPanel.style.display = "none";
    creditsPanel.style.display = "none";
    searchPanel.style.display = "none";
    presetSettingsPanel.style.display = "flex";
    globalSettingsButton.classList.remove("selected");
    creditsButton.classList.remove("selected");
    searchButton.classList.remove("selected");
    globalPresetsButton.classList.add("selected");
}

creditsButton.addEventListener('click', openCredits);
function openCredits() {
    globalsettingsPanel.style.display = "none";
    presetSettingsPanel.style.display = "none";
    searchPanel.style.display = "none";
    creditsPanel.style.display = "flex";
    globalSettingsButton.classList.remove("selected");
    globalPresetsButton.classList.remove("selected");
    searchButton.classList.remove("selected");
    creditsButton.classList.add("selected");
}

searchButton.addEventListener('click', openSearchTab);
function openSearchTab() {
    globalsettingsPanel.style.display = "none";
    presetSettingsPanel.style.display = "none";
    creditsPanel.style.display = "none";
    searchPanel.style.display = "flex";
    globalSettingsButton.classList.remove("selected");
    globalPresetsButton.classList.remove("selected");
    creditsButton.classList.remove("selected");
    searchButton.classList.add("selected");
    
    // Clear search fields (refreshRate has default value)
    document.getElementById("searchRefreshRate").value = "10";
    document.getElementById("searchTags").value = "";
    document.getElementById("searchBlacklist").value = "";
    document.getElementById("searchWhitelist").value = "";
    document.getElementById("searchAdultContent").checked = false;
}

document.getElementById('playSearchBtn').addEventListener('click', loadTemporarySearch);
function loadTemporarySearch() {
    // Save current preset settings as backup
    if (!temporarySearchActive) {
        savedPresetSettings = { ...presetSettings };
    }
    
    // Get refresh rate, use default if empty
    const refreshRateValue = document.getElementById("searchRefreshRate").value.trim();
    const refreshRate = refreshRateValue === "" ? "10" : refreshRateValue;
    
    // Create temporary preset from search inputs
    const tempPreset = {
        presetName: "Temporary Search",
        refreshRate: refreshRate,
        tags: document.getElementById("searchTags").value,
        blacklist: document.getElementById("searchBlacklist").value,
        whitelist: document.getElementById("searchWhitelist").value,
        adultcontent: document.getElementById("searchAdultContent").checked
    };
    
    // Set temporary preset as current preset
    presetSettings = tempPreset;
    temporarySearchActive = true;
    
    // Save temporary search to localStorage for persistence across page refreshes
    localStorage.setItem("temporarySearch", JSON.stringify(tempPreset));
    localStorage.setItem("temporarySearchActive", "true");
    
    // Reset batch cache when search changes (tags will be different)
    currentPostBatch = [];
    currentBatchIndex = 0;
    currentBatchPage = 1;
    currentBatchQuery = "";
    // Also clear prefetch state
    prefetchedBatch = [];
    prefetchedPage = null;
    prefetchPromise = null;
    // Invalidate query string cache since preset tags changed
    invalidateQueryStringCache();
    
    // Update document title
    updateDocumentTitle();
    
    Logger.log("Temporary search loaded:", presetSettings.presetName);
    
    // Close settings and start playing
    closeSettingsPanel();
}

document.getElementById('saveSearchAsPresetBtn').addEventListener('click', showPresetNamePrompt);
function showPresetNamePrompt() {
    // Reset the input and error message
    presetNameInput.value = "New Search Preset";
    presetNameError.style.display = "none";
    presetNameError.textContent = "";
    
    // Show the modal
    presetNamePrompt.style.display = "flex";
    
    // Focus the input
    presetNameInput.focus();
    presetNameInput.select();
}

function hidePresetNamePrompt() {
    presetNamePrompt.style.display = "none";
    presetNameInput.value = "";
    presetNameError.style.display = "none";
    presetNameError.textContent = "";
}

function confirmPresetName() {
    let presetName = presetNameInput.value.trim();
    
    // Validate input
    if (presetName === "") {
        presetNameError.textContent = "Preset name cannot be empty!";
        presetNameError.style.display = "block";
        return;
    }
    
    // Check for duplicate names
    const duplicateExists = presetsData.some(preset => preset.presetName === presetName);
    if (duplicateExists) {
        presetNameError.textContent = `A preset named "${presetName}" already exists. Please choose a different name.`;
        presetNameError.style.display = "block";
        return;
    }
    
    // Hide the modal
    hidePresetNamePrompt();
    
    // Get refresh rate, use default if empty
    const refreshRateValue = document.getElementById("searchRefreshRate").value.trim();
    const refreshRate = refreshRateValue === "" ? "10" : refreshRateValue;
    
    // Create new preset from search inputs
    const newPreset = {
        presetName: presetName,
        refreshRate: refreshRate,
        tags: document.getElementById("searchTags").value,
        blacklist: document.getElementById("searchBlacklist").value,
        whitelist: document.getElementById("searchWhitelist").value,
        adultcontent: document.getElementById("searchAdultContent").checked
    };
    
    // Add to presets data
    presetsData.push(newPreset);
    
    // Add to UI
    addPresetItem(newPreset.presetName);
    
    // Save to localStorage
    savePresets();
    
    // Load the newly created preset
    const newPresetIndex = presetsData.length - 1;
    loadPreset(newPresetIndex);
    
    Logger.log("Search saved as preset:", presetName);
    
    // Switch to presets tab to show the result
    openPresetSettings();
}

// Event listeners for the preset name modal
presetNameCancel.addEventListener('click', hidePresetNamePrompt);
presetNameConfirm.addEventListener('click', confirmPresetName);

// Handle Enter key in the input field
presetNameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmPresetName();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hidePresetNamePrompt();
    }
});

// Close modal when clicking outside of it
presetNamePrompt.addEventListener('click', function(e) {
    if (e.target === presetNamePrompt) {
        hidePresetNamePrompt();
    }
});


///////////////////////////////////////////////////////////////HELPER FUNCTIONS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function isWhitelisted(postData) {
    let whitelist = globalSettings.globalwhitelist.split(" ");
    let presetwhitelist = presetSettings.whitelist.split(" ");
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
function isFiletypeAllowed(postData) {
    const filetypelist = config.allowed_filetypes;

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
async function togglePause() {
    // Get the pause icon element
    const pauseIcon = document.getElementById('pauseIcon');
    if (paused) {
        unPause();
    } else {
        pause();
    }
}

//pauses the autoviewer
async function pause() {
    paused = true;
    pauseIcon.style.display = 'block';
    clearTimeout(timeoutId);
    isSearchingForNewImage = false;
    hideLoading();
    updateDocumentTitle();
}

//unpauses the autoviewer. Input true to not search for a new image after unpausing and to instead wait the normal delay 
async function unPause(skipNewSearch = false) {
    if (!isSearchingForNewImage) {
        paused = false;
        pauseIcon.style.display = 'none';
        clearTimeout(timeoutId);
        updateDocumentTitle();
        await imageLoop(skipNewSearch);
    } else {
        Logger.log("Not unpausing, new image is being searched");
    }
}

async function previousImage() {
    // Navigate backward in history (decrement negative position)
    // currentHistoryPos = 0 is newest, -1 is previous, -2 is before that, etc.
    if (currentHistoryPos > -urlHistory.length + 1) {
        pause();
        currentHistoryPos--;
        const pos = getHistoryPosInArray();
        Logger.log('Previous image requested', pos);
        document.getElementById('mainImage').src = urlHistory[pos][0];
    } else {
        Logger.log("Can't go back in history further");
    }
}

async function nextImage() {
    // Navigate forward in history (increment negative position toward 0)
    // When currentHistoryPos reaches 0, we're at the newest image
    if (currentHistoryPos < 0) {
        currentHistoryPos++;
        const pos = getHistoryPosInArray();
        Logger.log('Next image requested', pos);
        document.getElementById('mainImage').src = urlHistory[pos][0];
        if (currentHistoryPos == 0) {
            unPause(true);
        }
    } else {
        Logger.log("Reached newest history item");
        unPause();
    }
}

/**
 * Converts negative history position to array index.
 * 
 * History position system:
 * - currentHistoryPos = 0: newest image (most recent)
 * - currentHistoryPos = -1: previous image
 * - currentHistoryPos = -2: image before previous, etc.
 * 
 * Array indexing:
 * - urlHistory[length-1] = newest image
 * - urlHistory[length-2] = previous image
 * 
 * Formula: arrayIndex = urlHistory.length + currentHistoryPos - 1
 * Example: If history has 10 items and currentHistoryPos = -3:
 *   arrayIndex = 10 + (-3) - 1 = 6 (7th item from start)
 */
function getHistoryPosInArray() {
    return urlHistory.length + currentHistoryPos - 1;
}

function showLoading(showOnTop = false) {
    if (showOnTop) {
        loadingtop.style.display = 'block';
        loadingtop.style.top = "20px";
    } else {
        mainImage.style.display = "none";
        loading.style.display = 'block';
        loading.style.top = "50%";
    }
}

function hideLoading() {
    mainImage.style.display = "block";
    loading.style.display = 'none';
    loadingtop.style.display = 'none';
}

function showNoImagesError() {
    hideLoading();
    Logger.log(`No images found.`);
    noImagesFound.style.display = 'block';
    mainImage.style.display = "none";
}

function hideNoImagesError() {
    noImagesFound.style.display = 'none';
    mainImage.style.display = "block";
}

downloadButton.addEventListener('click', () => { downloadImage(); })
function downloadImage() {
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

function getCurrentId() {
    Logger.log(getHistoryPosInArray() + urlHistory);
    const currentId = urlHistory[getHistoryPosInArray()][1];
    return currentId;
}

function getCurrentFileURL() {
    const currentFileURL = urlHistory[getHistoryPosInArray()][0];
    return currentFileURL;
}

function getCurrentSourceURL() {
    const currentId = getCurrentId();
    return buildPostApiUrl(currentId);
}

sourceButton.addEventListener('click', () => {
    openSource();
});

function openSource() {
    window.open(getCurrentSourceURL());
}

globalSettingsButton.addEventListener('click', openGlobalSettings);
function openGlobalSettings() {
    presetSettingsPanel.style.display = "none";
    creditsPanel.style.display = "none";
    searchPanel.style.display = "none";
    globalsettingsPanel.style.display = "flex";
    globalPresetsButton.classList.remove("selected");
    creditsButton.classList.remove("selected");
    searchButton.classList.remove("selected");
    globalSettingsButton.classList.add("selected");
    loadGlobalSettings();
}

function loadGlobalSettings() {
    let globalSettingsJSON = localStorage.getItem("globalSettings");

    if (globalSettingsJSON === null || globalSettingsJSON === undefined) {
        globalSettings = {
            "username": '',
            "apikey": '',
            "globaltags": config.global_tags.join(" "),
            "globalblacklist": config.global_blacklist.join(" "),
            "globalwhitelist": config.global_whitelist.join(" "),
            "batchSize": DEFAULT_BATCH_SIZE,
            "debug": config.debug,
        };
    } else {
        globalSettings = JSON.parse(globalSettingsJSON);
        // Set default batchSize for existing users who don't have it
        if (globalSettings.batchSize === undefined || globalSettings.batchSize === null) {
            globalSettings.batchSize = DEFAULT_BATCH_SIZE;
        }
        // Set default debug for existing users
        if (globalSettings.debug === undefined || globalSettings.debug === null) {
            globalSettings.debug = (config && config.debug) || false;
        }
    }
    usernameInput.value = globalSettings.username;
    apiKeyInput.value = globalSettings.apikey;
    document.getElementById("globaltags").value = globalSettings.globaltags;
    document.getElementById("globalblacklist").value = globalSettings.globalblacklist;
    document.getElementById("globalwhitelist").value = globalSettings.globalwhitelist;
    document.getElementById("batchSize").value = globalSettings.batchSize;
    document.getElementById("debugMode").checked = globalSettings.debug;

    Logger.log("loaded global settings");
}

document.getElementById("saveGlobalSettings").addEventListener('click', saveGlobalSettings);
function saveGlobalSettings() {
    let globaltagsValue = document.getElementById("globaltags").value;
    let globalblacklistValue = document.getElementById("globalblacklist").value;
    let globalwhitelistValue = document.getElementById("globalwhitelist").value;
    let batchSizeValue = parseInt(document.getElementById("batchSize").value) || DEFAULT_BATCH_SIZE;
    let debugModeValue = document.getElementById("debugMode").checked;

    // Check if batch size changed - if so, reset cache to avoid pagination issues
    const oldBatchSize = globalSettings ? (globalSettings.batchSize || DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
    const batchSizeChanged = oldBatchSize !== batchSizeValue;

    let loadedglobalSettings = {
        "username": usernameInput.value,
        "apikey": apiKeyInput.value,
        "globaltags": globaltagsValue,
        "globalblacklist": globalblacklistValue,
        "globalwhitelist": globalwhitelistValue,
        "batchSize": batchSizeValue,
        "debug": debugModeValue,
    };

    globalSettings = loadedglobalSettings;
    let globalSettingsJson = JSON.stringify(globalSettings);

    localStorage.setItem("globalSettings", globalSettingsJson);
    
    // Clear temporary search state when global settings change
    temporarySearchActive = false;
    savedPresetSettings = null;
    localStorage.removeItem("temporarySearch");
    localStorage.removeItem("temporarySearchActive");

    // Invalidate query string cache since global settings changed
    invalidateQueryStringCache();

    // Reset cache if batch size changed to ensure consistent pagination
    if (batchSizeChanged) {
        Logger.log(`[saveGlobalSettings] Batch size changed from ${oldBatchSize} to ${batchSizeValue}, resetting cache`);
        currentPostBatch = [];
        currentBatchIndex = 0;
        currentBatchPage = 1;
        prefetchedBatch = [];
        prefetchedPage = null;
        prefetchPromise = null;
    }

    closeSettingsPanel();
}

// Event handler for visibility change
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Page is visible
        Logger.log('Page is visible');
        pageIsHidden = false;
    } else if (document.visibilityState === 'hidden') {
        // Page is hidden
        Logger.log('Page is hidden');
        pageIsHidden = true;
        // Clear timeouts when page becomes hidden to prevent unnecessary operations
        clearTimeout(timeoutId);
        clearTimeout(hideTimeout);
    }
}

// Function to hide the cursor after a period of inactivity
function hideCursor() {
    document.body.style.cursor = 'none';
    cursorHidden = true;
}

// Function to show the cursor
function showCursor() {
    document.body.style.cursor = 'auto';
    cursorHidden = false;
}

// Function to update the document title based on preset and pause state
function updateDocumentTitle() {
    if (typeof presetSettings === 'undefined' || !presetSettings) {
        document.title = 'e621 Slideshow';
        return;
    }
    
    const presetName = presetSettings.presetName || 'Unknown Preset';
    
    if (paused) {
        document.title = `e621 AutoViewer (Paused) - ${presetName}`;
    } else {
        document.title = `${presetName} - e621 AutoViewer`;
    }
}

///////////////////////////////////////////////////////////////AUTOCOMPLETE/////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const AUTOCOMPLETE_API_URL = "https://e621.net/tags/autocomplete.json";
const TAG_CATEGORIES = {
    0: "tag-general",
    1: "tag-artist",
    3: "tag-copyright",
    4: "tag-character",
    5: "tag-species",
    6: "tag-invalid",
    7: "tag-meta",
    8: "tag-lore"
};

function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // specific fix for browser autocomplete popups
    input.setAttribute("autocomplete", "off");

    // Wrap input to position dropdown if not already wrapped
    if (!input.parentNode.classList.contains('autocomplete-container')) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("autocomplete-container");
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        wrapper.style.flexGrow = "1";
        input.style.width = "100%";
        input.style.boxSizing = "border-box";
    }

    let currentFocus = -1;
    let debounceTimer;

    input.addEventListener("input", function (e) {
        const val = this.value;
        const cursorPosition = this.selectionStart;

        // Find the word being typed
        const textBeforeCursor = val.slice(0, cursorPosition);
        const textAfterCursor = val.slice(cursorPosition);

        const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
        const nextSpaceIndex = textAfterCursor.indexOf(" ");

        const start = lastSpaceIndex + 1;
        const end = (nextSpaceIndex === -1) ? val.length : cursorPosition + nextSpaceIndex;

        const currentWord = val.slice(start, end);

        closeAllLists();
        if (!currentWord || currentWord.length < 2) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchSuggestions(currentWord, this, start, end);
        }, 300);
    });

    input.addEventListener("keydown", function (e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");

        if (x) {
            let items = [];
            for (let i = 0; i < x.length; i++) {
                if (x[i].classList.contains("autocomplete-item")) items.push(x[i]);
            }
            x = items;
        }

        if (e.key === "ArrowDown") {
            currentFocus++;
            addActive(x);
        } else if (e.key === "ArrowUp") {
            currentFocus--;
            addActive(x);
        } else if (e.key === "Enter") {
            if (currentFocus > -1 && x) {
                e.preventDefault();
                x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        if (!x || x.length === 0) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
        x[currentFocus].scrollIntoView({ block: "nearest" });
    }

    function removeActive(x) {
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    async function fetchSuggestions(query, inp, wordStart, wordEnd) {
        try {
            const response = await fetch(`${AUTOCOMPLETE_API_URL}?search[name_matches]=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': 'e621AutoViewer/1.0 (by user)'
                }
            });
            if (!response.ok) return;
            const data = await response.json();

            if (data.length === 0) return;

            // Check if input is still focused
            if (document.activeElement !== inp) return;

            const listDiv = document.createElement("div");
            listDiv.setAttribute("id", inp.id + "autocomplete-list");
            listDiv.setAttribute("class", "autocomplete-items");

            // Append to wrapper
            // input is inside wrapper.
            inp.parentNode.appendChild(listDiv);

            // Raise Z-Index of the parent tooltip container so the dropdown renders over subsequent inputs
            const tooltipParent = inp.closest('.tooltip');
            if (tooltipParent) {
                tooltipParent.style.zIndex = "10000";
            }

            data.forEach(tag => {
                const itemDiv = document.createElement("div");
                itemDiv.classList.add("autocomplete-item");

                // Color based on category
                const categoryClass = TAG_CATEGORIES[tag.category] || "tag-general";

                // Name part
                const nameSpan = document.createElement("span");
                nameSpan.classList.add(categoryClass);
                nameSpan.textContent = tag.name;

                if (tag.antecedent_name) {
                    nameSpan.textContent = tag.antecedent_name + " \u2192 " + tag.name;
                }

                // Count part
                const countSpan = document.createElement("span");
                countSpan.classList.add("tag-count");
                countSpan.classList.add(categoryClass);
                countSpan.textContent = formatCount(tag.post_count);

                itemDiv.appendChild(nameSpan);
                itemDiv.appendChild(countSpan);

                itemDiv.addEventListener("click", function (e) {
                    // Replace the word
                    const fullText = inp.value;
                    const pre = fullText.slice(0, wordStart);
                    const post = fullText.slice(wordEnd);
                    // Add space after tag
                    inp.value = pre + tag.name + " " + post;

                    closeAllLists();
                    // Set cursor after the new tag
                    const newCursorPos = pre.length + tag.name.length + 1;
                    inp.setSelectionRange(newCursorPos, newCursorPos);
                    inp.focus();

                    // Trigger input event
                    inp.dispatchEvent(new Event('input'));
                    inp.dispatchEvent(new Event('change'));
                });

                listDiv.appendChild(itemDiv);
            });
        } catch (e) {
            Logger.error("Autocomplete error:", e);
        }
    }

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != input) {
                x[i].parentNode.removeChild(x[i]);
            }
        }

        // Reset Z-Index of the parent tooltip container
        // Only if we are stripping the dropdown for *this* input, or if we cleaned up *all* lists (which we just did)
        // Since closeAllLists removes ALL autocompletes (except excludes), we can safely reset z-index for this input
        // provided the list is gone.
        // Actually, straightforward logic: if list is closed, z-index returns to normal.
        const tooltipParent = input.closest('.tooltip');
        if (tooltipParent) {
            tooltipParent.style.zIndex = "";
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}

function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n;
}

// Initialize autocomplete
document.addEventListener('DOMContentLoaded', function () {
    const ids = ["globaltags", "globalblacklist", "globalwhitelist", "tags", "blacklist", "whitelist", "searchTags", "searchBlacklist", "searchWhitelist"];
    ids.forEach(id => setupAutocomplete(id));
});