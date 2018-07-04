(function() {
	/**
	* Check and set a global guard variable.
	* If this content script is injected into the same page again,
	* it will do nothing next time.
	*/
	console.log("yay pending_liabilities_p3")

	if (window.hasRun) {
		return;
	}
	window.hasRun = true;

	/**
	*
	*/
	function pendingLiabilitiesP3() {
		document.querySelector("#prm_TaxType").value = "02" //Value Added Tax

	}

	/**
	* Listen for messages from the background script.
	* Call "pendingLiabilitiesP3()".
	*/
	browser.runtime.onMessage.addListener((message) => {
		if (message.command === "pendingLiabilitiesP3") {
			pendingLiabilitiesP3();
		}
	});

})();
