import { STATUS } from "../constants/index.js";
import { CRAWLERS } from "../crawlers/index.js";
import TaskSchedulerService from "../services/TaskSchedulerService.js";

const scrappingScheduler = new TaskSchedulerService();

export const initializeScrapping = (req, res) => {
  const { affiliateServices } = req.body;

  const results = [];

  scrappingScheduler.removeAllTasks();

  affiliateServices.map((service) => {
    if (!CRAWLERS[service]) {
      results.push({
        service,
        status: STATUS.error,
        message: `Scrapping for ${service} not provide!`,
      });
      return;
    }

    scrappingScheduler.addTask(CRAWLERS[service]);
    results.push({
      service,
      status: STATUS.success,
      message: `Scraping for ${service} started!`,
    });
  });

  return res.status(200).json({
    status: STATUS.success,
    results,
  });
};

// export const removeUrl = (req, res) => {
//   const { location } = req.body;

//   if (!location) {
//     return res.status(400).json({
//       status: STATUS.error,
//       message: `Required filed is not provided!`,
//     });
//   }

//   if (scrappingScheduler.tasks[location]) {
//     scrappingScheduler.removeUrl(location);
//     return res.status(200).json({
//       status: STATUS.success,
//       message: `Scraping for ${location} was stopped!`,
//     });
//   } else {
//     return res.status(400).json({
//       status: STATUS.error,
//       message: `Scraping for ${location} was already removed!`,
//     });
//   }
// };
