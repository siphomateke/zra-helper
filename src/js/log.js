import { debug } from './config';

class Log {
    constructor() {
        this.logLines = [];
        this.logWrapperEl = $('#log-wrapper');
        this.logElementWrapper = $('.log');
        this.logElement = this.logElementWrapper.find('.log-inner');

        this.errors = [];
    }
    setCategory(category) {
        this.category = category;
    }
    log(value, type) {
        this.logLines.push(value);
        if (this.logLines.length > 0) {
            this.logWrapperEl.removeClass('hidden');
        }

        const now = new Date(Date.now());
        let dateValues = [
            now.getDate(),
            now.getMonth(),
            now.getFullYear()
        ];
        let date = dateValues.map(val => val.toString().padStart(2, '0')).join('/');
        let times = [
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
        ];
        times = times.map(val => val.toString().padStart(2, '0'));
        times.push(now.getMilliseconds().toString().padStart(3,'0'));
        let time = times.join(':');
        let timestamp = `${date} ${time}`;

        let text = this.category+': '+value;
        let classes = ['line'];
        let icon = '';
        switch (type) {
            case 'error':
                classes.push('error');
                icon = 'exclamation-circle';
                console.error(text);
                break;
            case 'warning':
                classes.push('warning');
                icon = 'exclamation-triangle';
                console.warn(text);
                break;
            case 'info':
                classes.push('info');
                icon = 'info-circle';
                console.info(text);
                break;
            default:
                console.log(text);
                break;
        }
        let output = `<span class="cell timestamp">${timestamp}</span>`;
        output += `<span class="cell icon">`;
        if (icon) {
            output += `<i class="fa fa-${icon}" aria-hidden="true"></i>`;
        }
        output += '</span>';
        output += `<span class="cell category"><span class="tag">${this.category}</span></span>`;
        output += `<span class="cell content">${value}</span>`;
        output = `<span class="${classes.join(' ')}">${output}</span>`;

        // Output log and keep scroll at bottom if already scrolled to bottom
        let scrollEl = this.logElementWrapper;
        let isScrolledToBottom = scrollEl[0].scrollHeight - scrollEl[0].clientHeight <= scrollEl[0].scrollTop + 1;
        this.logElement.append(output);
        if (isScrolledToBottom) {
            scrollEl.scrollTop(scrollEl[0].scrollHeight);
        }
    }
    clearLog() {
        this.logElement.text('');
    }
    showError(error, warning=false) {
        this.errors.push(error);
        let errorString = '';
        if (!(error instanceof Error) && error.message) {
            errorString = error.message;
        } else if (typeof error !== 'string') {
            errorString = error.toString();
        } else {
            errorString = 'Error: '+error;
        }
        this.log(errorString, warning ? 'warning' : 'error');
        if (debug && error instanceof Error) {
            console.error(error);
        }
    }
}

export const log = new Log();