import { amazonDataFetcher } from "./amazon/amazon.js";
import { cjDataFetcher } from "./cj.js";

export const CRAWLERS = {
  amazon: amazonDataFetcher,
  cj: cjDataFetcher,
};
