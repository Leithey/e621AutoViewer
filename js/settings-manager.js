import { state } from './state.js';
import { elements } from './dom-elements.js';
import Logger from './logger.js';
import { DEFAULT_BATCH_SIZE } from './constants.js';
import { pause, unPause } from './helpers.js';
import { invalidateQueryStringCache } from './api-client.js';
export function openSettingsPanel() {
    state.settingsPanelOpen = true;
    elements.settingsPanel.style.display = 'flex';
    clearTimeout(state.hideTimeout); // Prevent hiding UI while settings panel is open
    pause();
    Logger.log("opening settings");
    // Open Search tab by default
    openSearchTab();
}

export function openSearchTab() {
    elements.globalsettingsPanel.style.display = "none";
    elements.presetSettingsPanel.style.display = "none";
    elements.creditsPanel.style.display = "none";
    elements.searchPanel.style.display = "flex";
    elements.globalSettingsButton.classList.remove("selected");
    elements.globalPresetsButton.classList.remove("selected");
    elements.creditsButton.classList.remove("selected");
    elements.searchButton.classList.add("selected");
    
    // Restore search fields from temporary search if active, otherwise set defaults or preserve current values
    const savedTemporarySearch = localStorage.getItem("temporarySearch");
    const savedTemporarySearchActive = localStorage.getItem("temporarySearchActive");
    
    if (savedTemporarySearchActive === "true" && savedTemporarySearch) {
        try {
            // Restore from localStorage temporary search (source of truth)
            const tempPreset = JSON.parse(savedTemporarySearch);
            document.getElementById("searchRefreshRate").value = tempPreset.refreshRate || "10";
            document.getElementById("searchTags").value = tempPreset.tags || "";
            document.getElementById("searchBlacklist").value = tempPreset.blacklist || "";
            document.getElementById("searchWhitelist").value = tempPreset.whitelist || "";
            document.getElementById("searchAdultContent").checked = tempPreset.adultcontent || false;
        } catch (error) {
            Logger.error("Error restoring temporary search from localStorage:", error);
            // If parsing fails, set defaults
            const searchRefreshRate = document.getElementById("searchRefreshRate");
            const searchAdultContent = document.getElementById("searchAdultContent");
            if (!searchRefreshRate.value || searchRefreshRate.value.trim() === "") {
                searchRefreshRate.value = "10";
            }
            searchAdultContent.checked = true;
        }
    } else {
        // No temporary search active - set defaults if fields are empty, otherwise preserve current values
        const searchRefreshRate = document.getElementById("searchRefreshRate");
        const searchAdultContent = document.getElementById("searchAdultContent");
        const searchTags = document.getElementById("searchTags");
        
        // Set default refresh rate if empty
        if (!searchRefreshRate.value || searchRefreshRate.value.trim() === "") {
            searchRefreshRate.value = "10";
        }
        
        // Set default adult content to checked if tags field is empty (indicating a fresh/new search)
        if (!searchTags.value || searchTags.value.trim() === "") {
            searchAdultContent.checked = true;
        }
        // Otherwise preserve the current checkbox state
    }
}

export function openPresetSettings() {
    elements.globalsettingsPanel.style.display = "none";
    elements.creditsPanel.style.display = "none";
    elements.searchPanel.style.display = "none";
    elements.presetSettingsPanel.style.display = "flex";
    elements.globalSettingsButton.classList.remove("selected");
    elements.creditsButton.classList.remove("selected");
    elements.searchButton.classList.remove("selected");
    elements.globalPresetsButton.classList.add("selected");
}

export function openCredits() {
    elements.globalsettingsPanel.style.display = "none";
    elements.presetSettingsPanel.style.display = "none";
    elements.searchPanel.style.display = "none";
    elements.creditsPanel.style.display = "flex";
    elements.globalSettingsButton.classList.remove("selected");
    elements.globalPresetsButton.classList.remove("selected");
    elements.searchButton.classList.remove("selected");
    elements.creditsButton.classList.add("selected");
}

export function closeSettingsPanel() {
    state.settingsPanelOpen = false;
    elements.settingsPanel.style.display = 'none';
    unPause();
    Logger.log("closing settings");
}

export function openGlobalSettings() {
    elements.presetSettingsPanel.style.display = "none";
    elements.creditsPanel.style.display = "none";
    elements.searchPanel.style.display = "none";
    elements.globalsettingsPanel.style.display = "flex";
    elements.globalPresetsButton.classList.remove("selected");
    elements.creditsButton.classList.remove("selected");
    elements.searchButton.classList.remove("selected");
    elements.globalSettingsButton.classList.add("selected");
    loadGlobalSettings();
}

