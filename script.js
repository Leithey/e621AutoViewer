//TODO: 
// Import/Export buttons
// Make the save/delete buttons always visible and not scale with the rest
// credit to keru: Favorite images to e621 or locally?
// credit to keru: zoom in somehow, like scrollwheel and pan
// Video Support

let adultMode = false;

let config;
let timeoutId;
let paused = false;
let urlHistory = []; //Array in Array. Element 0 is the direct fileName, Element 1 is the fileId, Element 2 is the favorited status
let currentHistoryPos = 0;
let pageIsHidden;
let hideTimeout;
let cursorHidden = false;
let mouseMoveTimeout;
let isSearchingForNewImage;
let firstImageLoaded = false;
let settingsPanelOpen = false;
let presetsData = [];
let globalSettings;
let selectedPreset = 0;
let presetSettings;
let showFavButton = false;

const settingsButton = document.getElementById('settingsButtonDiv');
const mainImage = document.getElementById("mainImage");
const background = document.getElementById('background');
const settingsPanel = document.getElementById('settingsPanel');
const loading = document.getElementById('loading');
const loadingtop = document.getElementById('loadingtop');
const sourceButton = document.getElementById('sourceButton');
const downloadButton = document.getElementById('downloadButton');
const favoriteButton = document.getElementById('favoriteButton');
const bottomCenterButtons = document.getElementById('bottomCenterButtons');
const globalSettingsButton = document.getElementById('globalsettingsbutton');
const globalPresetsButton = document.getElementById('presetsettingsbutton');
const creditsButton = document.getElementById('creditsbutton');
const presetList = document.getElementById("presetList");
const presetSettingsPanel = document.getElementById("presetsettingspanel");
const globalsettingsPanel = document.getElementById("globalsettingspanel");
const creditsPanel = document.getElementById('creditsPanel');
const usernameInput = document.getElementById('username');
const apiKeyInput = document.getElementById('apikey');
const noImagesFound = document.getElementById('noimages');

///////////////////////////////////////////////////////////////INITIALIZATION/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//loads config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch config.json: ${response.status}`);
        }
        config = await response.json();
        await loadPresets();
        await loadGlobalSettings();
    } catch (error) {
        console.error('Error loading config:', error);
        return {}; // Return an empty object in case of error
    }
    console.log("Config loaded");
}

