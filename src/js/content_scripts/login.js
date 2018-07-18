import {ExtendedError, ElementNotFoundError, errorToJson} from '../errors';

/**
 * Creates a canvas from a HTML image element
 * 
 * @param {HTMLImageElement} image The image to use
 * @param {number} [scale=1] Optional scale to apply to the image
 * @return {HTMLCanvasElement}
 */
function imageToCanvas(image, scale=1) {
    const width = image.width * scale;
    const height = image.height * scale;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, width, height);
    return canvas;
}

/**
 * Gets a captcha from an image element as a canvas
 * 
 * @param {HTMLImageElement} imageElement Image element to get captcha from
 * @param {number} [scale=2] Optional scale to help recognize the image
 * @return {HTMLCanvasElement}
 */
function getCaptcha(imageElement, scale = 2) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = imageElement.src;
        image.onload = function () {
            resolve(imageToCanvas(image, scale));
        }
        image.onerror = function (event) {
            reject(event.error);
        }
    });
}

/**
 * Requests a new captcha
 */
function refreshCaptcha() {
    let selector = '#loginForm a[href="javaScript:refreshCaptchaImage()"]';
    let refreshCaptchaButton = document.querySelector(selector);
    if (refreshCaptchaButton) {
        refreshCaptchaButton.click();
    } else {
        throw new ElementNotFoundError('Refresh captcha button not found', 'RefreshCaptchaButtonNotFound');
    }
}

/**
 * Solves a simple arithmetic captcha.
 * 
 * The input text should be in the format: "<number> <operator> <number>?". For example, '112-11?'.
 * Spaces and question marks are automatically stripped.
 * 
 * @param {string} text Text containing arithmetic question.
 * @example 
 * solveCaptcha('112- 11?') // 101
 * @return {number}
 */
function solveCaptcha(text) {
    const captchaArithmetic = text.replace(/\s/g, '').replace(/\?/g, '');
    const numbers = captchaArithmetic.split(/\+|\-/).map(str => parseInt(str, 10));
    const operator = captchaArithmetic[captchaArithmetic.search(/\+|\-/)];
    let answer = null;
    if (operator === '+') {
        answer = numbers[0] + numbers[1];
    } else {
        answer = numbers[0] - numbers[1];
    }
    return answer;
}

/** 
 * Common characters that the OCR engine incorrectly outputs and their 
 * correct counterparts 
 */
const commonIncorrectCharacters = [
    ['l', '1'],
    ['o', '0'],
];

/**
 * Logs into a particular client's account
 * 
 * @param {Client} client The client whose account to login to
 * @param {number} maxCaptchaRefreshes The maximum number of times that a new captcha will be loaded if the OCR fails
 */
// TODO: Import Client for JSDoc
async function login(client, maxCaptchaRefreshes) {
    // Get required elements and check if any are missing
    let elementSelectors = {
        username: '#userName',
        password: '#xxZTT9p2wQ',
        // Note: the ZRA website misspelled captcha
        captchaInput: '#captcahText',
        submitButton: '#submitButton',
        captchaImage: '#captchaImage',
    }
    let missingElements = [];
    let els = {};
    for (const name of Object.keys(elementSelectors)) {
        els[name] = document.querySelector(elementSelectors[name]);
        if (!els[name]) {
            missingElements.push(name);
        }
    }

    if (missingElements.length === 0) {
        // Enter the username and password
        els.username.value = client.username;
        els.password.value = client.password;
    
        // Solve captcha
        let answer = null;
        let refreshes = 0;
        while (refreshes < maxCaptchaRefreshes) {
            const captcha = await getCaptcha(els.captchaImage);
            let captchaText = OCRAD(captcha);
            answer = solveCaptcha(captchaText);

            // If captcha reading failed, try again with common recognition errors fixed.
            let newText = '';
            if (isNaN(answer)) {
                newText = captchaText;
                for (const error of commonIncorrectCharacters) {
                    newText = newText.replace(new RegExp(error[0], 'g'), error[1]);
                }
                answer = solveCaptcha(newText);
            }

            // If captcha reading still failed, try again with a new one.
            if (isNaN(answer)) {
                refreshCaptcha();
                refreshes++;
            } else {
                break;
            }
        }
        els.captchaInput.value = answer;

        els.submitButton.click();
    } else {
        throw new ElementNotFoundError(`Elements missing from login form: [${missingElements.join(', ')}]`);
    }
}

browser.runtime.onMessage.addListener(async (message) => {
    if (message.command === 'login') {
        try {
            await login(message.client, message.maxCaptchaRefreshes);
            return true;
        } catch (error) {
            return {
                error: errorToJson(error),
            };
        }
    }
});