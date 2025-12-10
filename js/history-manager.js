import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { pause, unPause } from './helpers.js';
import { getHistoryPosInArray } from './helpers.js';

export async function previousImage() {
    // Navigate backward in history (decrement negative position)
    // currentHistoryPos = 0 is newest, -1 is previous, -2 is before that, etc.
    if (state.currentHistoryPos > -state.urlHistory.length + 1) {
        await pause();
        state.currentHistoryPos--;
        const pos = getHistoryPosInArray();
        Logger.log('Previous image requested', pos);
        elements.mainImage.src = state.urlHistory[pos][0];
    } else {
        Logger.log("Can't go back in history further");
    }
}

export async function nextImage() {
    // Navigate forward in history (increment negative position toward 0)
    // When currentHistoryPos reaches 0, we're at the newest image
    if (state.currentHistoryPos < 0) {
        state.currentHistoryPos++;
        const pos = getHistoryPosInArray();
        Logger.log('Next image requested', pos);
        elements.mainImage.src = state.urlHistory[pos][0];
        if (state.currentHistoryPos == 0) {
            await unPause(true);
        }
    } else {
        Logger.log("Reached newest history item");
        await unPause();
    }
}
