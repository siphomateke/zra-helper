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
};

// TODO: Add helper method to set error as status
export class Task {
  constructor(title, parentId = null) {
    this.title = title;
    this.parentId = parentId;
    this.hasParent = this.parentId !== null;
    this.parent = (this.hasParent) ? tasks[this.parentId] : null;
    this.children = [];
    this._status = '';
    this._progress = 0;
    this._progressMax = 100;
    /**
     * Whether the maximum progress of this task can be determined.
     *
     * This is used to determine this task's progress from it's sub-tasks
     * and is thus only used if it has sub-tasks.
     *
     * Only set this to false if the total number of sub-tasks that this
     * task can ever have and their maximum progress' are known.
     * If set to false then `progressMax` must also be set.
     */
    this.unknownMaxProgress = true;
    /**
     * Whether only one sub-task will be running at a time.
     */
    this.sequential = true;
    /** Whether this task will automatically update it's parent progress and status */
    this.autoUpdateParent = true;
    this._complete = false;
    // TODO: Use an enum for states
    this._state = '';
    /** The error this task encountered. */
    this.error = null;
    this.childStateCounts = {};

    /** HTML Elements */
    this.els = {
      root: $('<div class="task"></div>'),
      content: $('<div class="content"></div>'),
      header: $('<div class="header"></div>'),
      title: $(`<div class="title is-6">${this.title}</div>`),
      subtasksInfo: {
        root: $('<div class="subtasks-info"><span class="hidden item error"> <span class="icon"> <i class="fas fa-exclamation-circle"></i> </span> <span class="count"></span> </span> <span class="hidden item warning"> <span class="icon"> <i class="fas icon fa-exclamation-triangle"></i> </span> <span class="count"></span> </span> <span class="hidden item success"> <span class="icon"> <i class="fas icon fa-check-circle"></i> </span> <span class="count"></span> </span></div>'),
      },
      status: $('<div class="status"></div>'),
      progress: $(`<progress value="${this._progress}" max="${this._progressMax}"></progress>`),
      // TODO: Improve details button
      detailsButton: $('<button type="button" class="button open-details"><span class="icon"><i class="fas fa-caret-right closed-icon"></i><i class="fas fa-caret-down open-icon"></i></span>Details</button>'),
    };

    for (const state of Object.values(taskStates)) {
      this.els.subtasksInfo[state] = {};
      this.els.subtasksInfo[state].root = this.els.subtasksInfo.root.find(`.item.${state}`);
      this.els.subtasksInfo[state].count = this.els.subtasksInfo[state].root.find('.count');
    }

    if (this.hasParent) {
      this.els.root.addClass('sub-task');
      const parentEl = this.parent.els.root;
      let subTasks = parentEl.children('.sub-tasks');
      if (!subTasks.length) {
        subTasks = $('<div class="sub-tasks"></div>');
        parentEl.append(subTasks);
      }

      subTasks.append(this.els.root);
    } else {
      $('.tasks').append(this.els.root);
    }

    this.els.header.append(this.els.title);
    this.els.header.append(this.els.subtasksInfo.root);
    this.els.content.append(this.els.header);
    this.els.content.append(this.els.progress);
    this.els.content.append(this.els.status);

    this.els.root.append(this.els.content);

    this.status = this._status;
    this.id = lastTaskId;
    tasks[this.id] = this;
    if (this.hasParent) {
      this.parent.addChild(this.id);
    }
    lastTaskId++;

    this.tryRefresh();
  }

  get status() {
    return this._status;
  }

  /**
   * @param {string} value
   */
  set status(value) {
    this._status = value;
    if (this._status) {
      this.els.status.show();
    } else {
      this.els.status.hide();
    }
    this.els.status.text(this._status);
  }

  /**
   * Returns a status generated from this task's error.
   * @returns {string}
   */
  getStatusFromError() {
    if (this.error) {
      return this.error.message ? this.error.message : this.error.toString();
    }
    return null;
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

  /**
   * @param {number} value
   */
  set progress(value) {
    this._progress = value;
    this.refreshProgress();
    this.tryRefresh();
  }

  get progressMax() {
    return this._progressMax;
  }

  /**
   * @param {number} value
   */
  set progressMax(value) {
    this._progressMax = value;
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
    this.childStateCounts[state] = count;
    if (count > 0) {
      this.els.subtasksInfo[state].root.show();
      this.els.subtasksInfo[state].count.text(count);
    } else {
      this.els.subtasksInfo[state].root.hide();
    }
  }

  /**
   * Refresh progress based on sub-tasks
   */
  refresh() {
    let progress = 0;
    let progressMax = 0;
    let complete = true;
    // Get the number of sub tasks that have a particular state and
    // calculate progress and progressMax from sub tasks
    const stateCounts = {};
    for (const taskId of this.children) {
      const task = tasks[taskId];
      if (task.state) {
        if (!stateCounts[task.state]) stateCounts[task.state] = 0;
        stateCounts[task.state]++;
      }
      if (!task.complete) {
        complete = false;
      }
      if (this.unknownMaxProgress) {
        // If task execution sequential, change this tasks maximum
        // and total progress on the fly.
        if (!this.sequential) {
          progress += task.progress;
          progressMax += task.progressMax;
          // Otherwise, use the first uncompleted task as the current task.
        } else if (!task.complete) {
          progress = task.progress;
          progressMax = task.progressMax;
          break;
        }
      } else {
        progress += task.progress / task.progressMax;
      }
    }
    if (!complete) {
      if (this.unknownMaxProgress) {
        this.progressMax = progressMax;
      }
      this.progress = progress;
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
  }

  tryRefresh() {
    if (this.autoUpdateParent && this.hasParent) {
      this.parent.refresh();
    }
  }

  get complete() {
    return this._complete;
  }

  /**
   * @param {boolean} value
   */
  set complete(value) {
    this._complete = value;
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

  /**
   * @param {string} value
   */
  set state(value) {
    if (Object.values(taskStates).includes(value)) {
      this._state = value;
      this.els.root.removeClass(taskStates.ERROR);
      this.els.root.removeClass(taskStates.SUCCESS);
      if (this._state) {
        this.els.root.addClass(this._state);
      }

      this.tryRefresh();
    } else {
      throw new Error(`State must be one of the following: ${Object.values(taskStates).join(', ')}`);
    }
  }

  /**
   * Determines this task's state from it's children.
   * - all children error then error
   * - any child error then warning
   * - else success
   */
  getStateFromChildren() {
    let state;
    if (this.childStateCounts[taskStates.ERROR] === this.children.length) {
      state = taskStates.ERROR;
    } else if (this.childStateCounts[taskStates.ERROR] > 0) {
      state = taskStates.WARNING;
    } else {
      state = taskStates.SUCCESS;
    }
    return state;
  }

  /**
   * Sets this task's error, state and status
   * @param {any} error
   */
  setError(error) {
    this.state = taskStates.ERROR;
    this.error = error;
    this.status = this.getStatusFromError();
  }

  /**
   * Adds a sub-task to this task
   * @param {number} id The ID of the sub task
   */
  addChild(id) {
    if (this.children.length === 0) {
      this.els.content.append(this.els.detailsButton);
    }
    this.children.push(id);
  }

  getChildren() {
    return this.children.map(id => tasks[id]);
  }

  /**
   * Increments progress and sets status
   *
   * @param {string} status
   * @param {number} increment
   */
  addStep(status, increment = 1) {
    this.progress += increment;
    this.status = status;
  }
}

$(document).on('click', '.task .open-details', (e) => {
  const target = $(e.currentTarget);
  target.closest('.task').toggleClass('open');
});
