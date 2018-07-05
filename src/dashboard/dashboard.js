function getAllPendingLiabilitiesAction(){
    browser.runtime.sendMessage({
        command: "getAllPendingLiabilities",
    });
}

document.addEventListener("click", (e) => {
    if (e.target.classList.contains("zra-action")) {
        if (e.target.id === "get-all-pending-liabilities") {
            getAllPendingLiabilitiesAction();
        }
    }
});

const logLines = [];

const logElement = document.querySelector('#log');
function log(value) {
    if (logLines.length > 0) {
        document.querySelector('#log').classList.remove('hidden');
    }
    logLines.push(value);
    logElement.innerText += value+'\n';
}

browser.runtime.onMessage.addListener((message) => {
    if (message.from === 'background' && message.type === 'log') {
        log(message.value);    
    }
});