browser.runtime.onMessage.addListener((message) => {
    return new Promise((resolve) => {
        if (message.command === 'checkLogin') {
            const errorEl = document.querySelector('.error');
            if (errorEl) {
                resolve({error: `zra_error: "${errorEl.innerText}"`});
                return;
            }

            const clientEl = document.querySelector('#headerContent>tbody>tr>td:nth-child(3)>p:nth-child(27)>b>label');
            if (clientEl) {
                const clientInfo = clientEl.innerText;
                const foundUsername = clientInfo.indexOf(message.client.username) > -1;
                if (foundUsername) {
                    // If we found the username in the client info, then we have successfully logged in
                    resolve({error: ''});
                    return;
                }
            }

            resolve({error: 'failed_to_login'});
        }
    });
});