export function loadGlobalSettings() {
    let globalSettingsJSON = localStorage.getItem("globalSettings");

    if (globalSettingsJSON === null || globalSettingsJSON === undefined) {
        state.globalSettings = {
            "username": '',
            "apikey": '',
            "globaltags": state.config.global_tags.join(" "),
            "globalblacklist": state.config.global_blacklist.join(" "),
            "globalwhitelist": state.config.global_whitelist.join(" "),
            "batchSize": DEFAULT_BATCH_SIZE,
            "debug": state.config.debug,
        };
    } else {
        state.globalSettings = JSON.parse(globalSettingsJSON);
        // Set default batchSize for existing users who don't have it
        if (state.globalSettings.batchSize === undefined || state.globalSettings.batchSize === null) {
            state.globalSettings.batchSize = DEFAULT_BATCH_SIZE;
        }
        // Set default debug for existing users
        if (state.globalSettings.debug === undefined || state.globalSettings.debug === null) {
            state.globalSettings.debug = (state.config && state.config.debug) || false;
        }
    }
    elements.usernameInput.value = state.globalSettings.username;
    elements.apiKeyInput.value = state.globalSettings.apikey;
    document.getElementById("globaltags").value = state.globalSettings.globaltags;
    document.getElementById("globalblacklist").value = state.globalSettings.globalblacklist;
    document.getElementById("globalwhitelist").value = state.globalSettings.globalwhitelist;
    document.getElementById("batchSize").value = state.globalSettings.batchSize;
    document.getElementById("debugMode").checked = state.globalSettings.debug;

    Logger.log("loaded global settings");
}

export function saveGlobalSettings() {
    let globaltagsValue = document.getElementById("globaltags").value;
    let globalblacklistValue = document.getElementById("globalblacklist").value;
    let globalwhitelistValue = document.getElementById("globalwhitelist").value;
    let batchSizeValue = parseInt(document.getElementById("batchSize").value) || DEFAULT_BATCH_SIZE;
    let debugModeValue = document.getElementById("debugMode").checked;

    // Check if batch size changed - if so, reset cache to avoid pagination issues
    const oldBatchSize = state.globalSettings ? (state.globalSettings.batchSize || DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
    const batchSizeChanged = oldBatchSize !== batchSizeValue;

    let loadedglobalSettings = {
        "username": elements.usernameInput.value,
        "apikey": elements.apiKeyInput.value,
        "globaltags": globaltagsValue,
        "globalblacklist": globalblacklistValue,
        "globalwhitelist": globalwhitelistValue,
        "batchSize": batchSizeValue,
        "debug": debugModeValue,
    };

    state.globalSettings = loadedglobalSettings;
    let globalSettingsJson = JSON.stringify(state.globalSettings);

    localStorage.setItem("globalSettings", globalSettingsJson);
    
    // Clear temporary search state when global settings change
    state.temporarySearchActive = false;
    state.savedPresetSettings = null;
    localStorage.removeItem("temporarySearch");
    localStorage.removeItem("temporarySearchActive");

    // Invalidate query string cache since global settings changed
    invalidateQueryStringCache();

    // Reset cache if batch size changed to ensure consistent pagination
    if (batchSizeChanged) {
        Logger.log(`[saveGlobalSettings] Batch size changed from ${oldBatchSize} to ${batchSizeValue}, resetting cache`);
        state.currentPostBatch = [];
        state.currentBatchIndex = 0;
        state.currentBatchPage = 1;
        state.prefetchedBatch = [];
        state.prefetchedPage = null;
        state.prefetchPromise = null;
    }

    closeSettingsPanel();
}

export function setupSettingsPanel() {
    elements.settingsButton.addEventListener('click', () => {
        if (!state.settingsPanelOpen) {
            openSettingsPanel();
        } else {
            closeSettingsPanel();
        }
    });

    document.getElementById('closesettingsbutton').addEventListener('click', closeSettingsPanel);
    elements.globalSettingsButton.addEventListener('click', openGlobalSettings);
    elements.globalPresetsButton.addEventListener('click', openPresetSettings);
    elements.creditsButton.addEventListener('click', openCredits);
    elements.searchButton.addEventListener('click', openSearchTab);
    document.getElementById("saveGlobalSettings").addEventListener('click', saveGlobalSettings);
}
