import { state } from './state.js';

// Build complete query string including tags and blacklist
export function buildQueryString() {
    // Return cached query string if available
    if (state.cachedQueryString !== null) {
        return state.cachedQueryString;
    }

    // Combine global and preset tags
    let tags = state.globalSettings.globaltags.split(" ");
    tags = tags.concat(state.presetSettings.tags.split(" "));
    tags = tags.filter(tag => tag.trim() !== "");

    // Combine global and preset blacklist tags, prefix with '-'
    let blacklist = state.globalSettings.globalblacklist.split(" ");
    let presetblacklist = state.presetSettings.blacklist.split(" ");
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
    state.cachedQueryString = allTags.join(' ');
    return state.cachedQueryString;
}

// Invalidate the query string cache (call when settings change)
export function invalidateQueryStringCache() {
    state.cachedQueryString = null;
}

// Get the base API URL based on adult mode and preset settings
export function getApiBaseUrl() {
    if (state.adultMode && state.presetSettings.adultcontent) {
        return state.config.url_e621;
    } else {
        return state.config.url_e926;
    }
}

// Build complete API URL for posts endpoint
export function buildPostsApiUrl(queryParams) {
    return `${getApiBaseUrl()}/posts.json/?${queryParams}`;
}

// Build API URL for a specific post
export function buildPostApiUrl(postId) {
    return `${getApiBaseUrl()}/posts/${postId}`;
}
