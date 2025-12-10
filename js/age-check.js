import { state } from './state.js';
import Logger from './logger.js';
import { addKeyEvents } from './input-handler.js';

//Listen to button presses on age check
export function setupAgeCheck() {
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
}

//Pass from age check to main autoviewer
async function ageCheckPassed() {
    state.adultMode = true;
    const agePrompt = document.getElementById('agePrompt');
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    const { initialize } = await import('./config-loader.js');
    await initialize();
}

async function ageCheckNotPassed() {
    state.adultMode = false;
    const agePrompt = document.getElementById('agePrompt');
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    const { initialize } = await import('./config-loader.js');
    await initialize();
}
