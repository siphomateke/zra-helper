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