//this is called to load the config and initialize the image loop.
async function initialize() {
    try {
        showLoading();
        await loadConfig();
        imageLoop();
        openCredits();

        document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (error) {
        console.error("Error:", error);
    }
}

///////////////////////////////////////////////////////////////////MAIN FUNCTIONS/////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//recursive function that gets a new image and apply it to the screen, then waits and repeats
async function imageLoop(skipNewSearch = false){
    try {
        if (!skipNewSearch && !isSearchingForNewImage) {
            isSearchingForNewImage = true;
            imageUrl = await getNewImageUrl();
            if (imageUrl !== null) {
                // Create a new image object
                const tempImage = new Image();
                tempImage.src = imageUrl;
                // Wait for the image to finish loading
                await new Promise((resolve, reject) => {
                    if (firstImageLoaded) {
                        showLoading(true);
                    }
                    tempImage.onload = () => resolve();
                    tempImage.onerror = () => reject(new Error("Image load failed"));
                });
                // after the new image finished loading, only show it if not paused (as could happen during download)
                if (!paused && !pageIsHidden) {
                    // Update the main image element
                    displayImageAtHistoryPos(urlHistory.length - 1);
                    currentHistoryPos = 0;
                    firstImageLoaded = true;
                    hideLoading();
                }
                isSearchingForNewImage = false;
            }
        }
        if (!paused) {
            timeoutId = setTimeout(imageLoop, presetSettings.refreshRate);
        }
    } catch (error){
        console.error("Error in setImageLoop", error);
    }
}

//Get the image url of a new image with the matching criteria
async function getNewImageUrl(){
    let tags = globalSettings.globaltags.split(" "); //split the global tags into an array
    tags = tags.concat(presetSettings.tags.split(" ")) //add the preset tags to the global tags
    tags = tags.filter(tag => tag.trim() !== ""); //remove empty elements in the tags array
    const params = {
        "tags": tags.join(' '),
        "limit": 10,
        "client": '_client=e621AutoViewer (by Leithey)'
    }

    const queryParams = new URLSearchParams(params).toString();

    let url = "";
    if (adultMode && presetSettings.adultcontent) {
        url = `${config.url_e621}/posts.json/?${queryParams}`
    } else {
        url = `${config.url_e926}/posts.json/?${queryParams}`;
    }

    let headerParams = {}

    if (isUsingAuth()) {
        headerParams.Authorization = `Basic ` + btoa(`${globalSettings.username}:${globalSettings.apikey}`);
    }

    try {
        const response = await fetch(url, {headers: headerParams});
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(url);
        const postData = await response.json();

        if (postData.posts.length <= 0) {
            showNoImagesError();
            throw new Error("noImages");
        } else {
            noImagesFound.style.display = 'none';
        }

        let fileUrl;
        let fileId;
        let isFavorited;
        let post;

        for (let i = 0; i < postData.posts.length; i++) {
            post = postData.posts[i];

            if (paused || pageIsHidden){
                throw new Error("paused");
            } else if (!post.file || !post.file.url){
                console.log("URL is Null");
                continue;
            } else  if (!isFiletypeAllowed(post)) {
                continue;
            } else if (isBlacklisted(post)){
                continue;
            } else if (isWhitelisted(post)){
                fileUrl = post.file.url;
                fileId = post.id;
                isFavorited = post.is_favorited;
                break;
            } else {
                continue;
            }
        }
        if (paused || pageIsHidden){
            throw new Error("paused");
        }
        if (fileUrl === undefined) {
            return getNewImageUrl(); //no fitting image found, redo the search
        } else {
            console.log("New Image Found!", "Score:", post.score.total, "URL:\n" + fileUrl, "ID:\n" + fileId);

            urlHistory.push([fileUrl, fileId, isFavorited]);
            currentHistoryPos--;
            return fileUrl;
        }
    } catch (error) {
        if (error.message !== "paused") {
            if (error.message === "noImages") {
                
            } else {
                console.error("Error:", error);
            }
            
        }
        return null;
    }
}

//Add the current image to favorites, if auth is supplied
async function addFavorite(){
    let headerParams = {}
    if(isUsingAuth())
    {
        headerParams.Authorization = `Basic ` + btoa(`${globalSettings.username}:${globalSettings.apikey}`);
    } else {
        return;
    }

    const params = {
        "post_id": getCurrentId(),
    }

    const queryParams = new URLSearchParams(params).toString();

    let url = "";
    if (adultMode && presetSettings.adultcontent) {
        url = `${config.url_e621}/favorites.json/?${queryParams}`;
    } else {
        url = `${config.url_e926}/favorites.json/?${queryParams}`;
    }

    // Send favorite request
    const response = await fetch(url, {
        method: 'POST',
        headers: headerParams
    });

    // Favoriting worked
    if(response.ok){
        const postData = await response.json();
        if(getCurrentId() === postData.post_id){
            // Update the current image's status
            updateFavButton(true);
            urlHistory[getHistoryPosInArray()][2] = true;
        } else {
            // Find the image for which the status was set
            for(var i = 0; i <= urlHistory.length; i++) {
                if(urlHistory[i][1] === postData.post_id) {
                    urlHistory[i][2] = true;
                    return;
                }
            }
        }
    }
}

//Sets the current image to that of the given urlHistory position
function displayImageAtHistoryPos(pos){
    document.getElementById('mainImage').src = urlHistory[pos][0];
    updateFavButton(urlHistory[pos][2]);
}

////////////////////////////////////////////////////////////////////AGE CHECK/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Listen to button presses on age check
document.addEventListener('DOMContentLoaded', async function() {
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
        yesButton.addEventListener('click', async function() {
            console.log("18+")
            localStorage.setItem('ageConfirmed', 'true'); // Save user confirmation
            
            await ageCheckPassed();
        });

        noButton.addEventListener('click', async function() {
            console.log("Not 18+");

            await ageCheckNotPassed();
        });
    }
});

//Pass from age check to main autoviewer
async function ageCheckPassed()
{
    adultMode = true;
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    await initialize();
}

async function ageCheckNotPassed()
{
    adultMode = false;
    agePrompt.style.display = 'none'; // Hide the prompt
    addKeyEvents();

    await initialize();
}

