
function listenForClicks() {
	document.addEventListener("click", (e) => {

		function getAllPendingLiabilitiesAction(){
			browser.runtime.sendMessage({
				command: "getAllPendingLiabilities",
			});
		}

		//if (e.target.ids.contains("get-all-pending-liabilities")) {
		//	getAllPendingLiabilitiesAction()  
		//}
		if (e.target.classList.contains("zra-action")) {
			getAllPendingLiabilitiesAction()  
		}
	});
}

/**
 * There was an error executing the script.
 * Display the popup's error message, and hide the normal UI.
 */
function reportExecuteScriptError(error) {
	document.querySelector("#popup-content").classList.add("hidden");
	document.querySelector("#error-content").classList.remove("hidden");
	console.error('Failed to execute content script: ${error.message}');
}

listenForClicks()

console.log("yay popup")