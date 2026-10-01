// ===============================
// GET HTML ELEMENTS
// ===============================

const inputText = document.getElementById("inputText");
const outputText = document.getElementById("outputText");
const sourceLanguage = document.getElementById("sourceLanguage");
const targetLanguage = document.getElementById("targetLanguage");
const translateButton = document.getElementById("translateButton");
const copyButton = document.getElementById("copyButton");
const speakButton = document.getElementById("speakButton");
const clearButton = document.getElementById("clearButton");
const swapButton = document.getElementById("swapButton");
const statusEl = document.getElementById("status"); // renamed from "status" to avoid clashing with window.status
const inputCount = document.getElementById("inputCount");
const outputCount = document.getElementById("outputCount");
const loader = document.querySelector(".loader");
const buttonText = document.querySelector(".button-text");

// Fail loudly (in the console) instead of silently if the HTML changed
// and an id no longer matches — this is the #1 cause of "nothing happens
// when I click" bugs, so it's worth checking up front.
const requiredElements = {
    inputText, outputText, sourceLanguage, targetLanguage,
    translateButton, copyButton, speakButton, clearButton,
    swapButton, statusEl, inputCount, outputCount, loader, buttonText
};
for (const [name, el] of Object.entries(requiredElements)) {
    if (!el) {
        console.error(`Smart Translator: could not find element for "${name}". Check that the id/class in index.html matches script.js.`);
    }
}


// ===============================
// CHARACTER COUNTER
// ===============================

inputText.addEventListener("input", updateInputCount);
outputText.addEventListener("input", updateOutputCount);

function updateInputCount() {
    inputCount.textContent = `${inputText.value.length} characters`;
}

function updateOutputCount() {
    outputCount.textContent = `${outputText.value.length} characters`;
}


// ===============================
// TRANSLATE
// ===============================

// MyMemory returns HTTP 200 even when the translation itself failed
// (daily quota hit, bad language pair, text too long, etc). It signals
// that failure two ways instead of an HTTP error code:
//   1. data.responseStatus is not 200 (it can be a string or a number)
//   2. data.responseData.translatedText contains one of its own
//      all-caps warning messages instead of an actual translation
// The original code only checked for a missing translatedText, so
// these failures fell straight through and the warning text got
// displayed (or nothing useful happened) instead of a real error.
function extractTranslation(data) {
    const statusCode = Number(data?.responseStatus);
    if (statusCode && statusCode !== 200) {
        throw new Error(`Translation service returned status ${statusCode}`);
    }

    const translated = data?.responseData?.translatedText;
    if (!translated) {
        throw new Error("No translation returned");
    }

    const warningPatterns = [
        "QUERY LENGTH LIMIT",
        "MYMEMORY WARNING",
        "INVALID SOURCE LANGUAGE",
        "INVALID TARGET LANGUAGE",
        "IS AN INVALID",
        "AMOUNT OF FREE TRANSLATION",
        "LIMIT EXCEEDED"
    ];
    const upper = translated.toUpperCase();
    if (warningPatterns.some((pattern) => upper.includes(pattern))) {
        throw new Error(translated);
    }

    return translated;
}

async function translateText(text, source, target) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`API request failed (${response.status})`);
    }

    const data = await response.json();
    return extractTranslation(data);
}

translateButton.addEventListener("click", async () => {
    const text = inputText.value.trim();

    if (text === "") {
        statusEl.textContent = "⚠️ Please enter some text first.";
        inputText.focus();
        return;
    }

    const source = sourceLanguage.value;
    const target = targetLanguage.value;

    if (source === target) {
        outputText.value = text;
        updateOutputCount();
        statusEl.textContent = "✨ Translation completed!";
        return;
    }

    translateButton.disabled = true;
    buttonText.textContent = "Translating...";
    loader.style.display = "inline-block";
    statusEl.textContent = "🌎 Connecting to translation service...";

    try {
        const translated = await translateText(text, source, target);

        outputText.value = translated;
        updateOutputCount();
        statusEl.textContent = "✅ Translation completed successfully!";

        outputText.classList.add("translation-success");
        setTimeout(() => {
            outputText.classList.remove("translation-success");
        }, 600);

    } catch (error) {
        console.error("Translation error:", error);
        outputText.value = "";
        updateOutputCount();

        const message = String(error.message || error);
        if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
            statusEl.textContent = "❌ Couldn't reach the translation service. Check your internet connection.";
        } else if (message.toUpperCase().includes("LIMIT") || message.toUpperCase().includes("QUOTA")) {
            statusEl.textContent = "❌ Translation service quota reached. Try again later.";
        } else {
            statusEl.textContent = `❌ Translation failed: ${message}`;
        }
    } finally {
        translateButton.disabled = false;
        buttonText.textContent = "🚀 Translate Now";
        loader.style.display = "none";
    }
});


// ===============================
// COPY
// ===============================

copyButton.addEventListener("click", async () => {
    const text = outputText.value.trim();

    if (text === "") {
        statusEl.textContent = "⚠️ Nothing to copy.";
        return;
    }

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // navigator.clipboard requires a secure context (https or
            // localhost). Opening index.html directly as a file:// page
            // doesn't count, so we fall back to the older selection-based
            // copy method rather than silently failing.
            outputText.removeAttribute("readonly");
            outputText.select();
            document.execCommand("copy");
            outputText.setAttribute("readonly", true);
        }

        statusEl.textContent = "📋 Copied to clipboard!";
        copyButton.textContent = "✅ Copied!";
        setTimeout(() => {
            copyButton.textContent = "📋 Copy";
        }, 1500);

    } catch (error) {
        console.error("Copy error:", error);
        statusEl.textContent = "❌ Copy failed. Try selecting and copying manually.";
    }
});


// ===============================
// TEXT TO SPEECH
// ===============================

speakButton.addEventListener("click", () => {
    const text = outputText.value.trim();

    if (text === "") {
        statusEl.textContent = "⚠️ Nothing to speak.";
        return;
    }

    if (!("speechSynthesis" in window)) {
        statusEl.textContent = "❌ Text-to-speech isn't supported in this browser.";
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = targetLanguage.value;
    speech.rate = 0.9;
    speech.pitch = 1;

    speech.onerror = (event) => {
        console.error("Speech error:", event);
        statusEl.textContent = "❌ Couldn't play that language's speech.";
    };

    window.speechSynthesis.speak(speech);
    statusEl.textContent = "🔊 Speaking translation...";
});


// ===============================
// CLEAR BUTTON
// ===============================

clearButton.addEventListener("click", () => {
    inputText.value = "";
    outputText.value = "";
    updateInputCount();
    updateOutputCount();
    statusEl.textContent = "🧹 Text cleared!";
    inputText.focus();
});


// ===============================
// SWAP LANGUAGES
// ===============================

swapButton.addEventListener("click", () => {
    const oldSource = sourceLanguage.value;
    const oldText = inputText.value;

    sourceLanguage.value = targetLanguage.value;
    targetLanguage.value = oldSource;

    inputText.value = outputText.value;
    outputText.value = oldText;

    updateInputCount();
    updateOutputCount();

    statusEl.textContent = "🔄 Languages swapped!";
});