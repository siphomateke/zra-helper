import $ from 'jquery';

/** @type {Object.<string, Task>} */
const tasks = {};
let lastTaskId = 0;

/**
 * All the states a task can have
 * @readonly
 * @enum {string}
 */
export const taskStates = {
    ERROR: 'error',
    SUCCESS: 'success',
    WARNING: 'warning',
}

export class Task {
    constructor(title, parentId=null) {
        this.title = title;
        this.parentId = parentId;
        this.hasParent = this.parentId !== null;
        this.parent = (this.hasParent) ? tasks[this.parentId] : null;
        this.children = [];
        this._status = '';

        this._progress = -2;
        this._progressMax = 100;
        /** Whether this task's state affects its parent's state */
        this.broadcastState = true;
        /** Whether this task will automatically update it's parent progress and status */
        this.autoUpdateParent = true;

        this._complete = false;
        // TODO: Use an enum for states
        this._state = '';

        /** HTML Elements */
        this.els = {
            root: $(`<div class="task"></div>`),
            content: $('<div class="content"></div>'),
            header: $('<div class="header"></div>'),
            title: $(`<div class="title">${this.title}</div>`),
            subtasksInfo: {
                root: $('<div class="subtasks-info"><span class="hidden item error"><i class="fa icon fa-exclamation-circle"></i> <span class=count></span> </span><span class="hidden item warning"><i class="fa icon fa-exclamation-triangle"></i> <span class=count></span> </span><span class="hidden item success"><i class="fa icon fa-check-circle"></i> <span class=count></span></span></div>'),
            },
            status: $('<div class="status"></div>'),
            progress: $(`<progress value="${this._progress}" max="${this._progressMax}"></progress>`),
            // TODO: Improve details button
            detailsButton: $('<button type="button" class="open-details"><i class="fa fa-caret-right closed-icon"></i><i class="fa fa-caret-down open-icon"></i>Details</button>'),
        };

        for (const state of Object.values(taskStates)) {
            this.els.subtasksInfo[state] = {};
            this.els.subtasksInfo[state].root = this.els.subtasksInfo.root.find(`.item.${state}`);
            this.els.subtasksInfo[state].count = this.els.subtasksInfo[state].root.find('.count');
        }

        if (this.hasParent) {
            /* this.els.root.removeClass('task'); */
            this.els.root.addClass('sub-task');
            const parentEl = this.parent.els.root;
            let subTasks = parentEl.find('.sub-tasks');
            if (!subTasks.length) {
                subTasks = $('<div class="sub-tasks"></div>')
                parentEl.append(subTasks);
            }

            subTasks.append(this.els.root);
            this.parent.els.detailsButton.show();
        } else {
            $('.tasks').append(this.els.root);
        }

        this.els.header.append(this.els.title);
        this.els.header.append(this.els.subtasksInfo.root);
        this.els.content.append(this.els.header);
        this.els.content.append(this.els.progress);
        this.els.content.append(this.els.status);
        if (!this.hasParent) {
            this.els.content.append(this.els.detailsButton);
            this.els.detailsButton.hide();
        }

        this.els.root.append(this.els.content);

        this.status = this._status;
        this.id = lastTaskId;
        tasks[this.id] = this;
        if (this.hasParent) {
            this.parent.addChild(this.id);
        }
        lastTaskId++;
    }
    get status() {
        return this._status;
    }
    set status(status) {
        this._status = status;
        if (this._status) {
            this.els.status.show();
        } else {
            this.els.status.hide();
        }
        this.els.status.text(this._status);
    }
    refreshProgress() {
        if (this._progress !== -2) {
            this.els.progress.removeClass('hidden');
        }
        if (this._progress === -1) {
            this.els.progress.removeAttr('value');
        } else {
            this.els.progress.val(this._progress);
        }
    }
    get progress() {
        return this._progress;
    }
    set progress(progress)  {
        this._progress = progress;
        this.refreshProgress();

        if (this.autoUpdateParent && this.hasParent) {
            this.parent.refresh();
        }
    }
    get progressMax() {
        return this._progressMax;
    }
    set progressMax(max) {
        this._progressMax = max;
        this.els.progress.attr('max', this._progressMax);
    }
    /**
     * Sets the number of sub tasks that have a particular state.
     * 
     * @param {string} state 
     * @param {number} count 
     */
    // TODO: Call sub-tasks children
    setSubtasksStateCount(state, count) {
        if (count > 0) {
            this.els.subtasksInfo[state].root.show();
            this.els.subtasksInfo[state].count.text(count);
        } else {
            this.els.subtasksInfo[state].root.hide();
        }
    }
    refresh() {
        this.progress = 0;
        this.progressMax = 0;
        let complete = true;
        // Get the number of sub tasks that have a particular state
        const stateCounts = {};
        for (const taskId of this.children) {
            const task = tasks[taskId];
            this.progress += task.progress;
            this.progressMax += task.progressMax;
            if (task.state) {
                if (!stateCounts[task.state]) stateCounts[task.state] = 0;
                stateCounts[task.state]++;
            }
            if (!task.complete) {
                complete = false;
            }
        }
        // Show the number of sub-tasks that have a particular state
        const stateStrings = [];
        for (const state of Object.keys(stateCounts)) {
            const count = stateCounts[state];
            this.setSubtasksStateCount(state, count);
            stateStrings.push(`${count} ${state}(s)`);
        }
        // TODO: Store the state counts and use them to set this
        this.els.subtasksInfo.root.attr('title', stateStrings.join(', '));
        this.complete = complete;
    }
    get complete() {
        return this._complete;
    }
    set complete(complete) {
        this._complete = complete;
        if (this._complete) {
            this.progress = this.progressMax;
            this.els.root.addClass('complete');
        } else {
            this.els.root.removeClass('complete');
        }
    }
    get state() {
        return this._state;
    }
    set state(state) {
        if (Object.values(taskStates).includes(state)) {
            this._state = state;
            this.els.root.removeClass(taskStates.ERROR);
            this.els.root.removeClass(taskStates.SUCCESS);
            if (this._state) {
                this.els.root.addClass(this._state);
            }

            if (this.autoUpdateParent && this.hasParent) {
                this.parent.refresh();
            }
        } else {
            throw new Error(`State must be one of the following: ${Object.values(taskStates).join(', ')}`);
        }
    }
    addChild(id) {
        this.children.push(id);
    }
    /**
     * Increments progress and sets status
     * 
     * @param {string} status 
     */
    addStep(status) {
        this.progress++;
        this.status = status;
    }
}

$(document).on('click', '.task .open-details', (e) => {        
    const target = $(e.currentTarget);
    target.closest('.task').toggleClass('open');
});