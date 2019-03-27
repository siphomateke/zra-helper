export default class PromiseQueue {
  /**
   * @param {() => number} getMaxConcurrent
   * Function that returns the maximum number of promises that can be run at the same time.
   * @param {() => number} getQueueDelay
   * Function that returns the delay between each promise running.
   */
  constructor(getMaxConcurrent = () => 0, getQueueDelay = () => 0) {
    this.getMaxConcurrent = getMaxConcurrent;
    this.getQueueDelay = getQueueDelay;
    this.activePromises = 0;
    this.lastPromiseStartTime = null;
    this.queue = [];
    this.drainingQueue = false;
  }

  /**
   * Checks if a promise can be run.
   * @returns {boolean}
   */
  slotFree() {
    const notMaxConcurrent = (
      this.getMaxConcurrent() === 0
      || this.activePromises < this.getMaxConcurrent()
    );
    const timeSinceLastPromise = Date.now() - this.lastPromiseStartTime;
    const delayLargeEnough = (
      this.lastPromiseStartTime === null
      || timeSinceLastPromise >= this.getQueueDelay()
    );
    return notMaxConcurrent && delayLargeEnough;
  }

  /**
   * Loops through pending promises and checks if they can be run.
   */
  drainQueue() {
    if (!this.drainingQueue) {
      this.drainingQueue = true;
      while (this.queue.length > 0 && this.slotFree()) {
        const callback = this.queue.shift();
        this.activePromises++;
        this.lastPromiseStartTime = Date.now();
        this.startDrainQueueTimer();
        callback();
      }
      this.drainingQueue = false;
    }
  }

  /**
   * Starts a timer that triggers `drainQueue()` after `getQueueDelay()`.
   */
  startDrainQueueTimer() {
    const delay = this.getQueueDelay();
    if (delay > 0) {
      setTimeout(() => {
        this.drainQueue();
      }, delay);
    }
  }

  waitForFreeSlot() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drainQueue();
    });
  }

  /**
   * Called after a promise has resolved or rejected.
   */
  promiseCompleted() {
    this.activePromises--;
    this.drainQueue();
  }

  /**
   * Adds a new promise to the queue and returns it's response when it completes.
   * @template R
   * @param {() => Promise<R>} func
   * @returns {Promise<R>}
   */
  async add(func) {
    await this.waitForFreeSlot();
    try {
      const response = await func();
      this.promiseCompleted();
      return response;
    } catch (error) {
      this.promiseCompleted();
      throw error;
    }
  }
}
