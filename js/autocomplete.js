import Logger from './logger.js';

const AUTOCOMPLETE_API_URL = "https://e621.net/tags/autocomplete.json";
const TAG_CATEGORIES = {
    0: "tag-general",
    1: "tag-artist",
    3: "tag-copyright",
    4: "tag-character",
    5: "tag-species",
    6: "tag-invalid",
    7: "tag-meta",
    8: "tag-lore"
};

export function setupAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // specific fix for browser autocomplete popups
    input.setAttribute("autocomplete", "off");

    // Wrap input to position dropdown if not already wrapped
    if (!input.parentNode.classList.contains('autocomplete-container')) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("autocomplete-container");
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        wrapper.style.flexGrow = "1";
        input.style.width = "100%";
        input.style.boxSizing = "border-box";
    }

    let currentFocus = -1;
    let debounceTimer;

    input.addEventListener("input", function (e) {
        const val = this.value;
        const cursorPosition = this.selectionStart;

        // Find the word being typed
        const textBeforeCursor = val.slice(0, cursorPosition);
        const textAfterCursor = val.slice(cursorPosition);

        const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
        const nextSpaceIndex = textAfterCursor.indexOf(" ");

        const start = lastSpaceIndex + 1;
        const end = (nextSpaceIndex === -1) ? val.length : cursorPosition + nextSpaceIndex;

        const currentWord = val.slice(start, end);

        closeAllLists();
        if (!currentWord || currentWord.length < 2) return;

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchSuggestions(currentWord, this, start, end);
        }, 300);
    });

    input.addEventListener("keydown", function (e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");

        if (x) {
            let items = [];
            for (let i = 0; i < x.length; i++) {
                if (x[i].classList.contains("autocomplete-item")) items.push(x[i]);
            }
            x = items;
        }

        if (e.key === "ArrowDown") {
            currentFocus++;
            addActive(x);
        } else if (e.key === "ArrowUp") {
            currentFocus--;
            addActive(x);
        } else if (e.key === "Enter") {
            if (currentFocus > -1 && x) {
                e.preventDefault();
                x[currentFocus].click();
            }
        }
    });

    function addActive(x) {
        if (!x || x.length === 0) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
        x[currentFocus].scrollIntoView({ block: "nearest" });
    }

    function removeActive(x) {
        for (var i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    async function fetchSuggestions(query, inp, wordStart, wordEnd) {
        try {
            const response = await fetch(`${AUTOCOMPLETE_API_URL}?search[name_matches]=${encodeURIComponent(query)}`, {
                headers: {
                    'User-Agent': 'e621AutoViewer/1.0 (by user)'
                }
            });
            if (!response.ok) return;
            const data = await response.json();

            if (data.length === 0) return;

            // Check if input is still focused
            if (document.activeElement !== inp) return;

            const listDiv = document.createElement("div");
            listDiv.setAttribute("id", inp.id + "autocomplete-list");
            listDiv.setAttribute("class", "autocomplete-items");

            // Append to wrapper
            // input is inside wrapper.
            inp.parentNode.appendChild(listDiv);

            // Raise Z-Index of the parent tooltip container so the dropdown renders over subsequent inputs
            const tooltipParent = inp.closest('.tooltip');
            if (tooltipParent) {
                tooltipParent.style.zIndex = "10000";
            }

            data.forEach(tag => {
                const itemDiv = document.createElement("div");
                itemDiv.classList.add("autocomplete-item");

                // Color based on category
                const categoryClass = TAG_CATEGORIES[tag.category] || "tag-general";

                // Name part
                const nameSpan = document.createElement("span");
                nameSpan.classList.add(categoryClass);
                nameSpan.textContent = tag.name;

                if (tag.antecedent_name) {
                    nameSpan.textContent = tag.antecedent_name + " \u2192 " + tag.name;
                }

                // Count part
                const countSpan = document.createElement("span");
                countSpan.classList.add("tag-count");
                countSpan.classList.add(categoryClass);
                countSpan.textContent = formatCount(tag.post_count);

                itemDiv.appendChild(nameSpan);
                itemDiv.appendChild(countSpan);

                itemDiv.addEventListener("click", function (e) {
                    // Replace the word
                    const fullText = inp.value;
                    const pre = fullText.slice(0, wordStart);
                    const post = fullText.slice(wordEnd);
                    // Add space after tag
                    inp.value = pre + tag.name + " " + post;

                    closeAllLists();
                    // Set cursor after the new tag
                    const newCursorPos = pre.length + tag.name.length + 1;
                    inp.setSelectionRange(newCursorPos, newCursorPos);
                    inp.focus();

                    // Trigger input event
                    inp.dispatchEvent(new Event('input'));
                    inp.dispatchEvent(new Event('change'));
                });

                listDiv.appendChild(itemDiv);
            });
        } catch (e) {
            Logger.error("Autocomplete error:", e);
        }
    }

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != input) {
                x[i].parentNode.removeChild(x[i]);
            }
        }

        // Reset Z-Index of the parent tooltip container
        // Only if we are stripping the dropdown for *this* input, or if we cleaned up *all* lists (which we just did)
        // Since closeAllLists removes ALL autocompletes (except excludes), we can safely reset z-index for this input
        // provided the list is gone.
        // Actually, straightforward logic: if list is closed, z-index returns to normal.
        const tooltipParent = input.closest('.tooltip');
        if (tooltipParent) {
            tooltipParent.style.zIndex = "";
        }
    }

    document.addEventListener("click", function (e) {
        closeAllLists(e.target);
    });
}

function formatCount(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "m";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return n;
}

// Initialize autocomplete
export function setupAutocompleteForAll() {
    document.addEventListener('DOMContentLoaded', function () {
        const ids = ["globaltags", "globalblacklist", "globalwhitelist", "tags", "blacklist", "whitelist", "searchTags", "searchBlacklist", "searchWhitelist"];
        ids.forEach(id => setupAutocomplete(id));
    });
}
