import { STATUS } from "../constants/index.js";
import { CRAWLERS } from "../crawlers/index.js";
import TaskSchedulerService from "../services/TaskSchedulerService.js";

const scrappingScheduler = new TaskSchedulerService();

export const initializeScrapping = (req, res) => {
  const { affiliateServices } = req.body;

  const results = [];

  for (const service of affiliateServices) {
    if (!CRAWLERS[service.marketplace]) {
      results.push({
        service,
        status: STATUS.error,
        message: `Scrapping for ${service.marketplace} not provided!`,
      });
      continue;
    }

    if (!service.status && CRAWLERS[service.marketplace]) {
      scrappingScheduler.removeTask(CRAWLERS[service.marketplace]);
      results.push({
        service,
        status: STATUS.success,
        message: `Scraping for ${service.marketplace} stopped!`,
      });
      continue;
    }

    scrappingScheduler.addTask(CRAWLERS[service.marketplace]);
    results.push({
      service,
      status: STATUS.success,
      message: `Scraping for ${service.marketplace} started!`,
    });
  }

  return res.status(200).json({
    status: STATUS.success,
    results,
  });
};
