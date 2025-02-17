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
    this.tasks = this.tasks.filter((t) => t !== task);
    console.log(`Task removed`);
    this.#manageCronJob();
  }

  addTask(scrappingService) {
    this.#tasks.push(scrappingService);
    console.log(`Task added!`);
    this.#manageCronJob();
  }

  async #runTasksSequentially() {
    const requiredScrappingItems = PRODUCTS_PER_DAY / this.#tasks.length;
    for (const task of this.#tasks) {
      try {
        await task(requiredScrappingItems);
      } catch (error) {
        console.error("CRAWLER ERROR! Check logs", error);
      }
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
