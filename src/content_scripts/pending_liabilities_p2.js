(function() {
	/**
	* Check and set a global guard variable.
	* If this content script is injected into the same page again,
	* it will do nothing next time.
	*/
	console.log("yay pending_liabilities_p2")

	if (window.hasRun) {
		return;
	}
	window.hasRun = true;

	/**
	*
	*/
	function pendingLiabilitiesP2() {
		document.querySelector("#maincontainer>tbody>tr:nth-child(4)>td:nth-child(3)>form>fieldset:nth-child(5)>table>tbody>tr:nth-child(3)>td:nth-child(2)>a").click() //Pending Liabilities
	}

	/**
	* Listen for messages from the background script.
	* Call "pendingLiabilitiesP2()".
	*/
	browser.runtime.onMessage.addListener((message) => {
		if (message.command === "pendingLiabilitiesP2") {
			pendingLiabilitiesP2();
		}
	});

})();
