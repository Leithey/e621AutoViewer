// Error type constants for standardized error handling
export const ERROR_TYPES = {
    PAUSED: 'PAUSED',
    NO_IMAGES: 'NO_IMAGES',
    IMAGE_LOAD_FAILED: 'IMAGE_LOAD_FAILED',
    HTTP_ERROR: 'HTTP_ERROR'
};

// Configuration constants
export const MAX_RECURSION_DEPTH = 10;
export const MAX_PAGES_TO_SEARCH = 100;
export const PREFETCH_THRESHOLD_PERCENTAGE = 0.5; // Trigger prefetch at 50% of batch consumed
export const SWIPE_THRESHOLD_PIXELS = 10; // Minimum swipe distance to trigger navigation
export const MOUSE_HIDE_TIMEOUT_MS = 1000; // Milliseconds before hiding cursor/buttons
export const DEFAULT_BATCH_SIZE = 25;
