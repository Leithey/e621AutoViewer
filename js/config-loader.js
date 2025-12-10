import { state } from './state.js';
import Logger from './logger.js';
import { showLoading } from './ui-controls.js';
import { imageLoop } from './image-loop.js';
import { handleVisibilityChange } from './helpers.js';
import { loadPresets } from './preset-manager.js';
import { loadGlobalSettings } from './settings-manager.js';

//loads config.json
export async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch config.json: ${response.status}`);
        }
        state.config = await response.json();
        await loadPresets();
        await loadGlobalSettings();
    } catch (error) {
        Logger.error('Error loading config:', error);
        return {}; // Return an empty object in case of error
    }
    Logger.log("Config loaded");
}

//this is called to load the config and initialize the image loop.
export async function initialize() {
    try {
        showLoading();
        await loadConfig();
        imageLoop();

        document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (error) {
        Logger.error("Error:", error);
    }
}
