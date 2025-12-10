// Main entry point for the application
import { setupAgeCheck } from './age-check.js';
import { setupAutocompleteForAll } from './autocomplete.js';
import { setupPresetManager } from './preset-manager.js';
import { setupSettingsPanel } from './settings-manager.js';
import { setupMouseTracking } from './ui-controls.js';
import { downloadImage, openSource } from './helpers.js';
import { elements } from './dom-elements.js';

// Setup all event listeners and initialize features
setupAgeCheck();
setupAutocompleteForAll();
setupPresetManager();
setupSettingsPanel();
setupMouseTracking();

// Setup download and source button handlers
elements.downloadButton.addEventListener('click', () => { downloadImage(); });
elements.sourceButton.addEventListener('click', () => { openSource(); });