let touchStartX = null;
let touchEndX = null;
let touchStartTime = null;
function addKeyEvents()
{
    document.addEventListener('mousedown', function(event) {
        if (event.button === 0) {
            leftClick(event);
        }
    });
    // Add event listener for the left arrow key press
    document.addEventListener('keydown', async function(event) {
        if (event.key === 'ArrowLeft') {
            // Call a function to navigate to the previous image
            previousImage();
        } else if (event.key == "ArrowRight") {
            nextImage();
        } else if (event.key === ' ') {
            togglePause();
        }
    });

    document.addEventListener('touchstart', function(event) {
        touchStartX = event.touches[0].clientX;
        touchStartTime = Date.now();
    })
    document.addEventListener('touchmove', function(event) {
        touchEndX = event.touches[0].clientX;
    })
    document.addEventListener('touchend', function(event) {
        if (touchStartX && touchEndX) {
            let swipeDistance = touchEndX - touchStartX;

            let touchDuration = Date.now() - touchStartTime;

            if (swipeDistance > 10) {
                previousImage();
            }
            if (swipeDistance < 10) {
                nextImage();
            }
        }
        
        // Reset touch tracking variables
        touchStartX = null;
        touchEndX = null;
    });
}

///////////////////////////////////////////////////////////////INPUT HANDLING/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function leftClick(event)
{
    if (settingsPanelOpen && !settingsPanel.contains(event.target) && 
        (event.target === mainImage || event.target === background)) {
        closeSettingsPanel();
    } else if (mainImage.contains(event.target)) {
        togglePause();
    }
}

let blockHideEvents = false; //if true, don't hide the settings button and mouse cursor
// Event listener to track mouse movements
document.addEventListener('mousemove', () => {
    // Show settings button when mouse is moved
    settingsButton.style.display = 'block';
    if (firstImageLoaded) {
        sourceButton.style.display = 'block';
        downloadButton.style.display = 'block';
        if(showFavButton){
            favoriteButton.style.display = 'block';
        }
    }
    clearTimeout(hideTimeout); // Clear the timeout if settings button is visible
    
    // Hide the cursor after a period of inactivity
    if (cursorHidden) {
        showCursor(); // Show the cursor if it's hidden
    }
    hideTimeout = setTimeout(mouseStoppedMoving, 1000); // Hide the cursor after 500 milliseconds of inactivity
});

function mouseStoppedMoving() {
    if (!blockHideEvents && !settingsPanelOpen) {
        settingsButton.style.display = 'none';
        sourceButton.style.display = 'none';
        downloadButton.style.display = 'none';
        favoriteButton.style.display = 'none';
        hideCursor();
    }
}

// Event listener to clear timeout when mouse enters settings button area
settingsButton.addEventListener('mouseenter', () => {
    blockHideEvents = true;
});

// Event listener to hide settings button when mouse leaves settings button area
settingsButton.addEventListener('mouseleave', () => {
    blockHideEvents = false;
});

///////////////////////////////////////////////////////////////SETTINGS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
document.getElementById('addPresetBtn').addEventListener('click', createNewPreset);
document.getElementById('savePreset').addEventListener('click', function() { savePreset(selectedPreset); });
document.getElementById('deletePreset').addEventListener('click', function() { deletePreset(selectedPreset); });
document.getElementById('resetPresetsBtn').addEventListener('click', resetPresets);

settingsButton.addEventListener('click', () => {
    if (!settingsPanelOpen) {
        openSettingsPanel();
    } else {
        closeSettingsPanel();
    }
});

function openSettingsPanel() {
    settingsPanelOpen = true;
    settingsPanel.style.display = 'flex';
    pause();
    console.log("opening settings");
}

document.getElementById('closesettingsbutton').addEventListener('click', closeSettingsPanel);
function closeSettingsPanel() {
    settingsPanelOpen = false;
    settingsPanel.style.display = 'none';
    unPause();
    console.log("closing settings");
}

///////////////////////////////////////////////////////////////PRESETS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function createNewPreset() {
    var newPreset = {
        "presetName": "New Preset",
        "refreshRate": "10000",
        "tags": "",
        "blacklist": "",
        "whitelist": "",
        "adultcontent": "true",
    };
    presetsData.push(newPreset);
    addPresetItem(newPreset.presetName);
}

// Function to add a new preset item
function addPresetItem(name) {
    const presetList = document.getElementById('presetList');

    const newPreset = document.createElement('div');
    newPreset.classList.add('presetItem');
    newPreset.textContent = name;
    newPreset.dataset.index = presetList.children.length;;
    newPreset.addEventListener('click', function() {
        let index = newPreset.dataset.index;
        loadPreset(index);
    });
    presetList.appendChild(newPreset);
}

