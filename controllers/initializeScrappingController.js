import { STATUS } from "../constants/index.js";
import { CRAWLERS } from "../crawlers/index.js";
import TaskSchedulerService from "../services/TaskSchedulerService.js";

const scrappingScheduler = new TaskSchedulerService();

export const initializeScrapping = (req, res) => {
  const { affiliateServices } = req.body;
  console.log(affiliateServices);

  const results = [];

  for (const service of affiliateServices) {
    if (!service.marketplace || !CRAWLERS.hasOwnProperty(service.marketplace)) {
      results.push({
        service,
        status: STATUS.error,
        message: `Scraping for ${
          service.marketplace || "unknown"
        } not provided!`,
      });
      continue;
    }

    const marketplace = service.marketplace;

    if (!service.status && scrappingScheduler.getTask(CRAWLERS[marketplace])) {
      scrappingScheduler.removeTask(CRAWLERS[marketplace]);
      results.push({
        service,
        status: STATUS.success,
        message: `Scraping for ${marketplace} stopped!`,
      });
      continue;
    } else if (
      service.status &&
      !scrappingScheduler.getTask(CRAWLERS[marketplace])
    ) {
      scrappingScheduler.addTask(CRAWLERS[marketplace]);
      results.push({
        service,
        status: STATUS.success,
        message: `Scraping for ${marketplace} started!`,
      });
    }
  }

  return res.status(200).json({
    status: STATUS.success,
    results,
  });
};
