import cron from "node-cron";
import dotenv from "dotenv";
import { PRODUCTS_PER_DAY } from "../constants/index.js";

dotenv.config();

class TaskSchedulerService {
  #tasks;
  #mainTask;
  #schedule;
  #timezone;

  constructor(
    schedule = process.env.CRON_SCHEDULE,
    timezone = process.env.TIMEZONE
  ) {
    this.#tasks = [];
    this.#mainTask = null;
    this.#schedule = schedule;
    this.#timezone = timezone;
  }

  getTask(scrappingService) {
    return this.#tasks.includes(scrappingService) || null;
  }

  removeTask(scrappingService) {
    this.#tasks = this.#tasks.filter((t) => t !== scrappingService);
    console.log("Task removed!");
    console.log(this.#tasks);
    this.#manageCronJob();
  }

  addTask(scrappingService) {
    this.#tasks.push(scrappingService);
    console.log(`Task added!`);
    console.log(this.#tasks);
    this.#manageCronJob();
  }

  async #runTasksSequentially() {
    let remainingItems = PRODUCTS_PER_DAY;
    const taskCount = this.#tasks.length;

    for (let i = 0; i < taskCount; i++) {
      const count = Math.ceil(remainingItems / (taskCount - i));

      try {
        await this.#tasks[i](count);
      } catch (error) {
        console.error("CRAWLER ERROR! Check logs", error);
      }

      remainingItems -= count;
    }
  }

  #manageCronJob() {
    if (Object.keys(this.#tasks).length > 0) {
      if (!this.#mainTask) {
        this.#mainTask = cron.schedule(
          this.#schedule,
          async () => {
            await this.#runTasksSequentially();
          },
          {
            timezone: this.#timezone,
          }
        );
        this.#mainTask.start();
        console.log("Cron started!");
      }
    } else {
      if (this.#mainTask) {
        this.#mainTask.stop();
        this.#mainTask = null;
        console.log("Cron stopped!");
      }
    }
  }
}

export default TaskSchedulerService;