async function loadPresets(reset = false) {
    try {
        let localPresetsData = localStorage.getItem("presetsData");

        selectedPreset = localStorage.getItem("selectedPreset");
        if (selectedPreset === null || selectedPreset === undefined) {
            selectedPreset = 0;
        }
        
        if (!reset && localPresetsData) {
            presetsData = JSON.parse(localPresetsData);
            
        } else {
            const response = await fetch('presets.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch config.json: ${response.status}`);
            }
            presetsData = await response.json();
        }
    } catch (error) {
        console.error('Error loading config:', error);
        presetsData = []; // Return an empty object in case of error
    }

    presetList.innerHTML = ""; //clear list

    for(var i = 0; i < presetsData.length; i++) {
        addPresetItem(presetsData[i].presetName);
    }
    loadPreset(selectedPreset);
}

function loadPreset(index) {
    presetSettings = presetsData[index];

    document.getElementById("presetName").value = presetSettings.presetName;
    document.getElementById("refreshRate").value = presetSettings.refreshRate;
    document.getElementById("tags").value = presetSettings.tags;
    document.getElementById("blacklist").value = presetSettings.blacklist;
    document.getElementById("whitelist").value = presetSettings.whitelist;
    document.getElementById("adultcontent").checked = presetSettings.adultcontent;

    selectedPreset = index;

    const highlightedPreset = document.querySelector(".presetItem.selected");
    if (highlightedPreset) {
        highlightedPreset.classList.remove("selected");
    }
    presetList.children[index].classList.add("selected");

    localStorage.setItem("selectedPreset", index);
    console.log("Preset loaded:", presetSettings.presetName);
}

function savePreset(index) {
    console.log(index);
    var NameValue = document.getElementById("presetName").value;
    var refreshRateValue = document.getElementById("refreshRate").value;
    var tagsValue = document.getElementById("tags").value;
    var blacklistValue = document.getElementById("blacklist").value;
    var whitelistValue = document.getElementById("whitelist").value;
    var adultcontentValue = document.getElementById("adultcontent").checked;

    var presetSettings = {
        "presetName": NameValue,
        "refreshRate": refreshRateValue,
        "tags": tagsValue,
        "blacklist": blacklistValue,
        "whitelist": whitelistValue,
        "adultcontent": adultcontentValue,
    };

    presetList.children[index].textContent = NameValue;

    presetsData[index] = presetSettings;

    console.log("Preset Saved:", index, NameValue);

    savePresets();
    loadPreset(index);
    closeSettingsPanel();
}

function savePresets(){
    let presetsJSON = JSON.stringify(presetsData);

    localStorage.setItem("presetsData", presetsJSON);
}

function deletePreset(index) {
    presetsData.splice(index, 1);
    presetList.removeChild(presetList.children[index]);
    selectedPreset--;

    loadPreset(selectedPreset);
    savePresets();
}

function resetPresets(){
    console.log("Resetting Presets");
    loadPresets(true);
}

globalPresetsButton.addEventListener('click', openPresetSettings);
function openPresetSettings(){
    globalsettingsPanel.style.display = "none";
    creditsPanel.style.display = "none";
    presetSettingsPanel.style.display = "flex";
    globalSettingsButton.classList.remove("selected");
    creditsButton.classList.remove("selected");
    globalPresetsButton.classList.add("selected");
}

creditsButton.addEventListener('click', openCredits);
function openCredits(){
    globalsettingsPanel.style.display = "none";
    presetSettingsPanel.style.display = "none";
    creditsPanel.style.display = "flex";
    globalSettingsButton.classList.remove("selected");
    globalPresetsButton.classList.remove("selected");
    creditsButton.classList.add("selected");
}


///////////////////////////////////////////////////////////////HELPER FUNCTIONS/////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//check if the postData contains a blacklisted tag
function isBlacklisted(postData){
    let blacklist = globalSettings.globalblacklist.split(" ");
    let presetblacklist = presetSettings.blacklist.split(" ");
    blacklist = blacklist.concat(presetblacklist);
    blacklist = blacklist.filter(item => item.trim() !== '');

    //console.log(blacklist);
    const allTags = Object.values(postData.tags).flatMap(tags => tags); // Flatten the tags into a single array
    
    const blacklistedTags = [];
    for (const tag of blacklist) {
        if (allTags.includes(tag)) {
            blacklistedTags.push(tag);
        }
    }

    if (blacklistedTags.length > 0) {
        console.log("Blacklisted tag found:", blacklistedTags);
        return true; // Tag is blacklisted
    } else {
        return false; // Tag is not blacklisted
    }
}

