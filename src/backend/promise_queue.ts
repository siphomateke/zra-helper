export default class PromiseQueue {
  activePromises: number = 0;

  lastPromiseStartTime: number | null = null;

  queue: Array<(value?: unknown) => void> = [];

  drainingQueue: boolean = false;

  /**
   * @param getMaxConcurrent
   * Function that returns the maximum number of promises that can be run at the same time.
   * @param getQueueDelay
   * Function that returns the delay between each promise running.
   */
  constructor(
    public getMaxConcurrent: () => number = () => 0,
    public getQueueDelay: () => number = () => 0,
  ) { }

  /**
   * Checks if a promise can be run.
   */
  slotFree(): boolean {
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
   */
  async add<R>(func: () => Promise<R>): Promise<R> {
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
