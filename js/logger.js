/*
 * Logger class to wrapper console.log and allow enabling/disabling via settings.
 */
import { state } from './state.js';

const Logger = {
    isDebug: () => {
        // Check localStorage first (can be set via console: localStorage.setItem('debug', 'true'))
        if (localStorage.getItem('debug') === 'true') return true;

        // Check global settings if loaded
        if (state.globalSettings && state.globalSettings.debug === true) return true;

        // Check config if loaded
        if (state.config && state.config.debug === true) return true;

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

export default Logger;
