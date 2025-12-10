// Global application state
export const state = {
    adultMode: false,
    config: null,
    timeoutId: null,
    paused: false,
    urlHistory: [], // Array in Array. Element 0 is the direct fileName, Element 1 is the fileId
    urlHistorySet: new Set(), // Set for O(1) history lookups by fileId
    currentHistoryPos: 0,
    pageIsHidden: false,
    hideTimeout: null,
    cursorHidden: false,
    mouseMoveTimeout: null,
    isSearchingForNewImage: false,
    firstImageLoaded: false,
    settingsPanelOpen: false,
    presetsData: [],
    globalSettings: null,
    selectedPreset: 0,
    presetSettings: null,
    temporarySearchActive: false,
    savedPresetSettings: null,
    // Batch caching for efficient API usage
    currentPostBatch: [],
    currentBatchIndex: 0,
    currentBatchPage: 1,
    currentBatchQuery: "", // Track query to detect when tags change
    // Prefetching state variables
    prefetchPromise: null, // Promise for ongoing prefetch operation
    prefetchedBatch: [], // Array to store prefetched posts
    prefetchedPage: null, // Page number of prefetched batch
    // Query string caching
    cachedQueryString: null // Cached query string to avoid redundant building
};
