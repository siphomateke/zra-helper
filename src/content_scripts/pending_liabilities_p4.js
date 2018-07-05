(function() {
	/**
	* Check and set a global guard variable.
	* If this content script is injected into the same page again,
	* it will do nothing next time.
	*/
	console.log("yay pending_liabilities_p4")

	if (window.hasRun) {
		return;
	}
	window.hasRun = true;

	/**
	*
	*/
	function pendingLiabilitiesP4(taxType) {
	
		if (document.querySelector("#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow") != null)
		{
			const totals = [];
			for (let i=5;i<8;i++) {
				totals.push(document.querySelector(`#rprtDataTable>tbody>tr.rprtDataTableGrandTotalRow>td:nth-child(${i})`).innerText);
			}
			browser.runtime.sendMessage({
				dataType: 'totals',
				totals: totals,
				taxType,
			});
		}
		else if (document.querySelector("#rsltTableHtml>table>tbody>tr:nth-child(2)>td>center.Label3") != null)
		{
			browser.runtime.sendMessage({
				dataType: 'totals',
				totals: [0,0,0,0],
				taxType,
			});
		}
		else 
		{

		}

	
	}

	/**
	* Listen for messages from the background script.
	* Call "pendingLiabilitiesP4()".
	*/
	browser.runtime.onMessage.addListener((message) => {
		if (message.command === "pendingLiabilitiesP4") {
			pendingLiabilitiesP4(message.taxType);
		}
	});

})();
