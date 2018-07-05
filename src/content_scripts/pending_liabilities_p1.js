(function() {
	/**
	* Check and set a global guard variable.
	* If this content script is injected into the same page again,
	* it will do nothing next time.
	*/
	console.log("yay pending_liabilities_p1")

	if (window.hasRun) {
		return;
	}
	window.hasRun = true;

	/**
	*
	*/
	function pendingLiabilitiesP1() {
		document.querySelector("#leftMainDiv>tbody>tr:nth-child(2)>td>div>div>div>div>div:nth-child(7)>a").click(); //Account History
		document.querySelector("[id='4']>li:nth-child(1)>div>a").click() //Taxpayer Profile
	}

	/**
	* Listen for messages from the background script.
	* Call "pendingLiabilitiesP1()".
	*/
	browser.runtime.onMessage.addListener((message) => {
		if (message.command === "pendingLiabilitiesP1") {
			pendingLiabilitiesP1();
		}
	});

})();