function isWhitelisted(postData){
    let whitelist = globalSettings.globalwhitelist.split(" ");
    let presetwhitelist = presetSettings.whitelist.split(" ");
    whitelist = whitelist.concat(presetwhitelist);
    whitelist = whitelist.filter(item => item.trim() !== '');

    if (whitelist.length > 0 /*|| globalSettings.globalwhitelist.length > 0*/) {
        const allTags = Object.values(postData.tags).flatMap(tags => tags); // Flatten the tags into a single array

        const whitelistedTags = [];
        for (const tag of whitelist) {
            if (allTags.includes(tag)) {
                whitelistedTags.push(tag);
            }
        }
    
        if (whitelist.length === whitelistedTags.length) {
            console.log("Whitelisted tags found:", whitelistedTags);
            return true;
        } else {
            console.log("Whitelisted tags not found:", whitelistedTags);
            return false;
        }
    } else {
        return true; //there is no whitelist, default to true
    }
}

//check if the postData is a allowed filetype
function isFiletypeAllowed(postData){
    const filetypelist = config.allowed_filetypes;

    const fileUrl = postData.file.url; // Get the URL of the file
    const lastIndex = fileUrl.lastIndexOf('.'); // Find the index of the last dot
    if (lastIndex !== -1) { // Check if a dot was found
        const fileType = fileUrl.slice(lastIndex); // Extract the characters after the dot

        // Check if the file extension is allowed
        if (filetypelist.includes(fileType)) {
            return true; // Filetype is allowed
        } else {
            console.log("Not allowed filetype:", fileType);
            return false; // Filetype is not allowed
        }
    } else {
        console.log("No file extension found.");
        return false; // No file extension found, consider it as not allowed
    }
}

//check if user has provided auth credentials
function isUsingAuth(){
    return globalSettings.username.length > 0 && globalSettings.apikey.length > 0;
}

//sets the UI to reflect a favorite state
function updateFavButton(isFavorited) {
    favoriteButton.textContent = isFavorited ? "★" : "☆"
}

//Toggles the pause state
async function togglePause() {
    // Get the pause icon element
    const pauseIcon = document.getElementById('pauseIcon');
    if (paused){
        unPause();
    } else {
        pause();
    }
}

//pauses the autoviewer
async function pause(){
    paused = true;
    pauseIcon.style.display = 'block';
    clearTimeout(timeoutId);
    isSearchingForNewImage = false;
    hideLoading();
}

//unpauses the autoviewer. Input true to not search for a new image after unpausing and to instead wait the normal delay 
async function unPause(skipNewSearch = false){
    if (!isSearchingForNewImage) {
        paused = false;
        pauseIcon.style.display = 'none';
        clearTimeout(timeoutId);
        await imageLoop(skipNewSearch);
    } else {
        console.log("Not unpausing, new image is being searched");
    }
}

async function previousImage()
{
    if (currentHistoryPos > -urlHistory.length + 1) {
        pause();
        currentHistoryPos--;
        const pos = getHistoryPosInArray();
        console.log('Previous image requested', pos);
        displayImageAtHistoryPos(pos);
    } else {
        console.log("Can't go back in history further");
    }
}

async function nextImage() {
        if (currentHistoryPos < 0) {
            currentHistoryPos++;
            const pos = getHistoryPosInArray();
            console.log('Next image requested',pos);
            displayImageAtHistoryPos(pos);
            if (currentHistoryPos == 0){
                unPause(true);
            }
        } else {
            console.log("Reached newest history item");
            unPause();
        }
}

function getHistoryPosInArray() {
    return urlHistory.length + currentHistoryPos - 1;
}

function showLoading(showOnTop = false){
    if (showOnTop) {
        loadingtop.style.display = 'block';
        loadingtop.style.top = "20px";
    } else {
        mainImage.style.display = "none";
        loading.style.display = 'block';
        loading.style.top = "50%";
    }
}

function hideLoading(){
    mainImage.style.display = "block";
    loading.style.display = 'none';
    loadingtop.style.display = 'none';
}

function showNoImagesError(){
    hideLoading();
    console.log(`No images found.`);
    noImagesFound.style.display = 'block';
    mainImage.style.display = "none";
}

