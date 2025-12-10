import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { ERROR_TYPES, MAX_RECURSION_DEPTH, MAX_PAGES_TO_SEARCH, DEFAULT_BATCH_SIZE } from './constants.js';
import { buildQueryString, buildPostsApiUrl } from './api-client.js';
import { isWhitelisted, isFiletypeAllowed } from './helpers.js';
import { showNoImagesError } from './ui-controls.js';

// Prefetch the next batch in the background
export async function prefetchNextBatch() {
    // Don't prefetch if already prefetching, paused, or page is hidden
    if (state.prefetchPromise !== null || state.paused || state.pageIsHidden) {
        return;
    }

    // Don't prefetch if we don't have a current batch or query
    if (state.currentPostBatch.length === 0 || state.currentBatchQuery === "") {
        return;
    }

    // Don't prefetch if we already have a prefetched batch
    if (state.prefetchedBatch.length > 0) {
        return;
    }

    const nextPage = state.currentBatchPage + 1;
    const batchSize = (state.globalSettings && state.globalSettings.batchSize) || DEFAULT_BATCH_SIZE; // Use configured batch size

    // Build query string including tags and blacklist
    const queryString = buildQueryString();

    // Verify query hasn't changed before starting prefetch
    if (state.currentBatchQuery !== queryString) {
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
    if (state.globalSettings.username.length > 0 && state.globalSettings.apikey.length > 0) {
        headerParams.Authorization = `Basic ` + btoa(`${state.globalSettings.username}:${state.globalSettings.apikey}`);
    }

    // Create prefetch promise
    state.prefetchPromise = (async () => {
        try {
            Logger.log(`[prefetchNextBatch] Prefetching page ${nextPage} (${batchSize} posts)`);
            const response = await fetch(url, { headers: headerParams });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const postData = await response.json();

            // Only store if query hasn't changed and we're not paused
            if (state.currentBatchQuery === queryString && !state.paused && !state.pageIsHidden) {
                state.prefetchedBatch = postData.posts;
                state.prefetchedPage = nextPage;
                Logger.log(`[prefetchNextBatch] Prefetch completed (page ${nextPage}, ${postData.posts.length} posts)`);
            } else {
                Logger.log(`[prefetchNextBatch] Prefetch completed but discarded (query changed or paused)`);
            }
        } catch (error) {
            Logger.log(`[prefetchNextBatch] Prefetch failed:`, error);
            // Don't throw - prefetch failures shouldn't break main flow
        } finally {
            state.prefetchPromise = null;
        }
    })();

    // Don't await - fire and forget
    return state.prefetchPromise;
}

//Get the image url of a new image with the matching criteria
export async function getNewImageUrl(recursionDepth = 0, page = null, batchSize = null) {
    const maxRecursionDepth = MAX_RECURSION_DEPTH; // Prevent infinite recursion - reduced from 50
    const maxPages = MAX_PAGES_TO_SEARCH; // Maximum pages to try before giving up

    // Build query string including tags and blacklist
    const queryString = buildQueryString();

    // Check if query changed - if so, reset cache and prefetch
    if (state.currentBatchQuery !== queryString) {
        Logger.log(`[getNewImageUrl] Query changed, resetting cache. Old: "${state.currentBatchQuery}", New: "${queryString}"`);
        state.currentPostBatch = [];
        state.currentBatchIndex = 0;
        state.currentBatchPage = 1;
        state.currentBatchQuery = queryString;
        state.prefetchedBatch = [];
        state.prefetchedPage = null;
        state.prefetchPromise = null;
    }

    // Use cached batch if available and we haven't exhausted it
    if (state.currentPostBatch.length > 0 && state.currentBatchIndex < state.currentPostBatch.length) {
        Logger.log(`[getNewImageUrl] Using cached batch (index: ${state.currentBatchIndex}/${state.currentPostBatch.length}, page: ${state.currentBatchPage})`);
        // Continue processing from cached batch
        return processBatch(state.currentPostBatch, state.currentBatchIndex, state.currentBatchPage, recursionDepth);
    }

    // Check for prefetched batch first before making new API call
    if (state.prefetchedBatch.length > 0 && state.prefetchedPage !== null) {
        Logger.log(`[getNewImageUrl] Using prefetched batch (page ${state.prefetchedPage}, ${state.prefetchedBatch.length} posts)`);
        // Move prefetched batch to current batch
        state.currentPostBatch = state.prefetchedBatch;
        state.currentBatchIndex = 0;
        state.currentBatchPage = state.prefetchedPage;
        // Clear prefetched batch
        state.prefetchedBatch = [];
        state.prefetchedPage = null;
        // Process the prefetched batch
        return processBatch(state.currentPostBatch, 0, state.currentBatchPage, recursionDepth);
    }

    // Need to fetch a new batch
    // Use consistent batch size from global settings to avoid missing posts
    const determinedBatchSize = batchSize !== null ? batchSize : ((state.globalSettings && state.globalSettings.batchSize) || DEFAULT_BATCH_SIZE);

    // If batch is exhausted and no explicit page provided, fetch next page
    // Otherwise use the explicitly provided page (for recursive calls)
    const pageToFetch = page !== null ? page : (state.currentPostBatch.length > 0 ? state.currentBatchPage + 1 : 1);
    if (pageToFetch > maxPages) {
        Logger.error(`[getNewImageUrl] Max pages (${maxPages}) reached, returning null`);
        return null;
    }
    if (recursionDepth > maxRecursionDepth) {
        Logger.error(`[getNewImageUrl] Max recursion depth (${maxRecursionDepth}) reached, returning null`);
        return null;
    }

    Logger.log(`[getNewImageUrl] Fetching new batch (recursion depth: ${recursionDepth}, page: ${pageToFetch}, batch size: ${determinedBatchSize}, history size: ${state.urlHistory.length})`);

    const params = {
        "tags": queryString,
        "limit": determinedBatchSize,
        "page": pageToFetch,
        "client": '_client=e621AutoViewer (by Leithey)'
    }

    const queryParams = new URLSearchParams(params).toString();

    const url = buildPostsApiUrl(queryParams);

    let headerParams = {};

    if (state.globalSettings.username.length > 0 && state.globalSettings.apikey.length > 0) {
        headerParams.Authorization = `Basic ` + btoa(`${state.globalSettings.username}:${state.globalSettings.apikey}`);
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
            elements.noImagesFound.style.display = 'none';
        }

        // Cache the batch
        state.currentPostBatch = postData.posts;
        state.currentBatchIndex = 0;
        state.currentBatchPage = pageToFetch;

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

        if (state.paused || state.pageIsHidden) {
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
        } else if (state.urlHistorySet.has(post.id)) {
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
            state.currentBatchIndex = i + 1;
            break;
        } else {
            Logger.log(`[processBatch] Post ${i} (ID: ${post.id}): Not whitelisted`);
            skippedReasons.notWhitelisted++;
            skippedCount++;
            continue;
        }
    }

    Logger.log(`[processBatch] Processed ${posts.length - startIndex} posts (from index ${startIndex}) - Skipped: ${skippedCount} (noUrl: ${skippedReasons.noUrl}, wrongFiletype: ${skippedReasons.wrongFiletype}, alreadyInHistory: ${skippedReasons.alreadyInHistory}, notWhitelisted: ${skippedReasons.notWhitelisted})`);

    if (state.paused || state.pageIsHidden) {
        Logger.log(`[processBatch] Paused or page hidden after processing, aborting`);
        throw new Error(ERROR_TYPES.PAUSED);
    }
    if (fileUrl === undefined) {
        // All posts in this batch were skipped, fetch next page
        const nextPage = page + 1;
        Logger.log(`[processBatch] No valid image found in batch (page ${page}), trying next page (${nextPage})`);
        // Clear cache so we fetch fresh batch
        state.currentPostBatch = [];
        state.currentBatchIndex = 0;
        // Also clear prefetch state since we're moving to a new page
        state.prefetchedBatch = [];
        state.prefetchedPage = null;
        state.prefetchPromise = null;
        return getNewImageUrl(recursionDepth + 1, nextPage); //no fitting image found, try next page
    } else {
        Logger.log(`[processBatch] SUCCESS - New Image Found! Score: ${post.score.total}, URL: ${fileUrl}, ID: ${fileId}`);
        state.urlHistory.push([fileUrl, fileId]);
        state.urlHistorySet.add(fileId);
        state.currentHistoryPos--;
        Logger.log(`[processBatch] Added to history. History size now: ${state.urlHistory.length}, cache index now: ${state.currentBatchIndex}`);

        // Trigger prefetching when we're halfway through the current batch (50% consumed)
        if (state.currentBatchIndex >= state.currentPostBatch.length * 0.5) {
            Logger.log(`[processBatch] Halfway through batch (${state.currentBatchIndex}/${state.currentPostBatch.length}), triggering prefetch`);
            prefetchNextBatch(); // Fire and forget - don't await
        }

        return fileUrl;
    }
}
