browser.runtime.onMessage.addListener((message) => {
    if (message.command === 'login') {
        document.querySelector('#userName').value = message.client.username;
        document.querySelector('#xxZTT9p2wQ').value = message.client.password;

        /** @type {HTMLImageElement} */
        const captchaImageElement = document.querySelector('#captchaImage');

        const image = new Image();
        image.src = captchaImageElement.src;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = 2;
        image.onload = function () {
            const width = image.width * scale;
            const height = image.height * scale;
            canvas.width = width;
            canvas.height = height;
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(image, 0, 0, width, height);

            const captchaText = OCRAD(canvas);
            const captchaArithmetic = captchaText.replace(' ', '').replace('?', '');
            const numbers = captchaArithmetic.split(/\+|\-/).map(str => parseInt(str, 10));
            const operator = captchaArithmetic[captchaArithmetic.search(/\+|\-/)];
            let sum = null;
            if (operator === '+') {
                sum = numbers[0] + numbers[1];
            } else {
                sum = numbers[0] - numbers[1];
            }
            
            // Note: the ZRA website misspelled captcha
            document.querySelector('#captcahText').value = sum;
            document.querySelector('#submitButton').click();
        }
    }
    return Promise.resolve();
});