function hideNoImagesError(){
    noImagesFound.style.display = 'none';
    mainImage.style.display = "block";
}

downloadButton.addEventListener('click', () => {downloadImage();})
function downloadImage() {
    const imageUrl = "https://corsproxy.io/?" + getCurrentFileURL();
    const lastIndex = imageUrl.lastIndexOf("/");
    const filename = imageUrl.substring(lastIndex + 1);
    console.log(filename);

    // Fetch the image as a Blob
    fetch(imageUrl)
        .then(response => response.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result; // Base64-encoded data URL
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            reader.readAsDataURL(blob);
        })
        .catch(error => {
            console.error('Error fetching image:', error.message);
        });
}

function getCurrentId() {
    console.log(getHistoryPosInArray() + urlHistory);
    const currentId = urlHistory[getHistoryPosInArray()][1];
    return currentId;
}

function getCurrentFileURL() {
    const currentFileURL = urlHistory[getHistoryPosInArray()][0];
    return currentFileURL;
}

function getCurrentSourceURL() {
    const currentId = getCurrentId();
    let url = "";
    if (adultMode && presetSettings.adultcontent) {
        url = `${config.url_e621}/posts/${currentId}`;
    } else {
        url = `${config.url_e926}/posts/${currentId}`;
    }

    return url;
}

sourceButton.addEventListener('click', () => {
    openSource();
});

function openSource() {
    window.open(getCurrentSourceURL());
}

favoriteButton.addEventListener('click', () => {
    addFavorite();
});

function showFaveButton(show){
    showFavButton = show;
    bottomCenterButtons.style.width = show ? "240" : "200";
}

globalSettingsButton.addEventListener('click', openGlobalSettings);
function openGlobalSettings(){
    presetSettingsPanel.style.display = "none";
    creditsPanel.style.display = "none";
    globalsettingsPanel.style.display = "flex";
    globalPresetsButton.classList.remove("selected");
    creditsButton.classList.remove("selected");
    globalSettingsButton.classList.add("selected");
    loadGlobalSettings();
}

function loadGlobalSettings(){
    let globalSettingsJSON = localStorage.getItem("globalSettings");

    if (globalSettingsJSON === null || globalSettingsJSON === undefined)
    {
        globalSettings = {
            "username": '',
            "apikey": '',
            "globaltags": config.global_tags.join(" "),
            "globalblacklist": config.global_blacklist.join(" "),
            "globalwhitelist": config.global_whitelist.join(" "),
        };
    } else {
        globalSettings = JSON.parse(globalSettingsJSON);
    }
    usernameInput.value = globalSettings.username;
    apiKeyInput.value = globalSettings.apikey;
    document.getElementById("globaltags").value = globalSettings.globaltags;
    document.getElementById("globalblacklist").value = globalSettings.globalblacklist;
    document.getElementById("globalwhitelist").value = globalSettings.globalwhitelist;

    showFaveButton(isUsingAuth());

    console.log("loaded global settings");
}

document.getElementById("saveGlobalSettings").addEventListener('click', saveGlobalSettings);
function saveGlobalSettings(){
    let globaltagsValue = document.getElementById("globaltags").value;
    let globalblacklistValue = document.getElementById("globalblacklist").value;
    let globalwhitelistValue = document.getElementById("globalwhitelist").value;

    let loadedglobalSettings = {
        "username": usernameInput.value,
        "apikey": apiKeyInput.value,
        "globaltags": globaltagsValue,
        "globalblacklist": globalblacklistValue,
        "globalwhitelist": globalwhitelistValue,
    };

    globalSettings = loadedglobalSettings;
    let globalSettingsJson = JSON.stringify(globalSettings);

    localStorage.setItem("globalSettings", globalSettingsJson);
    showFaveButton(isUsingAuth());
    closeSettingsPanel();
}

// Event handler for visibility change
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // Page is visible
        console.log('Page is visible');
        pageIsHidden = false;
    } else if (document.visibilityState === 'hidden') {
        // Page is hidden
        console.log('Page is hidden');
        pageIsHidden = true;
    }
}

// Function to hide the cursor after a period of inactivity
function hideCursor() {
    document.body.style.cursor = 'none';
    cursorHidden = true;
}

// Function to show the cursor
function showCursor() {
    document.body.style.cursor = 'auto';
    cursorHidden = false;
}